import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, KeySquare, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { saveFile } from "@/lib/desktop";
import {
  KEY_TYPES,
  KeyInputError,
  buildKeyOutputs,
  generateKeyPair,
  jwkAlgorithms,
  jwkUses,
  readKey,
  sshFileStem,
  type JwkUse,
  type KeyOutputs,
  type KeyType,
  type ReadKeyResult,
} from "@/utils/key-generator";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which key type should I choose?",
    a: "Choose Ed25519 for SSH keys and new systems. The keys are short and fast. Choose ECDSA P-256 when a system does not accept Ed25519, for example some JWT libraries. Choose RSA 3072 or 4096 only for systems that accept nothing else.",
  },
  {
    q: "Is an RSA key for signing or for encryption?",
    a: "Both. RSA signing (RS256, PS256) and RSA-OAEP encryption use the same key material. Set use and alg to record the purpose in the JWK.",
  },
  {
    q: "How do I use the key with SSH?",
    a: "Save the OpenSSH private key as ~/.ssh/id_ed25519 and run chmod 600 on it. SSH refuses a private key that other users can read. Add the public key line to ~/.ssh/authorized_keys on the server, or to your Git host.",
  },
  {
    q: "Can I protect the private key with a passphrase?",
    a: "The tool writes unencrypted private keys. To add a passphrase to an SSH key, run ssh-keygen -p -f ~/.ssh/id_ed25519. To encrypt a PEM key, run openssl pkcs8 -topk8 -in private-key.pem -out encrypted.pem.",
  },
  {
    q: "What is the default kid?",
    a: "The default kid is the RFC 7638 JWK thumbprint: a SHA-256 hash of the public key fields. The same key always gets the same kid. Type a value to use your own kid.",
  },
  {
    q: "Which fingerprint do GitHub and ssh-keygen show?",
    a: "Both show the SHA-256 fingerprint, for example SHA256:TvA1hOjc... Run ssh-keygen -lf on a key file to compare it with the fingerprint here.",
  },
  {
    q: "Can I convert or inspect a key that I already have?",
    a: "Yes. Paste the key into the Key pane. The tool reads PEM keys (PKCS#8, SPKI, PKCS#1, SEC1, or a certificate), a JWK, a JWKS with one key, an OpenSSH public key line, and an unencrypted OpenSSH private key. It shows the key type, size, fingerprints, and every format.",
  },
  {
    q: "Are the keys sent anywhere?",
    a: "No. The keys are generated with Web Crypto on this device and never leave it. Some older systems do not support Ed25519. The tool tells you when this occurs.",
  },
];

const USE_LABELS: Record<JwkUse, string> = { sig: "sig (signing)", enc: "enc (encryption)", "": "Not set" };

type Format = "pem" | "ssh" | "jwk";

