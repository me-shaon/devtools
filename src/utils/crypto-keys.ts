/**
 * Shared key helpers for the JWT Decoder and the Key Pair Generator: Base64, PEM,
 * a minimal DER reader and writer, and a parser for pasted PEM, JWK, and JWKS text.
 */

/** Decodes base64url (or base64) text to bytes. Throws on characters outside the alphabet. */
export function base64ToBytes(value: string): Uint8Array {
  const base64 = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Wraps DER bytes in a PEM block with 64-character lines. */
export function toPem(label: string, data: ArrayBuffer | Uint8Array, lineLength = 64): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const lines = bytesToBase64(bytes).match(new RegExp(`.{1,${lineLength}}`, "g")) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

// Minimal DER helpers, to convert PKCS#1, SEC1 and X.509 keys to the formats Web Crypto imports.

export const OID_RSA = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
export const OID_EC = [0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01];
export const OID_ED25519 = [0x06, 0x03, 0x2b, 0x65, 0x70];
export const CURVE_OIDS: Record<string, number[]> = {
  "P-256": [0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07],
  "P-384": [0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22],
  "P-521": [0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x23],
};
const SEC1_KEY_SIZES: Record<number, string> = { 32: "P-256", 48: "P-384", 66: "P-521" };

export function der(tag: number, ...parts: ArrayLike<number>[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const lengthBytes: number[] = [];
  if (length < 0x80) {
    lengthBytes.push(length);
  } else {
    for (let n = length; n > 0; n = Math.floor(n / 256)) lengthBytes.unshift(n & 0xff);
    lengthBytes.unshift(0x80 | lengthBytes.length);
  }
  const out = new Uint8Array(1 + lengthBytes.length + length);
  out[0] = tag;
  out.set(lengthBytes, 1);
  let offset = 1 + lengthBytes.length;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export interface DerNode {
  tag: number;
  /** Offset of the tag byte. */
  offset: number;
  start: number;
  end: number;
}

export function readDer(bytes: Uint8Array, offset: number): DerNode {
  if (offset + 2 > bytes.length) throw new Error("Truncated DER data");
  let length = bytes[offset + 1];
  let start = offset + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4) throw new Error("Unsupported DER length");
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[start + i];
    start += count;
  }
  if (start + length > bytes.length) throw new Error("Truncated DER data");
  return { tag: bytes[offset], offset, start, end: start + length };
}

export function derChildren(bytes: Uint8Array, node: DerNode): DerNode[] {
  const children: DerNode[] = [];
  for (let offset = node.start; offset < node.end; ) {
    const child = readDer(bytes, offset);
    children.push(child);
    offset = child.end;
  }
  return children;
}

/** Returns the SubjectPublicKeyInfo of an X.509 certificate. */
function certificateSpki(cert: Uint8Array): Uint8Array {
  const tbs = derChildren(cert, readDer(cert, 0))[0];
  const fields = derChildren(cert, tbs);
  // tbsCertificate: [0] version (optional), serial, signature, issuer, validity, subject, spki.
  const spki = fields[(fields[0].tag === 0xa0 ? 1 : 0) + 5];
  if (!spki || spki.tag !== 0x30) throw new Error("No public key in the certificate");
  return cert.slice(spki.offset, spki.end);
}

function sec1Curve(sec1: Uint8Array): string | undefined {
  // ECPrivateKey: SEQUENCE { version, privateKey OCTET STRING, ... }
  const privateKey = derChildren(sec1, readDer(sec1, 0))[1];
  return privateKey ? SEC1_KEY_SIZES[privateKey.end - privateKey.start] : undefined;
}

export type ParsedKey =
  | { kind: "secret" }
  | { kind: "spki"; der: Uint8Array }
  | { kind: "pkcs8"; der: Uint8Array }
  | { kind: "jwk"; jwk: JsonWebKey & { kid?: string; alg?: string } }
  | { kind: "jwks"; keys: (JsonWebKey & { kid?: string; alg?: string })[] };

/** An error whose message is meant for the user. */
export class KeyInputError extends Error {}

const PEM_PATTERN = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/;

/**
 * Reads pasted key text: PEM (public, private, or certificate), a JWK, or a JWKS.
 * Text that is neither JSON nor PEM is returned as `{ kind: "secret" }`.
 */
export function parseKeyText(text: string): ParsedKey {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new KeyInputError("The key is not valid JSON.");
    }
    if (json && typeof json === "object" && Array.isArray((json as { keys?: unknown }).keys)) {
      return { kind: "jwks", keys: (json as { keys: JsonWebKey[] }).keys };
    }
    if (json && typeof json === "object" && typeof (json as JsonWebKey).kty === "string") {
      return { kind: "jwk", jwk: json as JsonWebKey };
    }
    throw new KeyInputError("The JSON is not a JWK or a JWKS. A JWK needs a \"kty\" field.");
  }

  const pem = PEM_PATTERN.exec(trimmed);
  if (!pem) return { kind: "secret" };
  const label = pem[1];
  let body: Uint8Array;
  try {
    body = base64ToBytes(pem[2].replace(/\s+/g, ""));
  } catch {
    throw new KeyInputError("The PEM body is not valid Base64.");
  }
  try {
    switch (label) {
      case "PUBLIC KEY":
        return { kind: "spki", der: body };
      case "RSA PUBLIC KEY":
        return { kind: "spki", der: der(0x30, der(0x30, OID_RSA, [0x05, 0x00]), der(0x03, [0x00], body)) };
      case "CERTIFICATE":
        return { kind: "spki", der: certificateSpki(body) };
      case "PRIVATE KEY":
        return { kind: "pkcs8", der: body };
      case "RSA PRIVATE KEY":
        return { kind: "pkcs8", der: der(0x30, [0x02, 0x01, 0x00], der(0x30, OID_RSA, [0x05, 0x00]), der(0x04, body)) };
      case "EC PRIVATE KEY": {
        const curve = sec1Curve(body);
        if (!curve) throw new KeyInputError("The EC private key uses an unsupported curve.");
        return { kind: "pkcs8", der: der(0x30, [0x02, 0x01, 0x00], der(0x30, OID_EC, CURVE_OIDS[curve]), der(0x04, body)) };
      }
      case "ENCRYPTED PRIVATE KEY":
        throw new KeyInputError("The private key is encrypted. Decrypt it first, for example with openssl pkcs8.");
      default:
        throw new KeyInputError(`PEM type "${label}" is not supported.`);
    }
  } catch (error) {
    if (error instanceof KeyInputError) throw error;
    throw new KeyInputError(`The ${label.toLowerCase()} is not valid DER data.`);
  }
}
