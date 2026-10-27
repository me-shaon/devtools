/**
 * Key Pair Generator: makes RSA, ECDSA and Ed25519 keys with Web Crypto, reads pasted keys,
 * and writes them as PEM, JWK and OpenSSH. The OpenSSH wire encoding (RFC 4253, RFC 5656,
 * RFC 8709, and the openssh-key-v1 container from PROTOCOL.key) is written here by hand.
 */

import {
  CURVE_OIDS,
  KeyInputError,
  OID_EC,
  OID_ED25519,
  OID_RSA,
  base64ToBytes,
  bytesToBase64,
  bytesToBase64Url,
  derChildren,
  parseKeyText,
  readDer,
  toPem,
} from "@/utils/crypto-keys";

export { KeyInputError };

export const KEY_TYPES = [
  { value: "ed25519", label: "Ed25519" },
  { value: "ec-p256", label: "ECDSA P-256" },
  { value: "ec-p384", label: "ECDSA P-384" },
  { value: "ec-p521", label: "ECDSA P-521" },
  { value: "rsa-2048", label: "RSA 2048" },
  { value: "rsa-3072", label: "RSA 3072" },
  { value: "rsa-4096", label: "RSA 4096" },
] as const;

export type KeyType = (typeof KEY_TYPES)[number]["value"];

/** A JWK as Web Crypto exports it, plus the optional hint fields. */
export type Jwk = JsonWebKey & { kid?: string };

type Curve = "P-256" | "P-384" | "P-521";

const CURVE_SIZES: Record<Curve, number> = { "P-256": 32, "P-384": 48, "P-521": 66 };
const SSH_CURVES: Record<Curve, string> = { "P-256": "nistp256", "P-384": "nistp384", "P-521": "nistp521" };
const CURVE_BY_SSH_NAME: Record<string, Curve> = { nistp256: "P-256", nistp384: "P-384", nistp521: "P-521" };

export const ED25519_UNSUPPORTED = "This system does not support Ed25519 keys. Choose an ECDSA or RSA key, or update the system.";

const isCurve = (crv: unknown): crv is Curve => typeof crv === "string" && crv in CURVE_SIZES;

// ---------------------------------------------------------------------------
// Web Crypto

function webCryptoParams(jwk: Jwk): RsaHashedImportParams | EcKeyImportParams | Algorithm {
  if (jwk.kty === "RSA") return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  if (jwk.kty === "EC") return { name: "ECDSA", namedCurve: jwk.crv! };
  return { name: "Ed25519" };
}

/** Runs a Web Crypto call and turns a missing Ed25519 implementation into a readable error. */
async function withEd25519Check<T>(isEd25519: boolean, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isEd25519) throw new KeyInputError(ED25519_UNSUPPORTED);
    throw error;
  }
}

/** Keeps only the key fields, so Web Crypto does not reject `alg`, `use` or `kid` hints. */
function keyFields(jwk: Jwk, includePrivate: boolean): Jwk {
  const names =
    jwk.kty === "RSA"
      ? ["n", "e", ...(includePrivate ? ["d", "p", "q", "dp", "dq", "qi"] : [])]
      : ["crv", "x", ...(jwk.kty === "EC" ? ["y"] : []), ...(includePrivate ? ["d"] : [])];
  const out: Record<string, unknown> = { kty: jwk.kty };
  for (const name of names) if ((jwk as Record<string, unknown>)[name] !== undefined) out[name] = (jwk as Record<string, unknown>)[name];
  return out as Jwk;
}

/**
 * Generates a new key pair and returns the private key as a JWK.
 * RSA keys work for signing (RS*, PS*) and encryption (RSA-OAEP): the key material is the same.
 */
export async function generateKeyPair(type: KeyType): Promise<Jwk> {
  let params: RsaHashedKeyGenParams | EcKeyGenParams | Algorithm;
  if (type.startsWith("rsa-")) {
    params = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: Number(type.slice(4)), publicExponent: new Uint8Array([1, 0, 1]) };
  } else if (type.startsWith("ec-")) {
    params = { name: "ECDSA", namedCurve: `P-${type.slice(4)}` };
  } else {
    params = { name: "Ed25519" };
  }
  return withEd25519Check(type === "ed25519", async () => {
    const pair = (await crypto.subtle.generateKey(params, true, ["sign", "verify"])) as CryptoKeyPair;
    return keyFields((await crypto.subtle.exportKey("jwk", pair.privateKey)) as Jwk, true);
  });
}

