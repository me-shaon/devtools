import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FileBadge, FileUp } from "lucide-react";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import {
  certificateFileToText,
  certificateSummaryJson,
  decodeCertificates,
  validityStatus,
  type CertificateParseResult,
  type ChainResult,
  type ParsedCertificate,
  type ParsedCsr,
  type ValidityState,
} from "@/utils/certificate";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What can I paste here?",
    a: "Paste one PEM certificate, a chain of several PEM certificates, or a certificate signing request (CSR). You can also open a .pem, .crt, .cer, or binary .der file.",
  },
  {
    q: "What does the chain check prove?",
    a: "It checks that each certificate's issuer matches the next certificate's subject and that each signature verifies with the next certificate's public key. It does not check revocation, trust stores, name constraints, or policies.",
  },
  {
    q: "Does the tool contact the CRL, OCSP, or CA issuer URLs?",
    a: "No. The tool shows these URLs as plain text and never fetches them. All decoding and signature checks run on this device.",
  },
  {
    q: "Which fingerprint should I compare?",
    a: "Compare the SHA-256 fingerprint. SHA-1 fingerprints are shown for older systems that still display them.",
  },
];

const PLACEHOLDER = "-----BEGIN CERTIFICATE-----\nMIIDdzCCAl+gAwIBAgIE...\n-----END CERTIFICATE-----";

const VALIDITY_TONE: Record<ValidityState, string> = {
  valid: "text-success",
  expiring: "text-warning",
  expired: "text-destructive",
  "not-yet-valid": "text-warning",
};

const OFFLINE_NOTE = "Offline check: revocation (CRL, OCSP) and trust stores are not checked.";

const MAX_FILE_BYTES = 1024 * 1024;

const readFileBytes = (file: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsArrayBuffer(file);
  });

const formatDate = (date: Date) => `${date.toLocaleString()} (${date.toISOString()})`;

interface Decoded {
  result: CertificateParseResult | null;
  error: string;
}

const EMPTY: Decoded = { result: null, error: "" };

const Row = ({ label, value, copy, tone }: { label: string; value: ReactNode; copy?: string; tone?: string }) => (
  <div className="result-row">
    <span className="result-row-label">{label}</span>
    <span className={`result-row-value whitespace-pre-line ${tone ?? ""}`}>{value}</span>
    {copy ? <CopyButton value={copy} iconOnly label={`Copy ${label}`} /> : <span aria-hidden="true" />}
  </div>
);

const lines = (items: string[]) => items.join("\n");

const certificateRole = (cert: ParsedCertificate, index: number, total: number, chain: ChainResult | null) => {
  if (!chain?.ordered) return total > 1 ? `Certificate ${index + 1}` : "Certificate";
  if (index === 0) return "Leaf";
  if (index === total - 1 && cert.selfSigned) return "Root";
  return "Intermediate";
};

