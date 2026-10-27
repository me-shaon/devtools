/**
 * X.509 certificate and CSR decoding. Everything runs locally: the tool never
 * fetches CRL, AIA, or OCSP URLs and does not check revocation or trust stores.
 *
 * `@peculiar/x509` is loaded on demand so it stays out of the main bundle.
 */
type X509Module = typeof import("@peculiar/x509");
type X509Certificate = import("@peculiar/x509").X509Certificate;
type Pkcs10CertificateRequest = import("@peculiar/x509").Pkcs10CertificateRequest;
type Extension = import("@peculiar/x509").Extension;

export interface SubjectAltName {
  type: "DNS" | "IP" | "Email" | "URI" | "DN" | "UPN" | "GUID" | "ID";
  value: string;
}

export interface BasicConstraints {
  ca: boolean;
  pathLength?: number;
  critical: boolean;
}

export type ValidityState = "valid" | "expiring" | "expired" | "not-yet-valid";

export interface ValidityStatus {
  state: ValidityState;
  label: string;
}

export interface ParsedCertificate {
  kind: "certificate";
  /** Position in the pasted input, starting at 1. */
  inputIndex: number;
  subject: string[];
  issuer: string[];
  subjectText: string;
  issuerText: string;
  /** Hex bytes separated by colons. */
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  subjectAltNames: SubjectAltName[];
  publicKey: string;
  signatureAlgorithm: string;
  keyUsage: string[];
  extendedKeyUsage: string[];
  basicConstraints: BasicConstraints | null;
  sha1: string;
  sha256: string;
  subjectKeyId: string;
  authorityKeyId: string;
  crlDistributionPoints: string[];
  ocspUrls: string[];
  caIssuerUrls: string[];
  /** Subject equals issuer and the signature verifies with the certificate's own key. */
  selfSigned: boolean;
  pem: string;
}

export interface ParsedCsr {
  kind: "csr";
  inputIndex: number;
  subject: string[];
  subjectText: string;
  subjectAltNames: SubjectAltName[];
  publicKey: string;
  signatureAlgorithm: string;
  keyUsage: string[];
  extendedKeyUsage: string[];
  /** True when the CSR is signed by its own key. Null when the algorithm cannot be checked. */
  signatureValid: boolean | null;
  sha256: string;
  pem: string;
}

export type ParsedItem = ParsedCertificate | ParsedCsr;

export interface ChainLink {
  /** Indexes into `certificates`: `from` is signed by `to`. */
  from: number;
  to: number;
  issuerMatches: boolean;
  /** Null when this environment cannot check the signature algorithm. */
  signatureValid: boolean | null;
}

export interface ChainResult {
  /** True when the certificates could be put in leaf-to-root order. */
  ordered: boolean;
  links: ChainLink[];
  ok: boolean;
  message: string;
  /** True when the last certificate is a self-signed root. */
  endsAtRoot: boolean;
}

export interface CertificateParseResult {
  /** Certificates, leaf first when a chain could be ordered. */
  certificates: ParsedCertificate[];
  requests: ParsedCsr[];
  chain: ChainResult | null;
  notes: string[];
}

let x509Promise: Promise<X509Module> | null = null;

/**
 * tsyringe, used inside @peculiar/x509, refuses to load without the Reflect
 * metadata API. The library only stores and reads a few keys, so a small
 * WeakMap store is enough and avoids a polyfill dependency.
 */
function installReflectMetadata() {
  const reflect = Reflect as typeof Reflect & Record<string, unknown>;
  if (typeof reflect.getMetadata === "function") return;
  const store = new WeakMap<object, Map<unknown, unknown>>();
  const entries = (target: object, create: boolean) => {
    let map = store.get(target);
    if (!map && create) {
      map = new Map();
      store.set(target, map);
    }
    return map;
  };
  reflect.defineMetadata = (key: unknown, value: unknown, target: object) => {
    entries(target, true)?.set(key, value);
  };
  reflect.getOwnMetadata = (key: unknown, target: object) => entries(target, false)?.get(key);
  reflect.getMetadata = (key: unknown, target: object) => {
    for (let item: object | null = target; item; item = Object.getPrototypeOf(item)) {
      const map = entries(item, false);
      if (map?.has(key)) return map.get(key);
    }
    return undefined;
  };
  reflect.metadata = (key: unknown, value: unknown) => (target: object) => {
    entries(target, true)?.set(key, value);
  };
}