// ---------------------------------------------------------------------------
// Key description

export interface KeyInfo {
  /** For example "Ed25519", "ECDSA P-256" or "RSA 2048-bit". */
  label: string;
  bits: number;
  isPrivate: boolean;
}

const stripZeros = (bytes: Uint8Array) => {
  let i = 0;
  while (i < bytes.length && bytes[i] === 0) i++;
  return bytes.slice(i);
};

function bitLength(bytes: Uint8Array): number {
  const value = stripZeros(bytes);
  return value.length === 0 ? 0 : (value.length - 1) * 8 + (32 - Math.clz32(value[0]));
}

const field = (jwk: Jwk, name: string): Uint8Array => {
  const value = (jwk as Record<string, unknown>)[name];
  if (typeof value !== "string" || !value) throw new KeyInputError(`The JWK has no "${name}" field.`);
  try {
    return base64ToBytes(value);
  } catch {
    throw new KeyInputError(`The JWK "${name}" field is not valid Base64URL.`);
  }
};

/** Checks that a JWK has the fields this tool needs. Throws a KeyInputError when it does not. */
function checkJwk(jwk: Jwk): void {
  if (jwk.kty === "RSA") {
    field(jwk, "n");
    field(jwk, "e");
    if (jwk.d !== undefined) for (const name of ["d", "p", "q", "dp", "dq", "qi"]) field(jwk, name);
  } else if (jwk.kty === "EC") {
    if (!isCurve(jwk.crv)) throw new KeyInputError(`The EC curve "${String(jwk.crv)}" is not supported. Use P-256, P-384 or P-521.`);
    const size = CURVE_SIZES[jwk.crv];
    for (const name of jwk.d !== undefined ? ["x", "y", "d"] : ["x", "y"]) {
      if (field(jwk, name).length !== size) throw new KeyInputError(`The JWK "${name}" field has the wrong length for ${jwk.crv}.`);
    }
  } else if (jwk.kty === "OKP") {
    if (jwk.crv !== "Ed25519") throw new KeyInputError(`The OKP curve "${String(jwk.crv)}" is not supported. Use Ed25519.`);
    for (const name of jwk.d !== undefined ? ["x", "d"] : ["x"]) {
      if (field(jwk, name).length !== 32) throw new KeyInputError(`The JWK "${name}" field must be 32 bytes for Ed25519.`);
    }
  } else {
    throw new KeyInputError(`The key type "${String(jwk.kty)}" is not supported. Use RSA, EC or OKP (Ed25519).`);
  }
}

export function describeKey(jwk: Jwk): KeyInfo {
  const isPrivate = jwk.d !== undefined;
  if (jwk.kty === "RSA") {
    const bits = bitLength(field(jwk, "n"));
    return { label: `RSA ${bits}-bit`, bits, isPrivate };
  }
  if (jwk.kty === "EC") {
    return { label: `ECDSA ${jwk.crv}`, bits: jwk.crv === "P-521" ? 521 : CURVE_SIZES[jwk.crv as Curve] * 8, isPrivate };
  }
  return { label: "Ed25519", bits: 256, isPrivate };
}

// ---------------------------------------------------------------------------
// JWK

/** RFC 7638 JWK thumbprint: SHA-256 over the required members in lexicographic order, as Base64URL. */
export async function jwkThumbprint(jwk: Jwk): Promise<string> {
  const required =
    jwk.kty === "RSA"
      ? { e: jwk.e, kty: jwk.kty, n: jwk.n }
      : jwk.kty === "EC"
        ? { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }
        : { crv: jwk.crv, kty: jwk.kty, x: jwk.x };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(required)));
  return bytesToBase64Url(new Uint8Array(digest));
}

export type JwkUse = "sig" | "enc" | "";