function CertificateSection({ cert, title }: { cert: ParsedCertificate; title: string }) {
  const validity = validityStatus(cert.notBefore, cert.notAfter);
  const basic = cert.basicConstraints;
  const sans = cert.subjectAltNames.map((san) => `${san.type}: ${san.value}`);
  return (
    <section className="border-b border-border" aria-label={`${title}: ${cert.subjectText}`}>
      <h3 className="px-4 pb-1 pt-3 text-xs font-semibold text-foreground">
        {title}
        {cert.selfSigned && <span className="ml-2 font-normal text-muted-foreground">Self-signed</span>}
        <span className="ml-2 font-normal text-muted-foreground">Input block {cert.inputIndex}</span>
      </h3>
      <div className="result-list">
        <Row label="Subject" value={lines(cert.subject)} copy={cert.subjectText} />
        <Row label="Issuer" value={lines(cert.issuer)} copy={cert.issuerText} />
        <Row label="Status" value={validity.label} tone={VALIDITY_TONE[validity.state]} />
        <Row label="Valid from" value={formatDate(cert.notBefore)} />
        <Row label="Valid to" value={formatDate(cert.notAfter)} />
        <Row label="Serial number" value={cert.serialNumber} copy={cert.serialNumber} />
        {sans.length > 0 && <Row label="Subject alt names" value={lines(sans)} copy={lines(cert.subjectAltNames.map((s) => s.value))} />}
        <Row label="Public key" value={cert.publicKey} />
        <Row label="Signature" value={cert.signatureAlgorithm} />
        {cert.keyUsage.length > 0 && <Row label="Key usage" value={lines(cert.keyUsage)} />}
        {cert.extendedKeyUsage.length > 0 && <Row label="Extended key usage" value={lines(cert.extendedKeyUsage)} />}
        <Row
          label="Basic constraints"
          value={
            basic
              ? `CA: ${basic.ca ? "true" : "false"}${basic.pathLength !== undefined ? ` · path length ${basic.pathLength}` : ""}${basic.critical ? " · critical" : ""}`
              : "Not present"
          }
        />
        <Row label="SHA-256" value={cert.sha256} copy={cert.sha256} />
        <Row label="SHA-1" value={cert.sha1} copy={cert.sha1} />
        {cert.subjectKeyId && <Row label="Subject key ID" value={cert.subjectKeyId} copy={cert.subjectKeyId} />}
        {cert.authorityKeyId && <Row label="Authority key ID" value={cert.authorityKeyId} copy={cert.authorityKeyId} />}
        {cert.crlDistributionPoints.length > 0 && (
          <Row label="CRL distribution" value={lines(cert.crlDistributionPoints)} copy={lines(cert.crlDistributionPoints)} />
        )}
        {cert.ocspUrls.length > 0 && <Row label="OCSP" value={lines(cert.ocspUrls)} copy={lines(cert.ocspUrls)} />}
        {cert.caIssuerUrls.length > 0 && <Row label="CA issuers" value={lines(cert.caIssuerUrls)} copy={lines(cert.caIssuerUrls)} />}
      </div>
    </section>
  );
}

function CsrSection({ csr }: { csr: ParsedCsr }) {
  const sans = csr.subjectAltNames.map((san) => `${san.type}: ${san.value}`);
  const signature =
    csr.signatureValid === null ? "Not checked: algorithm not supported here" : csr.signatureValid ? "Signed by its own key" : "Signature does not verify";
  return (
    <section className="border-b border-border" aria-label={`Certificate request: ${csr.subjectText}`}>
      <h3 className="px-4 pb-1 pt-3 text-xs font-semibold text-foreground">
        Certificate request
        <span className="ml-2 font-normal text-muted-foreground">Input block {csr.inputIndex}</span>
      </h3>
      <div className="result-list">
        <Row label="Subject" value={lines(csr.subject)} copy={csr.subjectText} />
        {sans.length > 0 && <Row label="Subject alt names" value={lines(sans)} copy={lines(csr.subjectAltNames.map((s) => s.value))} />}
        <Row label="Public key" value={csr.publicKey} />
        <Row label="Signature" value={csr.signatureAlgorithm} />
        <Row
          label="Self-signature"
          value={signature}
          tone={csr.signatureValid === null ? "text-warning" : csr.signatureValid ? "text-success" : "text-destructive"}
        />
        {csr.keyUsage.length > 0 && <Row label="Key usage" value={lines(csr.keyUsage)} />}
        {csr.extendedKeyUsage.length > 0 && <Row label="Extended key usage" value={lines(csr.extendedKeyUsage)} />}
        <Row label="SHA-256" value={csr.sha256} copy={csr.sha256} />
      </div>
    </section>
  );
}

function ChainSection({ chain, certs }: { chain: ChainResult; certs: ParsedCertificate[] }) {
  return (
    <section className="border-b border-border" aria-label="Chain">
      <h3 className="px-4 pb-1 pt-3 text-xs font-semibold text-foreground">Chain</h3>
      <div className="result-list">
        <Row label="Result" value={chain.message} tone={chain.ok ? "text-success" : "text-destructive"} />
        {chain.links.map((link) => {
          const signature = link.signatureValid === null ? "signature not checked" : link.signatureValid ? "signature verifies" : "signature fails";
          const ok = link.issuerMatches && link.signatureValid === true;
          return (
            <Row
              key={link.from}
              label={`Link ${link.from + 1} → ${link.to + 1}`}
              value={`${certs[link.from].subjectText}\nsigned by ${certs[link.to].subjectText}\n${link.issuerMatches ? "Issuer matches" : "Issuer does not match"} · ${signature}`}
              tone={ok ? undefined : "text-destructive"}
            />
          );
        })}
        <p className="px-4 py-2 text-xs text-muted-foreground">{OFFLINE_NOTE}</p>
      </div>
    </section>
  );
}