/** Loads @peculiar/x509 once and connects it to this environment's WebCrypto. */
export function loadX509(): Promise<X509Module> {
  if (!x509Promise) {
    installReflectMetadata();
    x509Promise = import("@peculiar/x509")
      .then((x509) => {
        x509.cryptoProvider.set(globalThis.crypto);
        return x509;
      })
      .catch((error: unknown) => {
        x509Promise = null;
        throw error;
      });
  }
  return x509Promise;
}

const toHex = (buffer: ArrayBuffer | Uint8Array, separator = ":") =>
  Array.from(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(separator);

/** Formats a hex string such as "01ab" as "01:AB". */
export const formatHexBytes = (hex: string) => {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  const even = clean.length % 2 ? `0${clean}` : clean;
  return (even.match(/../g) ?? []).join(":").toUpperCase();
};

const digest = async (algorithm: "SHA-1" | "SHA-256", data: ArrayBuffer) =>
  toHex(await globalThis.crypto.subtle.digest(algorithm, data));

const KEY_USAGE_NAMES: [number, string][] = [
  [1, "Digital signature"],
  [2, "Non-repudiation"],
  [4, "Key encipherment"],
  [8, "Data encipherment"],
  [16, "Key agreement"],
  [32, "Certificate signing"],
  [64, "CRL signing"],
  [128, "Encipher only"],
  [256, "Decipher only"],
];

const EKU_NAMES: Record<string, string> = {
  "1.3.6.1.5.5.7.3.1": "TLS server authentication",
  "1.3.6.1.5.5.7.3.2": "TLS client authentication",
  "1.3.6.1.5.5.7.3.3": "Code signing",
  "1.3.6.1.5.5.7.3.4": "Email protection",
  "1.3.6.1.5.5.7.3.8": "Time stamping",
  "1.3.6.1.5.5.7.3.9": "OCSP signing",
  "2.5.29.37.0": "Any extended key usage",
  "1.3.6.1.4.1.311.10.3.3": "Microsoft server gated crypto",
  "2.16.840.1.113730.4.1": "Netscape server gated crypto",
};

const SAN_TYPES: Record<string, SubjectAltName["type"]> = {
  dns: "DNS",
  ip: "IP",
  email: "Email",
  url: "URI",
  dn: "DN",
  upn: "UPN",
  guid: "GUID",
  id: "ID",
};

const HASH_LABEL = (hash: unknown) => {
  const name = typeof hash === "string" ? hash : (hash as { name?: string } | undefined)?.name;
  return name ?? "";
};

/** Describes a signature algorithm, for example "SHA-256 with RSA" or "ECDSA with SHA-384". */
export function describeSignatureAlgorithm(algorithm: Algorithm & { hash?: unknown }): string {
  const hash = HASH_LABEL(algorithm.hash);
  switch (algorithm.name) {
    case "RSASSA-PKCS1-v1_5":
      return hash ? `${hash} with RSA` : "RSA";
    case "RSA-PSS":
      return hash ? `RSA-PSS with ${hash}` : "RSA-PSS";
    case "ECDSA":
      return hash ? `ECDSA with ${hash}` : "ECDSA";
    default:
      return algorithm.name;
  }
}

/** Describes a public key, for example "RSA 2048", "EC P-256", or "Ed25519". */
export function describePublicKey(algorithm: Algorithm & { modulusLength?: number; namedCurve?: string }): string {
  if (algorithm.modulusLength) {
    const prefix = algorithm.name === "RSA-PSS" ? "RSA-PSS" : "RSA";
    return `${prefix} ${algorithm.modulusLength}`;
  }
  if (algorithm.name === "ECDSA" || algorithm.name === "ECDH") {
    return `EC ${algorithm.namedCurve ?? "unknown curve"}`;
  }
  return algorithm.name;
}

const nameLines = (json: Record<string, string[]>[]) =>
  json.flatMap((rdn) => Object.entries(rdn).flatMap(([type, values]) => values.map((value) => `${type}=${value}`)));

const ONE_DAY = 86_400_000;

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

/** A distance such as "42 days", "5 hours", or "3 minutes". */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  if (abs >= ONE_DAY) return plural(Math.floor(abs / ONE_DAY), "day");
  if (abs >= 3_600_000) return plural(Math.floor(abs / 3_600_000), "hour");
  return plural(Math.max(1, Math.floor(abs / 60_000)), "minute");
}