/** The JWA `alg` values that fit a key and a `use`. An empty `use` allows both. */
export function jwkAlgorithms(jwk: Pick<Jwk, "kty" | "crv">, use: JwkUse): string[] {
  let sig: string[];
  let enc: string[];
  if (jwk.kty === "RSA") {
    sig = ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512"];
    enc = ["RSA-OAEP", "RSA-OAEP-256"];
  } else if (jwk.kty === "EC") {
    sig = [{ "P-256": "ES256", "P-384": "ES384", "P-521": "ES512" }[jwk.crv as Curve]];
    enc = ["ECDH-ES", "ECDH-ES+A128KW", "ECDH-ES+A256KW"];
  } else {
    // Ed25519 only signs. Encryption with an OKP key needs X25519, which is a different key.
    sig = ["EdDSA", "Ed25519"];
    enc = [];
  }
  return use === "sig" ? sig : use === "enc" ? enc : [...sig, ...enc];
}

/** The `use` values that fit a key: Ed25519 keys cannot encrypt. */
export const jwkUses = (jwk: Pick<Jwk, "kty">): JwkUse[] => (jwk.kty === "OKP" ? ["sig", ""] : ["sig", "enc", ""]);

// ---------------------------------------------------------------------------
// OpenSSH wire encoding

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const uint32 = (value: number) => new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
const utf8 = (text: string) => new TextEncoder().encode(text);
const sshString = (bytes: Uint8Array | string) => {
  const data = typeof bytes === "string" ? utf8(bytes) : bytes;
  return concat(uint32(data.length), data);
};

/** An SSH mpint of a positive number: minimal big-endian bytes, with a 0x00 byte when the top bit is set. */
const mpint = (bytes: Uint8Array) => {
  const value = stripZeros(bytes);
  return sshString(value.length && value[0] & 0x80 ? concat(new Uint8Array([0]), value) : value);
};

/** Left-pads big-endian bytes to `size`. */
const pad = (bytes: Uint8Array, size: number) => {
  const value = stripZeros(bytes);
  if (value.length > size) throw new KeyInputError("A key value is too long for its curve.");
  return concat(new Uint8Array(size - value.length), value);
};

const ecPoint = (jwk: Jwk) => {
  const size = CURVE_SIZES[jwk.crv as Curve];
  return concat(new Uint8Array([4]), pad(field(jwk, "x"), size), pad(field(jwk, "y"), size));
};

/** The OpenSSH key type name, for example "ssh-ed25519" or "ecdsa-sha2-nistp256". */
export function sshKeyType(jwk: Jwk): string {
  if (jwk.kty === "RSA") return "ssh-rsa";
  if (jwk.kty === "EC") return `ecdsa-sha2-${SSH_CURVES[jwk.crv as Curve]}`;
  return "ssh-ed25519";
}

/** The SSH public key blob: the bytes inside an authorized_keys line. */
export function sshPublicKeyBlob(jwk: Jwk): Uint8Array {
  const type = sshKeyType(jwk);
  if (jwk.kty === "RSA") return concat(sshString(type), mpint(field(jwk, "e")), mpint(field(jwk, "n")));
  if (jwk.kty === "EC") return concat(sshString(type), sshString(SSH_CURVES[jwk.crv as Curve]), sshString(ecPoint(jwk)));
  return concat(sshString(type), sshString(field(jwk, "x")));
}

/** A one-line OpenSSH public key, as in id_ed25519.pub or authorized_keys. */
export function sshPublicKeyLine(jwk: Jwk, comment = ""): string {
  const line = `${sshKeyType(jwk)} ${bytesToBase64(sshPublicKeyBlob(jwk))}`;
  const cleanComment = comment.replace(/[\r\n]+/g, " ").trim();
  return cleanComment ? `${line} ${cleanComment}` : line;
}

/** The SSH fingerprint, as `ssh-keygen -l` prints it: "SHA256:" and unpadded Base64. */
export async function sshFingerprint(jwk: Jwk): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", sshPublicKeyBlob(jwk) as BufferSource);
  return `SHA256:${bytesToBase64(new Uint8Array(digest)).replace(/=+$/, "")}`;
}

