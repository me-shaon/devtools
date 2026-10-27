import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KeyRound, PenLine } from "lucide-react";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import {
  JWT_ALGORITHMS,
  decodeJwt,
  defaultJwtPayload,
  derivePublicKey,
  describeTimeClaims,
  generateJwtKeyPair,
  isAsymmetricAlgorithm,
  refreshTimeClaims,
  setHeaderAlgorithm,
  signJwt,
  verifyJwtSignature,
  type JwtTimeState,
  type JwtVerifyResult,
} from "@/utils/jwt";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What is a JWT?",
    a: "A JSON Web Token is a compact string with a header, payload, and signature. It is commonly used to carry claims between applications and APIs.",
  },
  {
    q: "Does decoding a JWT prove it is authentic?",
    a: "No. Decoding only reveals the token contents. Enter the key to check the signature. HS256, HS384, and HS512 tokens use the shared secret. RS*, PS*, ES*, and EdDSA tokens use the public key of the issuer.",
  },
  {
    q: "Which key formats can I use to verify?",
    a: "For HS* tokens, enter the secret as text or as Base64. For the other algorithms, paste a PEM public key, an X.509 certificate, a JWK, or a JWKS. With a JWKS, the tool picks the key that matches the `kid` in the token header. If the token has no `kid`, the tool tries each key that fits the algorithm.",
  },
  {
    q: "How do I create a test token?",
    a: "Open the Encode tab, or select Edit and sign on a decoded token. Edit the header and payload as JSON, and the token updates as you type. HS* tokens use a secret. Other algorithms use a PEM (PKCS#8, PKCS#1, or SEC1) or JWK private key. Select Generate key pair to make a new one. The matching public key appears under the token.",
  },
  {
    q: "How are exp, nbf, and iat shown?",
    a: "The tool shows each time claim in your local time, with the distance from now. The status shows whether the token is valid now, expired, or not valid yet. A warning appears when a value looks like milliseconds, because JWT times are in seconds.",
  },
  {
    q: "Are JWTs encrypted by default?",
    a: "No. Most JWTs are only base64url-encoded, so their contents are easy to inspect. Signed tokens protect integrity, not confidentiality.",
  },
  {
    q: "What does this tool actually validate?",
    a: "This tool checks the signature with the key you enter, and checks `exp` and `nbf` against your clock. It does not check issuer, audience, or key trust. It never fetches a JWKS URL. Your tokens and keys stay on your device.",
  },
];

const PLACEHOLDER =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const DEFAULT_HEADER = JSON.stringify({ alg: "HS256", typ: "JWT" }, null, 2);

const VERIFY_TONE: Record<JwtVerifyResult["status"], string> = {
  valid: "text-success",
  invalid: "text-destructive",
  unsupported: "text-warning",
  error: "text-destructive",
};

const TIME_TONE: Record<JwtTimeState, string> = {
  active: "text-success",
  expired: "text-destructive",
  "not-yet-valid": "text-warning",
  "no-expiry": "text-warning",
};

type Mode = "decode" | "encode";

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** The current time, updated every second while `active` is true, so relative times stay correct. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** Parses JSON text that must hold an object, for the encoder fields. */
function parseObject(text: string, name: string): { value?: Record<string, unknown>; error?: string } {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: `${name} must be a JSON object.` };
    return { value };
  } catch (error) {
    return { error: `${name} is not valid JSON: ${(error as Error).message}` };
  }
}