/** The validity of a certificate at `now`. Certificates with 30 days or less left are "expiring". */
export function validityStatus(notBefore: Date, notAfter: Date, now: Date = new Date()): ValidityStatus {
  const time = now.getTime();
  if (time < notBefore.getTime()) {
    return { state: "not-yet-valid", label: `Not yet valid · starts in ${formatDuration(notBefore.getTime() - time)}` };
  }
  if (time > notAfter.getTime()) {
    return { state: "expired", label: `Expired ${formatDuration(time - notAfter.getTime())} ago` };
  }
  const left = notAfter.getTime() - time;
  return { state: left <= 30 * ONE_DAY ? "expiring" : "valid", label: `Valid · expires in ${formatDuration(left)}` };
}

function readSans(x509: X509Module, extension: Extension | null): SubjectAltName[] {
  if (!(extension instanceof x509.SubjectAlternativeNameExtension)) return [];
  return extension.names.toJSON().map((name) => ({ type: SAN_TYPES[name.type] ?? "ID", value: name.value }));
}

function readKeyUsage(x509: X509Module, extension: Extension | null): string[] {
  if (!(extension instanceof x509.KeyUsagesExtension)) return [];
  return KEY_USAGE_NAMES.filter(([flag]) => extension.usages & flag).map(([, name]) => name);
}

function readExtendedKeyUsage(x509: X509Module, extension: Extension | null): string[] {
  if (!(extension instanceof x509.ExtendedKeyUsageExtension)) return [];
  return extension.usages.map((usage) => {
    const oid = String(usage);
    return EKU_NAMES[oid] ? `${EKU_NAMES[oid]} (${oid})` : oid;
  });
}

/** Signature checks throw when WebCrypto lacks the algorithm. Report that as "not checked". */
async function checkSignature(run: () => Promise<boolean>): Promise<boolean | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

async function readCertificate(x509: X509Module, cert: X509Certificate, inputIndex: number): Promise<ParsedCertificate> {
  const get = (type: string) => cert.getExtension(type);
  const basic = get("2.5.29.19");
  const ski = get("2.5.29.14");
  const aki = get("2.5.29.35");
  const crl = get("2.5.29.31");
  const aia = get("1.3.6.1.5.5.7.1.1");

  const crlDistributionPoints =
    crl instanceof x509.CRLDistributionPointsExtension
      ? crl.distributionPoints.flatMap((point) =>
          (point.distributionPoint?.fullName ?? []).flatMap((name) => (name.uniformResourceIdentifier ? [name.uniformResourceIdentifier] : [])),
        )
      : [];
  const urls = (names: { value: string }[]) => names.map((name) => name.value);

  const sameName = cert.subject === cert.issuer;
  const selfSigned = sameName && (await checkSignature(() => cert.verify({ publicKey: cert.publicKey, signatureOnly: true }))) === true;

  return {
    kind: "certificate",
    inputIndex,
    subject: nameLines(cert.subjectName.toJSON()),
    issuer: nameLines(cert.issuerName.toJSON()),
    subjectText: cert.subject,
    issuerText: cert.issuer,
    serialNumber: formatHexBytes(cert.serialNumber),
    notBefore: cert.notBefore,
    notAfter: cert.notAfter,
    subjectAltNames: readSans(x509, get("2.5.29.17")),
    publicKey: describePublicKey(cert.publicKey.algorithm),
    signatureAlgorithm: describeSignatureAlgorithm(cert.signatureAlgorithm),
    keyUsage: readKeyUsage(x509, get("2.5.29.15")),
    extendedKeyUsage: readExtendedKeyUsage(x509, get("2.5.29.37")),
    basicConstraints:
      basic instanceof x509.BasicConstraintsExtension
        ? { ca: basic.ca, pathLength: basic.pathLength, critical: basic.critical }
        : null,
    sha1: await digest("SHA-1", cert.rawData),
    sha256: await digest("SHA-256", cert.rawData),
    subjectKeyId: ski instanceof x509.SubjectKeyIdentifierExtension ? formatHexBytes(ski.keyId) : "",
    authorityKeyId: aki instanceof x509.AuthorityKeyIdentifierExtension && aki.keyId ? formatHexBytes(aki.keyId) : "",
    crlDistributionPoints,
    ocspUrls: aia instanceof x509.AuthorityInfoAccessExtension ? urls(aia.ocsp) : [],
    caIssuerUrls: aia instanceof x509.AuthorityInfoAccessExtension ? urls(aia.caIssuers) : [],
    selfSigned,
    pem: cert.toString("pem"),
  };
}