const OPENSSH_MAGIC = utf8("openssh-key-v1\0");

/**
 * An unencrypted OpenSSH private key (openssh-key-v1), as `ssh-keygen -N ""` writes it.
 * `checkInt` is the random check value. The default derives it from the public key,
 * so the same key and comment always give the same text. The text ends with a newline.
 */
export async function openSshPrivateKey(jwk: Jwk, comment = "", checkInt?: number): Promise<string> {
  if (jwk.d === undefined) throw new KeyInputError("An OpenSSH private key needs a private key.");
  const publicBlob = sshPublicKeyBlob(jwk);
  let check = checkInt;
  if (check === undefined) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", publicBlob as BufferSource));
    check = ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0;
  }

  let keyFieldsBytes: Uint8Array;
  if (jwk.kty === "RSA") {
    // ssh-rsa private fields: n, e, d, iqmp (q^-1 mod p, the JWK "qi"), p, q.
    keyFieldsBytes = concat(...["n", "e", "d", "qi", "p", "q"].map((name) => mpint(field(jwk, name))));
  } else if (jwk.kty === "EC") {
    keyFieldsBytes = concat(sshString(SSH_CURVES[jwk.crv as Curve]), sshString(ecPoint(jwk)), mpint(field(jwk, "d")));
  } else {
    // ssh-ed25519 private fields: the public key, then the 64-byte seed + public key.
    const x = field(jwk, "x");
    keyFieldsBytes = concat(sshString(x), sshString(concat(field(jwk, "d"), x)));
  }

  const body = concat(uint32(check), uint32(check), sshString(sshKeyType(jwk)), keyFieldsBytes, sshString(comment.replace(/[\r\n]+/g, " ").trim()));
  // Pad to the cipher block size (8 for "none") with the bytes 1, 2, 3, ...
  const padding = new Uint8Array((8 - (body.length % 8)) % 8).map((_, i) => i + 1);
  const data = concat(
    OPENSSH_MAGIC,
    sshString("none"),
    sshString("none"),
    sshString(new Uint8Array(0)),
    uint32(1),
    sshString(publicBlob),
    sshString(concat(body, padding)),
  );
  // OpenSSH rejects the file as "invalid format" without the final newline.
  return `${toPem("OPENSSH PRIVATE KEY", data, 70)}\n`;
}

// ---------------------------------------------------------------------------
// Reading OpenSSH keys

class SshReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get done() {
    return this.offset >= this.bytes.length;
  }

  uint32(): number {
    if (this.offset + 4 > this.bytes.length) throw new KeyInputError("The SSH key data is truncated.");
    const b = this.bytes;
    const value = ((b[this.offset] << 24) | (b[this.offset + 1] << 16) | (b[this.offset + 2] << 8) | b[this.offset + 3]) >>> 0;
    this.offset += 4;
    return value;
  }

  bytesField(): Uint8Array {
    const length = this.uint32();
    if (this.offset + length > this.bytes.length) throw new KeyInputError("The SSH key data is truncated.");
    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  text(): string {
    return new TextDecoder().decode(this.bytesField());
  }
}

const b64u = (bytes: Uint8Array) => bytesToBase64Url(stripZeros(bytes));

/** Reads the type-specific public fields of an SSH key into a public JWK. */
function readSshPublicFields(type: string, reader: SshReader): Jwk {
  if (type === "ssh-rsa") {
    const e = reader.bytesField();
    const n = reader.bytesField();
    return { kty: "RSA", n: b64u(n), e: b64u(e) };
  }
  if (type.startsWith("ecdsa-sha2-")) {
    const curve = CURVE_BY_SSH_NAME[reader.text()];
    const point = reader.bytesField();
    if (!curve || CURVE_BY_SSH_NAME[type.slice(11)] !== curve) throw new KeyInputError(`The SSH key type "${type}" is not supported.`);
    const size = CURVE_SIZES[curve];
    if (point.length !== 1 + 2 * size || point[0] !== 4) throw new KeyInputError("The ECDSA public key point is not valid.");
    return { kty: "EC", crv: curve, x: bytesToBase64Url(point.slice(1, 1 + size)), y: bytesToBase64Url(point.slice(1 + size)) };
  }
  if (type === "ssh-ed25519") {
    const x = reader.bytesField();
    if (x.length !== 32) throw new KeyInputError("The Ed25519 public key must be 32 bytes.");
    return { kty: "OKP", crv: "Ed25519", x: bytesToBase64Url(x) };
  }
  throw new KeyInputError(`The SSH key type "${type}" is not supported. Use ssh-ed25519, ecdsa-sha2-nistp256/384/521 or ssh-rsa.`);
}