export function CertificateDecoder() {
  const [input, setInput] = useState("");
  const [decoded, setDecoded] = useState<Decoded>(EMPTY);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pending = useDebouncedValue(input);

  useEffect(() => {
    if (!pending.trim()) {
      setDecoded(EMPTY);
      return;
    }
    let cancelled = false;
    decodeCertificates(pending)
      .then((result) => {
        if (!cancelled) setDecoded({ result, error: "" });
      })
      .catch((error: unknown) => {
        if (!cancelled) setDecoded({ result: null, error: error instanceof Error ? error.message : "Could not decode the certificate." });
      });
    return () => {
      cancelled = true;
    };
  }, [pending]);

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError("");
    if (file.size > MAX_FILE_BYTES) {
      setFileError("The file is larger than 1 MB. Open a single certificate or chain file.");
      return;
    }
    try {
      setInput(await certificateFileToText(await readFileBytes(file)));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Could not read the file.");
    }
  };

  const current = input.trim() ? decoded : EMPTY;
  const result = current.result;
  const certs = result?.certificates ?? [];
  const requests = result?.requests ?? [];
  const summary = useMemo(() => (result ? certificateSummaryJson(result) : ""), [result]);
  const error = fileError || current.error;

  const status = () => {
    if (current.error) return <span className="text-destructive">Invalid input</span>;
    if (!result) return <span>Ready</span>;
    const leaf = certs[0];
    const validity = leaf ? validityStatus(leaf.notBefore, leaf.notAfter) : null;
    const parts: string[] = [];
    if (certs.length) parts.push(`${certs.length} ${certs.length === 1 ? "certificate" : "certificates"}`);
    if (requests.length) parts.push(`${requests.length} ${requests.length === 1 ? "request" : "requests"}`);
    return (
      <>
        <span>{parts.join(" · ")}</span>
        {validity && <span className={VALIDITY_TONE[validity.state]}>{validity.label}</span>}
        {result.chain && <span className={result.chain.ok ? "text-success" : "text-destructive"}>{result.chain.message}</span>}
      </>
    );
  };

  return (
    <ToolWorkspace
      id="certificate-decoder"
      toolbar={
        <>
          <input
            ref={fileInputRef}
            id="certificate-file"
            type="file"
            accept=".pem,.crt,.cer,.der,.csr,.req"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void openFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button type="button" className="toolbar-text-button" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={14} aria-hidden="true" />
            Open file
          </button>
          <CopyButton value={summary} label="Copy as JSON" />
        </>
      }
      notice={
        error ? (
          <div className="workspace-notice" data-tone="error" role="alert">{error}</div>
        ) : result?.notes.length ? (
          <div className="workspace-notice">{result.notes.join(" ")}</div>
        ) : undefined
      }
      first={
        <EditorPane
          title="PEM input"
          htmlFor="certificate-input"
          scroll={false}
          actions={
            input ? (
              <button type="button" className="toolbar-text-button" onClick={() => { setInput(""); setFileError(""); }}>
                Clear
              </button>
            ) : undefined
          }
        >
          <CodeTextarea
            id="certificate-input"
            className="break-all"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setFileError("");
            }}
            placeholder={PLACEHOLDER}
          />
        </EditorPane>
      }
      second={
        <EditorPane title="Decoded">
          {result && (certs.length > 0 || requests.length > 0) ? (
            <div>
              {result.chain && <ChainSection chain={result.chain} certs={certs} />}
              {certs.map((cert, index) => (
                <CertificateSection
                  key={`${cert.inputIndex}-${cert.sha256}`}
                  cert={cert}
                  title={certificateRole(cert, index, certs.length, result.chain)}
                />
              ))}
              {requests.map((csr) => (
                <CsrSection key={`${csr.inputIndex}-${csr.sha256}`} csr={csr} />
              ))}
              {!result.chain && <p className="px-4 py-2 text-xs text-muted-foreground">{OFFLINE_NOTE}</p>}
            </div>
          ) : (
            <PaneEmpty
              icon={<FileBadge size={20} aria-hidden="true" />}
              title="Paste a certificate to decode it"
              hint="Paste PEM text or open a .pem, .crt, .cer, or .der file. A chain of several certificates is checked link by link."
            />
          )}
        </EditorPane>
      }
      status={status()}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