async function readCsr(x509: X509Module, csr: Pkcs10CertificateRequest, inputIndex: number): Promise<ParsedCsr> {
  const get = (type: string) => csr.getExtension(type);
  return {
    kind: "csr",
    inputIndex,
    subject: nameLines(csr.subjectName.toJSON()),
    subjectText: csr.subject,
    subjectAltNames: readSans(x509, get("2.5.29.17")),
    publicKey: describePublicKey(csr.publicKey.algorithm),
    signatureAlgorithm: describeSignatureAlgorithm(csr.signatureAlgorithm),
    keyUsage: readKeyUsage(x509, get("2.5.29.15")),
    extendedKeyUsage: readExtendedKeyUsage(x509, get("2.5.29.37")),
    signatureValid: await checkSignature(() => csr.verify()),
    sha256: await digest("SHA-256", csr.rawData),
    pem: csr.toString("pem"),
  };
}

/** Puts certificates in leaf-to-root order. Returns null when they do not form one path. */
function orderChain(certs: X509Certificate[]): X509Certificate[] | null {
  const isIssuerOfAnother = (cert: X509Certificate) =>
    certs.some((other) => other !== cert && other.issuer === cert.subject && other.subject !== other.issuer);
  const leaves = certs.filter((cert) => !isIssuerOfAnother(cert));
  if (leaves.length !== 1) return null;
  const ordered = [leaves[0]];
  const used = new Set(ordered);
  for (;;) {
    const current = ordered[ordered.length - 1];
    if (current.subject === current.issuer) break;
    const next = certs.find((cert) => !used.has(cert) && cert.subject === current.issuer);
    if (!next) break;
    ordered.push(next);
    used.add(next);
  }
  return ordered.length === certs.length ? ordered : null;
}

async function checkChain(certs: X509Certificate[], parsed: ParsedCertificate[], ordered: boolean): Promise<ChainResult> {
  const links: ChainLink[] = [];
  for (let i = 0; i < certs.length - 1; i += 1) {
    const cert = certs[i];
    const next = certs[i + 1];
    links.push({
      from: i,
      to: i + 1,
      issuerMatches: cert.issuer === next.subject,
      signatureValid: await checkSignature(() => cert.verify({ publicKey: next.publicKey, signatureOnly: true })),
    });
  }
  const endsAtRoot = parsed[parsed.length - 1].selfSigned;
  const failed = links.find((link) => !link.issuerMatches || link.signatureValid === false);
  const unchecked = links.find((link) => link.signatureValid === null);
  let message: string;
  if (failed) {
    const reason = !failed.issuerMatches ? "the issuer does not match the next subject" : "the signature does not verify";
    message = `Link ${failed.from + 1} → ${failed.to + 1} fails: ${reason}`;
  } else if (unchecked) {
    message = `Link ${unchecked.from + 1} → ${unchecked.to + 1} not checked: this signature algorithm is not supported here`;
  } else {
    message = endsAtRoot ? "Chain links verify" : "Chain links verify · the root certificate is not included";
  }
  if (!ordered) message = `${message} · shown in pasted order`;
  return { ordered, links, ok: !failed && !unchecked, message, endsAtRoot };
}

const PEM_BLOCK = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;

const base64ToBytes = (text: string): Uint8Array | null => {
  const clean = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!clean || !/^[A-Za-z0-9+/]+=*$/.test(clean)) return null;
  try {
    const binary = atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, "="));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
};

const NOT_PEM = "Paste a PEM certificate (-----BEGIN CERTIFICATE-----) or open a .pem, .crt, .cer, or .der file.";

type RawBlock = { kind: "certificate" | "csr" | "unknown"; bytes: Uint8Array };

function splitInput(input: string, notes: string[]): RawBlock[] {
  const blocks: RawBlock[] = [];
  if (input.includes("-----BEGIN")) {
    for (const match of input.matchAll(PEM_BLOCK)) {
      const label = match[1];
      const kind =
        label === "CERTIFICATE" || label === "TRUSTED CERTIFICATE" || label === "X509 CERTIFICATE"
          ? "certificate"
          : label === "CERTIFICATE REQUEST" || label === "NEW CERTIFICATE REQUEST"
          ? "csr"
          : null;
      if (!kind) {
        notes.push(`Skipped a ${label} block. Only certificates and certificate requests are decoded.`);
        continue;
      }
      // Drop RFC 1421 headers such as "Proc-Type:" before the base64 body
      const body = match[2].split(/\r?\n/).filter((line) => !line.includes(":")).join("");
      const bytes = base64ToBytes(body);
      if (!bytes) throw new Error(`The ${label} block is not valid base64.`);
      blocks.push({ kind, bytes });
    }
    if (blocks.length === 0 && notes.length === 0) {
      throw new Error("Found a BEGIN line without a matching END line. Paste the whole PEM block.");
    }
    return blocks;
  }
  const bytes = base64ToBytes(input);
  // DER data always starts with an ASN.1 SEQUENCE
  if (!bytes || bytes[0] !== 0x30) throw new Error(NOT_PEM);
  return [{ kind: "unknown", bytes }];
}