const SSH_PUBLIC_PATTERN = /(?:^|\s)(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp(?:256|384|521)|ssh-dss|sk-\S+)\s+([A-Za-z0-9+/=]+)(?:[ \t]+([^\r\n]*))?/;

/** Reads a one-line OpenSSH public key. Leading authorized_keys options are skipped. */
export function parseSshPublicKey(text: string): { jwk: Jwk; comment: string } | null {
  const match = SSH_PUBLIC_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, type, base64, comment = ""] = match;
  let blob: Uint8Array;
  try {
    blob = base64ToBytes(base64);
  } catch {
    throw new KeyInputError("The SSH public key is not valid Base64.");
  }
  const reader = new SshReader(blob);
  const innerType = reader.text();
  if (innerType !== type) throw new KeyInputError(`The key data is "${innerType}", but the line says "${type}".`);
  return { jwk: readSshPublicFields(type, reader), comment: comment.trim() };
}

// BigInt helpers for the RSA CRT values that OpenSSH does not store.
const toBigInt = (bytes: Uint8Array) => (bytes.length ? BigInt(`0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`) : 0n);
const fromBigInt = (value: bigint) => {
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  return new Uint8Array(hex.match(/../g)!.map((pair) => parseInt(pair, 16)));
};

/** Reads an unencrypted OpenSSH private key (-----BEGIN OPENSSH PRIVATE KEY-----). */
export function parseOpenSshPrivateKey(text: string): { jwk: Jwk; comment: string } {
  const match = /-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]*?)-----END OPENSSH PRIVATE KEY-----/.exec(text);
  if (!match) throw new KeyInputError("The text is not an OpenSSH private key.");
  let data: Uint8Array;
  try {
    data = base64ToBytes(match[1].replace(/\s+/g, ""));
  } catch {
    throw new KeyInputError("The OpenSSH private key is not valid Base64.");
  }
  if (!OPENSSH_MAGIC.every((byte, i) => data[i] === byte)) throw new KeyInputError("The OpenSSH private key has an unknown format.");
  const reader = new SshReader(data.slice(OPENSSH_MAGIC.length));
  const cipher = reader.text();
  reader.text(); // KDF name
  reader.bytesField(); // KDF options
  if (cipher !== "none") {
    throw new KeyInputError("The OpenSSH private key has a passphrase. Remove it first with ssh-keygen -p, or paste the public key.");
  }
  if (reader.uint32() !== 1) throw new KeyInputError("The file holds more than one key. Paste one key.");
  reader.bytesField(); // public key blob, repeated in the private section
  const section = new SshReader(reader.bytesField());
  if (section.uint32() !== section.uint32()) throw new KeyInputError("The OpenSSH private key is damaged: the check values differ.");
  const type = section.text();

  let jwk: Jwk;
  if (type === "ssh-rsa") {
    const [n, e, d, qi, p, q] = Array.from({ length: 6 }, () => stripZeros(section.bytesField()));
    const dBig = toBigInt(d);
    jwk = {
      kty: "RSA",
      n: b64u(n),
      e: b64u(e),
      d: b64u(d),
      p: b64u(p),
      q: b64u(q),
      dp: bytesToBase64Url(fromBigInt(dBig % (toBigInt(p) - 1n))),
      dq: bytesToBase64Url(fromBigInt(dBig % (toBigInt(q) - 1n))),
      qi: b64u(qi),
    };
  } else if (type.startsWith("ecdsa-sha2-")) {
    jwk = readSshPublicFields(type, section);
    jwk.d = bytesToBase64Url(pad(section.bytesField(), CURVE_SIZES[jwk.crv as Curve]));
  } else if (type === "ssh-ed25519") {
    jwk = readSshPublicFields(type, section);
    const secret = section.bytesField();
    if (secret.length !== 64) throw new KeyInputError("The Ed25519 private key must be 64 bytes.");
    jwk.d = bytesToBase64Url(secret.slice(0, 32));
  } else {
    throw new KeyInputError(`The SSH key type "${type}" is not supported.`);
  }
  return { jwk, comment: section.text() };
}

