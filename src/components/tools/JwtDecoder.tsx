import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { KeyRound } from "lucide-react";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import {
  decodeJwt,
  getJwtExpirationDate,
  getJwtIssuedAtDate,
  verifyJwtSignature,
  type JwtVerifyResult,
} from "@/utils/jwt";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What is a JWT?",
    a: "A JSON Web Token is a compact string with a header, payload, and signature. It is commonly used to carry claims between applications and APIs.",
  },
  {
    q: "Does decoding a JWT prove it is authentic?",
    a: "No. Decoding only reveals the token contents. To check the signature, enter the secret for an HS256, HS384, or HS512 token. For other algorithms, verify the signature with the correct public key on your server.",
  },
  {
    q: "Are JWTs encrypted by default?",
    a: "No. Most JWTs are only base64url-encoded, so their contents are easy to inspect. Signed tokens protect integrity, not confidentiality.",
  },
  {
    q: "What does this tool actually validate?",
    a: "This tool decodes the token locally and checks whether the `exp` claim is already in the past. For HS256, HS384, and HS512 tokens it also checks the signature against the secret you enter. It does not support RS*, ES*, or `none` tokens. It does not check issuer, audience, or key trust. The secret stays on your device.",
  },
];

const PLACEHOLDER =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";


/** A short distance such as "2 h" or "3 d" between now and a date. */
const formatDistance = (ms: number) => {
  const seconds = Math.round(Math.abs(ms) / 1000);
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  if (seconds < 86400 * 365) return `${Math.round(seconds / 86400)} d`;
  return `${Math.round(seconds / (86400 * 365))} y`;
};

const formatTimestamp = (date: Date | null, rawValue?: number) =>
  !date || rawValue === undefined ? "" : `${date.toLocaleString()} (${rawValue})`;

const VERIFY_TONE: Record<JwtVerifyResult["status"], string> = {
  valid: "text-success",
  invalid: "text-destructive",
  unsupported: "text-warning",
  error: "text-destructive",
};

export function JwtDecoder() {
  const [input, setInput] = useState("");
  const [secret, setSecret] = useState("");
  const [secretIsBase64, setSecretIsBase64] = useState(false);
  const [verify, setVerify] = useState<JwtVerifyResult | null>(null);
  const token = useDebouncedValue(input);
  const debouncedSecret = useDebouncedValue(secret);

  const decoded = useMemo(() => (token.trim() ? decodeJwt(token) : null), [token]);
  const valid = decoded && !decoded.error ? decoded : null;

  useEffect(() => {
    if (!valid) {
      setVerify(null);
      return;
    }
    const alg = typeof valid.header.alg === "string" ? valid.header.alg : "";
    if (!debouncedSecret && /^HS(256|384|512)$/.test(alg)) {
      setVerify(null);
      return;
    }
    let cancelled = false;
    verifyJwtSignature(token, debouncedSecret, { secretIsBase64 }).then((result) => {
      if (!cancelled) setVerify(result);
    });
    return () => {
      cancelled = true;
    };
  }, [valid, token, debouncedSecret, secretIsBase64]);

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

  const renderRow = (key: string, label: string, value: string) => (
    <div key={key} className="result-row">
      <span className="result-row-label">{label}</span>
      <span className="result-row-value">{value}</span>
      <CopyButton value={value} iconOnly label={`Copy ${label}`} />
    </div>
  );

  const expirationDate = valid ? getJwtExpirationDate(valid) : null;
  const issuedAtDate = valid ? getJwtIssuedAtDate(valid) : null;
  const notBeforeDate = valid?.payload.nbf ? new Date(valid.payload.nbf * 1000) : null;
  const hasTimestamps = Boolean(valid && (valid.payload.iat || valid.payload.exp || valid.payload.nbf));

  const expiryStatus = !valid
    ? null
    : !expirationDate
    ? { label: "No exp claim", className: "text-warning" }
    : valid.isExpired
    ? { label: `Expired ${formatDistance(Date.now() - expirationDate.getTime())} ago`, className: "text-destructive" }
    : { label: `Expires in ${formatDistance(expirationDate.getTime() - Date.now())}`, className: "text-success" };

  return (
    <ToolWorkspace
      id="jwt-decoder"
      toolbar={
        <>
          <label htmlFor="jwt-secret" className="text-xs text-muted-foreground">Secret</label>
          <Input
            id="jwt-secret"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="your-256-bit-secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="h-7 w-56 font-mono text-xs"
          />
          <label className="option-switch indent-control" htmlFor="jwt-secret-base64">
            Base64 secret
            <Switch id="jwt-secret-base64" checked={secretIsBase64} onCheckedChange={setSecretIsBase64} />
          </label>
        </>
      }
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
        </EditorPane>
      }
      second={
        <EditorPane title="Decoded">
          {valid ? (
            <div className="result-list">
              {renderJson(valid.header, "Header")}
              {renderJson(valid.payload, "Payload")}
              {renderRow("signature", "Signature", valid.signature)}
              {hasTimestamps && (
                <>
                  {renderRow("iat", "Issued at (iat)", formatTimestamp(issuedAtDate, valid.payload.iat))}
                  {renderRow("exp", "Expires at (exp)", formatTimestamp(expirationDate, valid.payload.exp))}
                  {renderRow("nbf", "Not before (nbf)", formatTimestamp(notBeforeDate, valid.payload.nbf))}
                </>
              )}
            </div>
          ) : (
            <PaneEmpty
              icon={<KeyRound size={20} aria-hidden="true" />}
              title="Paste a JWT to decode it"
              hint="The header, payload, and claims appear here as you type."
            />
          )}
        </EditorPane>
      }
      status={
        valid && expiryStatus ? (
          <>
            {valid.header.alg && <span>{String(valid.header.alg)}</span>}
            <span className={expiryStatus.className}>{expiryStatus.label}</span>
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