/** The ArrayBuffer for exactly these bytes, as @peculiar/x509 expects. */
const exactBuffer = (bytes: Uint8Array) => bytes.slice().buffer;

/** Decodes pasted PEM or base64 DER text: one certificate, a chain, or certificate requests. */
export async function decodeCertificates(input: string): Promise<CertificateParseResult> {
  const notes: string[] = [];
  const blocks = splitInput(input.trim(), notes);
  const x509 = await loadX509();

  const certs: { cert: X509Certificate; inputIndex: number }[] = [];
  const requests: ParsedCsr[] = [];
  for (const [index, block] of blocks.entries()) {
    const inputIndex = index + 1;
    const buffer = exactBuffer(block.bytes);
    if (block.kind !== "csr") {
      try {
        certs.push({ cert: new x509.X509Certificate(buffer), inputIndex });
        continue;
      } catch (error) {
        if (block.kind === "certificate") {
          throw new Error(`Block ${inputIndex} is not a valid X.509 certificate${error instanceof Error ? `: ${error.message}` : "."}`);
        }
      }
    }
    try {
      requests.push(await readCsr(x509, new x509.Pkcs10CertificateRequest(buffer), inputIndex));
    } catch (error) {
      if (block.kind === "csr") {
        throw new Error(`Block ${inputIndex} is not a valid certificate request${error instanceof Error ? `: ${error.message}` : "."}`);
      }
      throw new Error(NOT_PEM);
    }
  }

  const ordered = certs.length > 1 ? orderChain(certs.map((c) => c.cert)) : null;
  const sequence = ordered
    ? ordered.map((cert) => certs.find((c) => c.cert === cert)!)
    : certs;
  const certificates = await Promise.all(sequence.map(({ cert, inputIndex }) => readCertificate(x509, cert, inputIndex)));
  const chain =
    certs.length > 1 ? await checkChain(sequence.map((c) => c.cert), certificates, ordered !== null) : null;

  return { certificates, requests, chain, notes };
}

const looksLikeText = (bytes: Uint8Array) => {
  const sample = bytes.subarray(0, 64);
  return sample.length > 0 && Array.from(sample).every((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127));
};

/**
 * Turns the bytes of an opened file into text for the input pane. PEM files are
 * returned as they are. DER files (binary, starting with an ASN.1 SEQUENCE) are
 * converted to PEM.
 */
export async function certificateFileToText(bytes: Uint8Array): Promise<string> {
  if (looksLikeText(bytes)) return new TextDecoder().decode(bytes);
  if (bytes[0] !== 0x30) throw new Error("The file is not a PEM or DER certificate.");
  const x509 = await loadX509();
  const buffer = exactBuffer(bytes);
  try {
    return new x509.X509Certificate(buffer).toString("pem");
  } catch {
    try {
      return new x509.Pkcs10CertificateRequest(buffer).toString("pem");
    } catch {
      throw new Error("The file is not a DER certificate or certificate request.");
    }
  }
}

/** A JSON summary of the decoded result, without the PEM bodies. */
export function certificateSummaryJson(result: CertificateParseResult): string {
  const strip = <T extends { pem: string }>({ pem: _pem, ...rest }: T) => rest;
  return JSON.stringify(
    {
      certificates: result.certificates.map((cert) => ({
        ...strip(cert),
        notBefore: cert.notBefore.toISOString(),
        notAfter: cert.notAfter.toISOString(),
        validity: validityStatus(cert.notBefore, cert.notAfter).label,
      })),
      ...(result.requests.length ? { requests: result.requests.map(strip) } : {}),
      ...(result.chain ? { chain: { ok: result.chain.ok, message: result.chain.message, links: result.chain.links } } : {}),
    },
    null,
    2,
  );
}