// ---------------------------------------------------------------------------
// Reading pasted keys

/** Finds the key type of a PKCS#8 or SPKI structure from its AlgorithmIdentifier. */
function derKeyParams(bytes: Uint8Array, kind: "spki" | "pkcs8"): { jwk: Pick<Jwk, "kty" | "crv">; params: RsaHashedImportParams | EcKeyImportParams | Algorithm } {
  let oid: Uint8Array;
  let curveOid: Uint8Array | undefined;
  try {
    const top = derChildren(bytes, readDer(bytes, 0));
    const algorithm = derChildren(bytes, top[kind === "spki" ? 0 : 1]);
    oid = bytes.slice(algorithm[0].offset, algorithm[0].end);
    if (algorithm[1]?.tag === 0x06) curveOid = bytes.slice(algorithm[1].offset, algorithm[1].end);
  } catch {
    throw new KeyInputError("The key is not valid DER data.");
  }
  const same = (a: ArrayLike<number> | undefined, b: number[]) => a !== undefined && a.length === b.length && b.every((byte, i) => a[i] === byte);
  if (same(oid, OID_RSA)) return { jwk: { kty: "RSA" }, params: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } };
  if (same(oid, OID_ED25519)) return { jwk: { kty: "OKP", crv: "Ed25519" }, params: { name: "Ed25519" } };
  if (same(oid, OID_EC)) {
    const curve = (Object.keys(CURVE_SIZES) as Curve[]).find((name) => same(curveOid, CURVE_OIDS[name]));
    if (!curve) throw new KeyInputError("The EC key uses an unsupported curve. Use P-256, P-384 or P-521.");
    return { jwk: { kty: "EC", crv: curve }, params: { name: "ECDSA", namedCurve: curve } };
  }
  throw new KeyInputError("The key type is not supported. Use RSA, ECDSA (P-256, P-384, P-521) or Ed25519.");
}

async function importDer(bytes: Uint8Array, kind: "spki" | "pkcs8"): Promise<Jwk> {
  const { jwk: type, params } = derKeyParams(bytes, kind);
  return withEd25519Check(type.kty === "OKP", async () => {
    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey(kind, bytes as BufferSource, params, true, [kind === "spki" ? "verify" : "sign"]);
    } catch (error) {
      if (type.kty === "OKP") throw error;
      throw new KeyInputError("The key data is not valid.");
    }
    return keyFields((await crypto.subtle.exportKey("jwk", key)) as Jwk, kind === "pkcs8");
  });
}

export interface ReadKeyResult {
  jwk: Jwk;
  /** The comment of an OpenSSH key, when it has one. */
  comment: string;
  /** The `kid`, `use` and `alg` of a pasted JWK. */
  hints: { kid?: string; use?: string; alg?: string };
}

/**
 * Reads a pasted key: PEM (PKCS#8, SPKI, PKCS#1, SEC1 or a certificate), a JWK,
 * a JWKS with one key, an OpenSSH public key line, or an unencrypted OpenSSH private key.
 */