interface ReadState {
  key: ReadKeyResult | null;
  error: string;
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof KeyInputError ? error.message : error instanceof Error && error.message ? `${fallback} ${error.message}` : fallback;

/** OpenSSH rejects a private key file without a final newline, so every saved file ends with one. */
const withNewline = (text: string) => (text.endsWith("\n") ? text : `${text}\n`);

async function saveText(text: string, fileName: string) {
  try {
    if (await saveFile(new Blob([withNewline(text)], { type: "text/plain" }), fileName)) toast.success(`Saved ${fileName}.`);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not save the file.");
  }
}

function KeyBlock({ title, value, fileName, extra }: { title: string; value: string; fileName: string; extra?: ReactNode }) {
  return (
    <section className="border-b border-border/50" aria-label={title}>
      <div className="flex items-center justify-between gap-2 px-4 pt-2">
        <span className="result-row-label">{title}</span>
        <div className="pane-actions">
          {extra}
          <CopyButton value={value} iconOnly label={`Copy ${title}`} />
          <button type="button" className="toolbar-text-button" aria-label={`Save ${title}`} onClick={() => void saveText(value, fileName)}>
            <Download size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto px-4 pb-3 pt-1 font-mono text-xs leading-[18px]"><code>{value.trimEnd()}</code></pre>
    </section>
  );
}

const PublicOnlyNote = () => (
  <p className="border-b border-border/50 px-4 py-2 text-xs text-muted-foreground">
    This is a public key. Paste or generate a private key to see the private formats.
  </p>
);

export function KeyGenerator() {
  const [keyType, setKeyType] = useState<KeyType>("ed25519");
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [kid, setKid] = useState("");
  const [use, setUse] = useState<JwkUse>("sig");
  // "auto" picks the usual algorithm for the key, so a new key type never keeps an alg that does not fit.
  const [alg, setAlg] = useState("auto");
  const [comment, setComment] = useState("");
  const [format, setFormat] = useState<Format>("pem");
  const [read, setRead] = useState<ReadState>({ key: null, error: "" });
  const [outputs, setOutputs] = useState<KeyOutputs | null>(null);
  const [outputError, setOutputError] = useState("");
  const generation = useRef(0);

  const pendingInput = useDebouncedValue(input);
  const pendingKid = useDebouncedValue(kid);
  const pendingComment = useDebouncedValue(comment);

  const generate = useCallback(async (type: KeyType) => {
    const id = ++generation.current;
    setGenerating(true);
    setGenerateError("");
    try {
      const jwk = await generateKeyPair(type);
      const { privatePem } = await buildKeyOutputs(jwk);
      if (id === generation.current) setInput(privatePem!);
    } catch (error) {
      if (id === generation.current) setGenerateError(errorMessage(error, "Could not generate the key."));
    } finally {
      if (id === generation.current) setGenerating(false);
    }
  }, []);

  useEffect(() => {
    void generate("ed25519");
  }, [generate]);

  /** A user edit wins over a key that is still being generated. */
  const editInput = (value: string) => {
    generation.current++;
    setGenerating(false);
    setGenerateError("");
    setInput(value);
  };

  useEffect(() => {
    if (!pendingInput.trim()) {
      setRead({ key: null, error: "" });
      return;
    }
    let cancelled = false;
    readKey(pendingInput).then(
      (key) => !cancelled && setRead({ key, error: "" }),
      (error: unknown) => !cancelled && setRead({ key: null, error: errorMessage(error, "Could not read the key.") }),
    );
    return () => {
      cancelled = true;
    };
  }, [pendingInput]);

  const jwk = read.key?.jwk;
  const uses = jwk ? jwkUses(jwk) : (["sig", "enc", ""] as JwkUse[]);
  const effectiveUse = uses.includes(use) ? use : "sig";
  const algorithms = jwk ? jwkAlgorithms(jwk, effectiveUse) : [];
  const effectiveAlg = alg === "" ? "" : algorithms.includes(alg) ? alg : (algorithms[0] ?? "");

  useEffect(() => {
    const key = read.key;
    if (!key) {
      setOutputs(null);
      setOutputError("");
      return;
    }
    let cancelled = false;
    buildKeyOutputs(key.jwk, {
      kid: pendingKid.trim() || key.hints.kid,
      use: effectiveUse,
      alg: effectiveAlg,
      comment: pendingComment.trim() || key.comment,
    }).then(
      (result) => {
        if (cancelled) return;
        setOutputs(result);
        setOutputError("");
      },
      (error: unknown) => {
        if (cancelled) return;
        setOutputs(null);
        setOutputError(errorMessage(error, "Could not convert the key."));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [read, pendingKid, pendingComment, effectiveUse, effectiveAlg]);

  const error = generateError || (input.trim() ? read.error || outputError : "");
  const shown = input.trim() && !error ? outputs : null;
  const stem = jwk ? sshFileStem(jwk) : "id_key";

  const notice = error ? (
    <div className="workspace-notice" data-tone="error" role="alert">{error}</div>
  ) : (
    <div className="workspace-notice" role="status">Keys are generated on this device and never leave it. Keep the private key secret.</div>
  );

  return (
    <ToolWorkspace
      id="key-generator"
      toolbar={
        <>
          <label className="indent-control">
            Key type
            <select
              aria-label="Key type"
              value={keyType}
              onChange={(e) => {
                const next = e.target.value as KeyType;
                setKeyType(next);
                void generate(next);
              }}
            >
              {KEY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="toolbar-text-button indent-control" onClick={() => void generate(keyType)} disabled={generating}>
            <RefreshCw size={14} aria-hidden="true" />
            Generate
          </button>
        </>
      }
      secondaryToolbar={
        <>
          <label className="indent-control" htmlFor="key-kid">
            kid
            <Input
              id="key-kid"
              className="h-7 w-44 font-mono text-xs"
              value={kid}
              onChange={(e) => setKid(e.target.value)}
              placeholder={read.key?.hints.kid || "JWK thumbprint"}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="indent-control">
            use
            <select aria-label="use" value={effectiveUse} onChange={(e) => setUse(e.target.value as JwkUse)}>
              {uses.map((value) => (
                <option key={value || "none"} value={value}>{USE_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <label className="indent-control">
            alg
            <select aria-label="alg" value={effectiveAlg} onChange={(e) => setAlg(e.target.value)}>
              {algorithms.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
              <option value="">Not set</option>
            </select>
          </label>
          <label className="indent-control" htmlFor="key-comment">
            SSH comment
            <Input
              id="key-comment"
              className="h-7 w-44 text-xs"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={read.key?.comment || "e.g. you@laptop"}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </>
      }
      notice={notice}
      first={
        <EditorPane
          title="Key"
          htmlFor="key-input"
          scroll={false}
          actions={
            input ? (
              <button type="button" className="toolbar-text-button" onClick={() => editInput("")}>
                Clear
              </button>
            ) : undefined
          }
        >
          <CodeTextarea
            id="key-input"
            className="break-all"
            value={input}
            onChange={(e) => editInput(e.target.value)}
            placeholder="Select Generate, or paste a PEM, JWK, or OpenSSH key to convert it."
          />
        </EditorPane>
      }
      second={
        <EditorPane title="Formats">
          {shown ? (
            <div>
              <div className="result-list">
                <div className="result-row">
                  <span className="result-row-label">Type</span>
                  <span className="result-row-value">{shown.info.label} · {shown.info.isPrivate ? "private key" : "public key"}</span>
                  <span aria-hidden="true" />
                </div>
                <div className="result-row">
                  <span className="result-row-label">SSH fingerprint</span>
                  <span className="result-row-value" data-testid="ssh-fingerprint">{shown.sshFingerprint}</span>
                  <CopyButton value={shown.sshFingerprint} iconOnly label="Copy SSH fingerprint" />
                </div>
                <div className="result-row">
                  <span className="result-row-label">JWK thumbprint</span>
                  <span className="result-row-value" data-testid="jwk-thumbprint">{shown.thumbprint}</span>
                  <CopyButton value={shown.thumbprint} iconOnly label="Copy JWK thumbprint" />
                </div>
              </div>
              <Tabs value={format} onValueChange={(value) => setFormat(value as Format)}>
                <div className="px-4 pt-3">
                  <TabsList aria-label="Format">
                    <TabsTrigger value="pem">PEM</TabsTrigger>
                    <TabsTrigger value="ssh">OpenSSH</TabsTrigger>
                    <TabsTrigger value="jwk">JWK</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="pem">
                  {shown.privatePem ? <KeyBlock title="Private key (PKCS#8)" value={shown.privatePem} fileName="private-key.pem" /> : <PublicOnlyNote />}
                  <KeyBlock title="Public key (SPKI)" value={shown.publicPem} fileName="public-key.pem" />
                </TabsContent>
                <TabsContent value="ssh">
                  <KeyBlock title="OpenSSH public key" value={shown.sshPublic} fileName={`${stem}.pub`} />
                  {shown.sshPrivate ? <KeyBlock title="OpenSSH private key" value={shown.sshPrivate} fileName={stem} /> : <PublicOnlyNote />}
                </TabsContent>
                <TabsContent value="jwk">
                  {shown.privateJwk ? <KeyBlock title="Private JWK" value={shown.privateJwk} fileName="private-key.jwk.json" /> : <PublicOnlyNote />}
                  <KeyBlock
                    title="Public JWK"
                    value={shown.publicJwk}
                    fileName="public-key.jwk.json"
                    extra={<CopyButton value={shown.jwks} label="Copy JWKS" />}
                  />
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <PaneEmpty
              icon={<KeySquare size={20} aria-hidden="true" />}
              title={generating ? "Generating the key…" : "Generate or paste a key"}
              hint="The key appears here as PEM, OpenSSH, and JWK, with its fingerprints."
            />
          )}
        </EditorPane>
      }
      status={
        generating ? (
          <span>Generating…</span>
        ) : error ? (
          <span className="text-destructive">{generateError ? "Not generated" : "Invalid key"}</span>
        ) : shown ? (
          <>
            <span>{shown.info.label}</span>
            <span>{shown.info.isPrivate ? "Private key" : "Public key only"}</span>
          </>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