/** A labeled block inside a pane, such as the key field under the token. */
function PaneSection({ label, htmlFor, actions, grow, children }: { label: string; htmlFor?: string; actions?: ReactNode; grow?: boolean; children: ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col border-t border-border/50 first:border-t-0 ${grow ? "flex-1" : "flex-none"}`}>
      <div className="flex items-center justify-between gap-2 px-4 pt-2">
        <label htmlFor={htmlFor} className="result-row-label">{label}</label>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

function SecretField({ id, value, onChange, base64, onBase64Change }: { id: string; value: string; onChange: (v: string) => void; base64: boolean; onBase64Change: (v: boolean) => void }) {
  return (
    <PaneSection
      label="Secret"
      htmlFor={id}
      actions={
        <label className="option-switch" htmlFor={`${id}-base64`}>
          Base64 secret
          <Switch id={`${id}-base64`} checked={base64} onCheckedChange={onBase64Change} />
        </label>
      }
    >
      <div className="px-4 pb-3 pt-1">
        <Input
          id={id}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="your-256-bit-secret"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-full font-mono text-xs"
        />
      </div>
    </PaneSection>
  );
}

function KeyField({ id, label, value, onChange, placeholder, actions }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string; actions?: ReactNode }) {
  return (
    <PaneSection label={label} htmlFor={id} actions={actions}>
      <CodeTextarea id={id} className="h-28 !flex-none" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </PaneSection>
  );
}

export function JwtDecoder() {
  const [mode, setMode] = useState<Mode>("decode");

  // Decode
  const [input, setInput] = useState("");
  const [secret, setSecret] = useState("");
  const [secretIsBase64, setSecretIsBase64] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [verify, setVerify] = useState<JwtVerifyResult | null>(null);
  const token = useDebouncedValue(input);
  const debouncedSecret = useDebouncedValue(secret);
  const debouncedPublicKey = useDebouncedValue(publicKey);

  // Encode
  const [headerText, setHeaderText] = useState(DEFAULT_HEADER);
  const [payloadText, setPayloadText] = useState(() => defaultJwtPayload(nowSeconds()));
  const [signSecret, setSignSecret] = useState("");
  const [signSecretIsBase64, setSignSecretIsBase64] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [signed, setSigned] = useState<{ token?: string; error?: string } | null>(null);
  const [derived, setDerived] = useState<{ pem: string; jwk: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const debouncedHeader = useDebouncedValue(headerText);
  const debouncedPayload = useDebouncedValue(payloadText);
  const debouncedSignSecret = useDebouncedValue(signSecret);
  const debouncedPrivateKey = useDebouncedValue(privateKey);

  const decoded = useMemo(() => (token.trim() ? decodeJwt(token) : null), [token]);
  const valid = decoded && !decoded.error ? decoded : null;
  const alg = valid && typeof valid.header.alg === "string" ? valid.header.alg : "";
  const asymmetric = isAsymmetricAlgorithm(alg);
  const verifyKey = asymmetric ? debouncedPublicKey : debouncedSecret;
  const now = useNow(Boolean(valid) && mode === "decode");
  const time = valid ? describeTimeClaims(valid.payload, now) : null;

  useEffect(() => {
    if (!valid) {
      setVerify(null);
      return;
    }
    // Without a key there is nothing to check. Unsigned and unknown algorithms still report why.
    if (!verifyKey && (asymmetric || /^HS(256|384|512)$/.test(alg))) {
      setVerify(null);
      return;
    }
    let cancelled = false;
    verifyJwtSignature(token, verifyKey, { secretIsBase64 }).then((result) => {
      if (!cancelled) setVerify(result);
    });
    return () => {
      cancelled = true;
    };
  }, [valid, token, alg, asymmetric, verifyKey, secretIsBase64]);

  const header = useMemo(() => parseObject(debouncedHeader, "Header"), [debouncedHeader]);
  const payload = useMemo(() => parseObject(debouncedPayload, "Payload"), [debouncedPayload]);
  const signAlg = typeof header.value?.alg === "string" ? header.value.alg : "";
  const signAsymmetric = isAsymmetricAlgorithm(signAlg);
  const signKey = signAsymmetric ? debouncedPrivateKey : debouncedSignSecret;
  const liveSignAlg = (() => {
    const parsed = parseObject(headerText, "Header").value?.alg;
    return typeof parsed === "string" ? parsed : "";
  })();

  useEffect(() => {
    if (header.error || payload.error || !signKey.trim()) {
      setSigned(header.error || payload.error ? { error: header.error ?? payload.error } : null);
      return;
    }
    let cancelled = false;
    signJwt(header.value!, payload.value!, signKey, { secretIsBase64: signSecretIsBase64 }).then(
      (tokenText) => !cancelled && setSigned({ token: tokenText }),
      (error: Error) => !cancelled && setSigned({ error: error.message })
    );
    return () => {
      cancelled = true;
    };
  }, [header, payload, signKey, signSecretIsBase64]);

  const kid = typeof header.value?.kid === "string" ? header.value.kid : undefined;
  useEffect(() => {
    if (!signAsymmetric || !debouncedPrivateKey.trim()) {
      setDerived(null);
      return;
    }
    let cancelled = false;
    derivePublicKey(signAlg, debouncedPrivateKey, { kid }).then(
      (result) => !cancelled && setDerived({ pem: result.pem, jwk: JSON.stringify(result.jwk, null, 2) }),
      () => !cancelled && setDerived(null)
    );
    return () => {
      cancelled = true;
    };
  }, [signAsymmetric, signAlg, debouncedPrivateKey, kid]);

  const editAndSign = () => {
    if (!valid) return;
    setHeaderText(JSON.stringify(valid.header, null, 2));
    setPayloadText(JSON.stringify(valid.payload, null, 2));
    if (!asymmetric && secret) {
      setSignSecret(secret);
      setSignSecretIsBase64(secretIsBase64);
    }
    setMode("encode");
  };

  const openInDecoder = () => {
    if (!signed?.token) return;
    setInput(signed.token);
    if (signAsymmetric) {
      if (derived) setPublicKey(derived.pem);
    } else {
      setSecret(signSecret);
      setSecretIsBase64(signSecretIsBase64);
    }
    setMode("decode");
  };

  const generateKeyPair = async () => {
    setGenerating(true);
    try {
      setPrivateKey((await generateJwtKeyPair(liveSignAlg)).privateKeyPem);
    } catch (error) {
      setSigned({ error: (error as Error).message });
    } finally {
      setGenerating(false);
    }
  };

  const renderJson = (obj: Record<string, unknown>, title: string) => {
    const json = JSON.stringify(obj, null, 2);
    return (
      <section className="border-b border-border/50" aria-label={title}>
        <div className="flex items-center justify-between px-4 pt-2">
          <span className="result-row-label">{title}</span>
          <CopyButton value={json} iconOnly label={`Copy ${title.toLowerCase()}`} />
        </div>
        <pre className="overflow-x-auto px-4 pb-3 pt-1 font-mono text-sm leading-[22px]">
          <code>{json}</code>
        </pre>
      </section>
    );
  };

  const renderRow = (key: string, label: string, value: ReactNode, copyValue: string, extra?: ReactNode) => (
    <div key={key} className="result-row">
      <span className="result-row-label">{label}</span>
      <span className="result-row-value">
        {value}
        {extra}
      </span>
      <CopyButton value={copyValue} iconOnly label={`Copy ${label}`} />
    </div>
  );

  const modeTabs = (
    <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
      <TabsList aria-label="Mode">
        <TabsTrigger value="decode">Decode</TabsTrigger>
        <TabsTrigger value="encode">Encode</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (mode === "encode") {
    const algValue = (JWT_ALGORITHMS as readonly string[]).includes(liveSignAlg) ? liveSignAlg : "";
    const liveAsymmetric = isAsymmetricAlgorithm(liveSignAlg);
    const missingKey = !signed && !header.error && !payload.error;
    return (
      <ToolWorkspace
        id="jwt-decoder"
        toolbar={
          <>
            {modeTabs}
            <label className="indent-control">
              Algorithm
              <select aria-label="Algorithm" value={algValue} onChange={(e) => setHeaderText(setHeaderAlgorithm(headerText, e.target.value))}>
                {!algValue && <option value="">{liveSignAlg || "Choose"}</option>}
                {JWT_ALGORITHMS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <button type="button" className="toolbar-text-button indent-control" onClick={() => setPayloadText(refreshTimeClaims(payloadText, nowSeconds()))}>
              Refresh iat and exp
            </button>
          </>
        }
        notice={
          signed?.error ? (
            <div className="workspace-notice" data-tone="error" role="alert">{signed.error}</div>
          ) : undefined
        }
        first={
          <EditorPane title="Claims" scroll={false}>
            <PaneSection label="Header" htmlFor="jwt-header">
              <CodeTextarea id="jwt-header" aria-label="Header JSON" className="h-28 !flex-none" value={headerText} onChange={(e) => setHeaderText(e.target.value)} />
            </PaneSection>
            <PaneSection label="Payload" htmlFor="jwt-payload" grow>
              <CodeTextarea id="jwt-payload" aria-label="Payload JSON" value={payloadText} onChange={(e) => setPayloadText(e.target.value)} />
            </PaneSection>
            {liveAsymmetric ? (
              <KeyField
                id="jwt-private-key"
                label="Private key"
                value={privateKey}
                onChange={setPrivateKey}
                placeholder="-----BEGIN PRIVATE KEY----- (PKCS#8, PKCS#1, SEC1, or a JWK)"
                actions={
                  <button type="button" className="toolbar-text-button" onClick={generateKeyPair} disabled={generating}>
                    {generating ? "Generating…" : "Generate key pair"}
                  </button>
                }
              />
            ) : (
              <SecretField id="jwt-sign-secret" value={signSecret} onChange={setSignSecret} base64={signSecretIsBase64} onBase64Change={setSignSecretIsBase64} />
            )}
          </EditorPane>
        }
        second={
          <EditorPane
            title="Token"
            actions={
              signed?.token ? (
                <>
                  <button type="button" className="toolbar-text-button" onClick={openInDecoder}>Decode</button>
                  <CopyButton value={signed.token} label="Copy token" />
                </>
              ) : undefined
            }
          >
            {signed?.token ? (
              <div className="result-list">
                <pre className="whitespace-pre-wrap break-all border-b border-border/50 px-4 py-3 font-mono text-sm leading-[22px]" aria-label="Signed token">
                  <code>{signed.token}</code>
                </pre>
                {signAsymmetric && derived && (
                  <>
                    <section className="border-b border-border/50" aria-label="Public key">
                      <div className="flex items-center justify-between px-4 pt-2">
                        <span className="result-row-label">Public key (PEM)</span>
                        <CopyButton value={derived.pem} iconOnly label="Copy public key" />
                      </div>
                      <pre className="overflow-x-auto px-4 pb-3 pt-1 font-mono text-xs leading-[18px]"><code>{derived.pem}</code></pre>
                    </section>
                    <section className="border-b border-border/50" aria-label="Public JWK">
                      <div className="flex items-center justify-between px-4 pt-2">
                        <span className="result-row-label">Public JWK</span>
                        <CopyButton value={derived.jwk} iconOnly label="Copy public JWK" />
                      </div>
                      <pre className="overflow-x-auto px-4 pb-3 pt-1 font-mono text-xs leading-[18px]"><code>{derived.jwk}</code></pre>
                    </section>
                  </>
                )}
              </div>
            ) : (
              <PaneEmpty
                icon={<PenLine size={20} aria-hidden="true" />}
                title={missingKey ? (liveAsymmetric ? "Enter or generate a private key" : "Enter a secret to sign the token") : "Fix the error to sign the token"}
                hint="The signed token updates as you edit the header, payload, and key."
              />
            )}
          </EditorPane>
        }
        status={
          <>
            {liveSignAlg && <span>{liveSignAlg}</span>}
            <span>{signed?.token ? `${signed.token.length} characters` : "Not signed"}</span>
          </>
        }
        help={<ToolFaqSection items={FAQ_ITEMS} />}
      />
    );
  }

  return (
    <ToolWorkspace
      id="jwt-decoder"
      toolbar={modeTabs}
      notice={
        decoded?.error ? (
          <div className="workspace-notice" data-tone="error" role="alert">{decoded.error}</div>
        ) : undefined
      }
      first={
        <EditorPane title="Token" htmlFor="jwt-input" scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}>
          <CodeTextarea
            id="jwt-input"
            className="break-all"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={PLACEHOLDER}
          />
          {valid && alg !== "none" && (asymmetric ? (
            <KeyField
              id="jwt-public-key"
              label="Public key"
              value={publicKey}
              onChange={setPublicKey}
              placeholder="PEM public key, certificate, JWK, or JWKS"
            />
          ) : (
            <SecretField id="jwt-secret" value={secret} onChange={setSecret} base64={secretIsBase64} onBase64Change={setSecretIsBase64} />
          ))}
        </EditorPane>
      }
      second={
        <EditorPane
          title="Decoded"
          actions={valid ? <button type="button" className="toolbar-text-button" onClick={editAndSign}>Edit and sign</button> : undefined}
        >
          {valid && time ? (
            <div className="result-list">
              <div className="result-row">
                <span className="result-row-label">Status</span>
                <span className={`result-row-value ${TIME_TONE[time.state]}`}>{time.summary}</span>
                <span />
              </div>
              {time.claims.map((claim) =>
                renderRow(
                  claim.claim,
                  claim.label,
                  claim.date ? `${claim.date.toLocaleString()} (${claim.relative})` : String(claim.value),
                  String(claim.value),
                  claim.warning && <span className="block text-warning">{claim.warning}</span>
                )
              )}
              {renderJson(valid.header, "Header")}
              {renderJson(valid.payload, "Payload")}
              {renderRow("signature", "Signature", valid.signature, valid.signature)}
            </div>
          ) : (
            <PaneEmpty
              icon={<KeyRound size={20} aria-hidden="true" />}
              title="Paste a JWT to decode it"
              hint="The claims, the expiry, and the signature check appear here as you type."
            />
          )}
        </EditorPane>
      }
      status={
        valid && time ? (
          <>
            {alg && <span>{alg}</span>}
            <span className={TIME_TONE[time.state]}>{time.summary}</span>
            <span role="status" className={verify ? VERIFY_TONE[verify.status] : undefined}>
              {verify ? verify.message : "Signature not checked"}
            </span>
          </>
        ) : (
          <span>{decoded?.error ? "Invalid token" : "Ready"}</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