export async function readKey(text: string): Promise<ReadKeyResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new KeyInputError("Paste a key.");
  if (trimmed.includes("-----BEGIN OPENSSH PRIVATE KEY-----")) {
    const { jwk, comment } = parseOpenSshPrivateKey(trimmed);
    checkJwk(jwk);
    return { jwk, comment, hints: {} };
  }
  if (!trimmed.startsWith("{") && !trimmed.includes("-----BEGIN")) {
    const ssh = parseSshPublicKey(trimmed);
    if (!ssh) throw new KeyInputError("The text is not a key. Paste a PEM, JWK, or OpenSSH key.");
    checkJwk(ssh.jwk);
    return { ...ssh, hints: {} };
  }

  const parsed = parseKeyText(trimmed);
  switch (parsed.kind) {
    case "spki":
    case "pkcs8":
      return { jwk: await importDer(parsed.der, parsed.kind), comment: "", hints: {} };
    case "jwks":
      if (parsed.keys.length !== 1) throw new KeyInputError(`The JWKS has ${parsed.keys.length} keys. Paste one key.`);
      return readJwk(parsed.keys[0]);
    case "jwk":
      return readJwk(parsed.jwk);
    default:
      throw new KeyInputError("The text is not a key. Paste a PEM, JWK, or OpenSSH key.");
  }
}

function readJwk(input: Jwk & { alg?: string; use?: string }): ReadKeyResult {
  checkJwk(input);
  const jwk = keyFields(input, input.d !== undefined);
  return { jwk, comment: "", hints: { kid: input.kid, use: input.use, alg: input.alg } };
}

// ---------------------------------------------------------------------------
// All outputs

export interface KeyOutputOptions {
  /** The JWK `kid`. Empty uses the JWK thumbprint. */
  kid?: string;
  use?: JwkUse;
  /** The JWK `alg`. Empty leaves it out. */
  alg?: string;
  /** The OpenSSH comment, often user@host. */
  comment?: string;
}

export interface KeyOutputs {
  info: KeyInfo;
  privatePem?: string;
  publicPem: string;
  privateJwk?: string;
  publicJwk: string;
  /** The public JWK in a JWKS ({"keys": [...]}), as a server publishes it. */
  jwks: string;
  sshPublic: string;
  sshPrivate?: string;
  sshFingerprint: string;
  thumbprint: string;
}

/** Writes a key in every format, with its fingerprints. */
export async function buildKeyOutputs(input: Jwk, options: KeyOutputOptions = {}): Promise<KeyOutputs> {
  checkJwk(input);
  const info = describeKey(input);
  const publicFields = keyFields(input, false);
  const thumbprint = await jwkThumbprint(publicFields);
  const hints: Record<string, string> = { kid: options.kid?.trim() || thumbprint };
  if (options.use) hints.use = options.use;
  if (options.alg) hints.alg = options.alg;
  const publicJwk = { ...publicFields, ...hints };
  const comment = options.comment ?? "";

  const params = webCryptoParams(input);
  const isEd25519 = input.kty === "OKP";
  const publicPem = await withEd25519Check(isEd25519, async () => {
    const key = await crypto.subtle.importKey("jwk", publicFields, params, true, ["verify"]);
    return toPem("PUBLIC KEY", await crypto.subtle.exportKey("spki", key));
  });

  const outputs: KeyOutputs = {
    info,
    publicPem,
    publicJwk: JSON.stringify(publicJwk, null, 2),
    jwks: JSON.stringify({ keys: [publicJwk] }, null, 2),
    sshPublic: sshPublicKeyLine(publicFields, comment),
    sshFingerprint: await sshFingerprint(publicFields),
    thumbprint,
  };

  if (info.isPrivate) {
    const privateFields = keyFields(input, true);
    outputs.privatePem = await withEd25519Check(isEd25519, async () => {
      let key: CryptoKey;
      try {
        key = await crypto.subtle.importKey("jwk", privateFields, params, true, ["sign"]);
      } catch (error) {
        if (isEd25519) throw error;
        throw new KeyInputError("The private key values are not valid.");
      }
      return toPem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", key));
    });
    outputs.privateJwk = JSON.stringify({ ...privateFields, ...hints }, null, 2);
    outputs.sshPrivate = await openSshPrivateKey(privateFields, comment);
  }
  return outputs;
}

/** The usual file name stem for a key type, as ssh-keygen names it. */
export const sshFileStem = (jwk: Pick<Jwk, "kty">) => (jwk.kty === "RSA" ? "id_rsa" : jwk.kty === "EC" ? "id_ecdsa" : "id_ed25519");
