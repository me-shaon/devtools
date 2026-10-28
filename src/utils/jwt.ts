/**
 * JWT decode, verify, and sign utilities. All crypto runs locally with Web Crypto.
 */

import {
  KeyInputError,
  base64ToBytes,
  bytesToBase64Url,
  parseKeyText,
  toPem,
} from "@/utils/crypto-keys";

export interface JwtHeader {
  alg?: string;
  typ?: string;
  [key: string]: unknown;
}

export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

export interface DecodedJwt {
  header: JwtHeader;
  payload: JwtPayload;
  signature: string;
  isValid: boolean;
  isExpired?: boolean;
  error?: string;
}

/** Removes surrounding whitespace and an "Authorization: Bearer" style prefix. */
export function cleanJwtInput(token: string): string {
  return token.trim().replace(/^(authorization:\s*)?bearer\s+/i, "").trim();
}

const textToBase64Url = (text: string) => bytesToBase64Url(new TextEncoder().encode(text));

/**
 * Decode JWT token
 */
export function decodeJwt(token: string): DecodedJwt {
  token = cleanJwtInput(token);
  if (!token) {
    return {
      header: {},
      payload: {},
      signature: "",
      isValid: false,
      error: "Please enter a JWT token",
    };
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return {
        header: {},
        payload: {},
        signature: "",
        isValid: false,
        error: "Invalid JWT format. Expected 3 parts separated by dots.",
      };
    }

    const [headerB64, payloadB64, signature] = parts;

    // Decode base64url as UTF-8 text
    const base64urlDecode = (str: string): string => {
      try {
        return new TextDecoder().decode(base64ToBytes(str));
      } catch (e) {
        throw new Error(`Failed to decode base64url: ${(e as Error).message}`);
      }
    };

    const headerJson = base64urlDecode(headerB64);
    const payloadJson = base64urlDecode(payloadB64);

    let header: JwtHeader;
    let payload: JwtPayload;

    try {
      header = JSON.parse(headerJson);
    } catch (e) {
      throw new Error(`Failed to parse header JSON: ${(e as Error).message}`);
    }

    try {
      payload = JSON.parse(payloadJson);
    } catch (e) {
      // Handle case where base64 padding creates extra bytes at the end
      // First try stripping trailing control characters
      // oxlint-disable-next-line no-control-regex
      let cleaned = payloadJson.replace(/[\x00-\x1F\x7F]+$/g, '');
      // Also try stripping replacement and other non-ASCII characters at the end
      cleaned = cleaned.replace(/[^\x20-\x7E]+$/g, '');

      // Check if JSON is complete (has closing brace)
      if (!cleaned.endsWith('}')) {
        // Try to find where the JSON should end and close it
        // This is a hack but handles the edge case of malformed base64 padding
        const openBraces = (cleaned.match(/\{/g) || []).length;
        const closeBraces = (cleaned.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
          cleaned += '}'.repeat(openBraces - closeBraces);
        }
      }

      try {
        payload = JSON.parse(cleaned);
      } catch {
        throw new Error(`Failed to parse payload JSON: ${(e as Error).message}`);
      }
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    const isExpired = payload.exp ? payload.exp < now : false;

    return {
      header,
      payload,
      signature,
      isValid: !isExpired,
      isExpired,
    };
  } catch (error) {
    return {
      header: {},
      payload: {},
      signature: "",
      isValid: false,
      error: "Invalid JWT token: " + (error as Error).message,
    };
  }
}

/**
 * Check if JWT is expired
 */
export function isJwtExpired(decoded: DecodedJwt): boolean {
  return decoded.isExpired === true;
}

/**
 * Get JWT expiration date
 */
export function getJwtExpirationDate(decoded: DecodedJwt): Date | null {
  if (decoded.payload.exp) {
    return new Date(decoded.payload.exp * 1000);
  }
  return null;
}

/**
 * Get JWT issued at date
 */
export function getJwtIssuedAtDate(decoded: DecodedJwt): Date | null {
  if (decoded.payload.iat) {
    return new Date(decoded.payload.iat * 1000);
  }
  return null;
}

/**
 * Validate JWT format (not signature)
 */
export function isValidJwtFormat(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

// ---------------------------------------------------------------------------
// Time claims

const TIME_UNITS: [string, number][] = [
  ["y", 365 * 86_400_000],
  ["d", 86_400_000],
  ["h", 3_600_000],
  ["min", 60_000],
  ["s", 1000],
];

/** A distance such as "in 1 h 30 min" or "3 d 4 h ago", with at most two units. */
export function formatRelativeTime(deltaMs: number): string {
  let rest = Math.round(Math.abs(deltaMs) / 1000) * 1000;
  if (rest === 0) return "now";
  const parts: string[] = [];
  for (const [unit, size] of TIME_UNITS) {
    if (parts.length === 2) break;
    const count = Math.floor(rest / size);
    if (count > 0) {
      parts.push(`${count} ${unit}`);
      rest -= count * size;
    } else if (parts.length > 0) {
      break;
    }
  }
  const text = parts.join(" ");
  return deltaMs > 0 ? `in ${text}` : `${text} ago`;
}

export type JwtTimeState = "active" | "expired" | "not-yet-valid" | "no-expiry";

export interface JwtTimeClaim {
  claim: "iat" | "nbf" | "exp";
  label: string;
  value: unknown;
  /** Null when the value is not a number. */
  date: Date | null;
  relative: string;
  warning?: string;
}

export interface JwtTimeInfo {
  state: JwtTimeState;
  summary: string;
  claims: JwtTimeClaim[];
}

const TIME_CLAIMS: [JwtTimeClaim["claim"], string][] = [
  ["iat", "Issued at (iat)"],
  ["nbf", "Not before (nbf)"],
  ["exp", "Expires at (exp)"],
];

/** Reads iat, nbf and exp, and tells whether the token is valid at `now`. */
export function describeTimeClaims(payload: Record<string, unknown>, now: number = Date.now()): JwtTimeInfo {
  const claims: JwtTimeClaim[] = [];
  for (const [claim, label] of TIME_CLAIMS) {
    const value = payload[claim];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      claims.push({ claim, label, value, date: null, relative: "", warning: "Not a number" });
      continue;
    }
    const date = new Date(value * 1000);
    const entry: JwtTimeClaim = { claim, label, value, date, relative: formatRelativeTime(date.getTime() - now) };
    // Seconds stay below 1e11 until the year 5138. Larger values are almost always milliseconds.
    if (value > 1e11) entry.warning = "This looks like milliseconds. JWT times are in seconds.";
    claims.push(entry);
  }

  const time = (claim: string) => claims.find((c) => c.claim === claim)?.date?.getTime();
  const exp = time("exp");
  const nbf = time("nbf");
  let state: JwtTimeState;
  let summary: string;
  if (exp !== undefined && exp <= now) {
    state = "expired";
    summary = `Expired ${formatRelativeTime(exp - now)}`;
  } else if (nbf !== undefined && nbf > now) {
    state = "not-yet-valid";
    summary = `Not valid yet (valid ${formatRelativeTime(nbf - now)})`;
  } else if (exp !== undefined) {
    state = "active";
    summary = `Expires ${formatRelativeTime(exp - now)}`;
  } else {
    state = "no-expiry";
    summary = "No exp claim";
  }
  return { state, summary, claims };
}

// ---------------------------------------------------------------------------
// Algorithms and keys

export const JWT_ALGORITHMS = [
  "HS256", "HS384", "HS512",
  "RS256", "RS384", "RS512",
  "PS256", "PS384", "PS512",
  "ES256", "ES384", "ES512",
  "EdDSA",
] as const;

export type JwtAlgorithm = (typeof JWT_ALGORITHMS)[number];

type Family = "hmac" | "rsa" | "pss" | "ec" | "ed";

interface AlgorithmSpec {
  family: Family;
  hash?: string;
  curve?: string;
  /** The JWK `kty` for this algorithm. */
  kty?: string;
}

const HASHES: Record<string, string> = { "256": "SHA-256", "384": "SHA-384", "512": "SHA-512" };
const CURVES: Record<string, string> = { "256": "P-256", "384": "P-384", "512": "P-521" };

function algorithmSpec(alg: string): AlgorithmSpec | null {
  // RFC 9864 adds "Ed25519" as a fully specified name for EdDSA with Ed25519.
  if (alg === "EdDSA" || alg === "Ed25519") return { family: "ed", kty: "OKP", curve: "Ed25519" };
  const match = /^(HS|RS|PS|ES)(256|384|512)$/.exec(alg);
  if (!match) return null;
  const hash = HASHES[match[2]];
  switch (match[1]) {
    case "HS": return { family: "hmac", hash };
    case "RS": return { family: "rsa", hash, kty: "RSA" };
    case "PS": return { family: "pss", hash, kty: "RSA" };
    default: return { family: "ec", hash, kty: "EC", curve: CURVES[match[2]] };
  }
}

/** True for algorithms that use a key pair instead of a shared secret. */
export function isAsymmetricAlgorithm(alg: unknown): boolean {
  const spec = typeof alg === "string" ? algorithmSpec(alg) : null;
  return Boolean(spec && spec.family !== "hmac");
}

function importParams(spec: AlgorithmSpec): RsaHashedImportParams | EcKeyImportParams | Algorithm {
  switch (spec.family) {
    case "rsa": return { name: "RSASSA-PKCS1-v1_5", hash: spec.hash! };
    case "pss": return { name: "RSA-PSS", hash: spec.hash! };
    case "ec": return { name: "ECDSA", namedCurve: spec.curve! };
    default: return { name: "Ed25519" };
  }
}

function signParams(spec: AlgorithmSpec): Algorithm | RsaPssParams | EcdsaParams {
  switch (spec.family) {
    case "hmac": return { name: "HMAC" };
    case "rsa": return { name: "RSASSA-PKCS1-v1_5" };
    // RFC 7518 fixes the PSS salt length to the hash output size.
    case "pss": return { name: "RSA-PSS", saltLength: Number(spec.hash!.slice(4)) / 8 };
    case "ec": return { name: "ECDSA", hash: spec.hash! };
    default: return { name: "Ed25519" };
  }
}

const PRIVATE_JWK_FIELDS = ["d", "p", "q", "dp", "dq", "qi", "oth", "k"];

/** Strips fields that make Web Crypto reject a JWK the user meant for this algorithm. */
function jwkForImport(jwk: JsonWebKey, publicOnly: boolean): JsonWebKey {
  const copy: Record<string, unknown> = { ...jwk };
  for (const field of ["alg", "use", "key_ops", "ext", "kid", "x5c", "x5t", "x5t#S256", "x5u"]) delete copy[field];
  if (publicOnly) for (const field of PRIVATE_JWK_FIELDS) delete copy[field];
  return copy as JsonWebKey;
}

const isPrivateJwk = (jwk: JsonWebKey) => typeof jwk.d === "string";

/** Checks a JWK's own `alg` and `kty` against the token algorithm before import. */
function checkJwkFits(jwk: JsonWebKey & { alg?: string }, alg: string, spec: AlgorithmSpec): void {
  if (jwk.alg && jwk.alg !== alg) throw new KeyInputError(`The key is for ${jwk.alg}, but the token uses ${alg}.`);
  if (jwk.kty !== spec.kty) throw new KeyInputError(`The key type ${jwk.kty} does not fit ${alg}.`);
}

async function importOrExplain(
  format: "spki" | "pkcs8" | "jwk",
  data: Uint8Array | JsonWebKey,
  spec: AlgorithmSpec,
  alg: string,
  usage: KeyUsage
): Promise<CryptoKey> {
  try {
    return format === "jwk"
      ? await crypto.subtle.importKey("jwk", data as JsonWebKey, importParams(spec), true, [usage])
      : await crypto.subtle.importKey(format, data as BufferSource, importParams(spec), true, [usage]);
  } catch (error) {
    if ((error as Error).name === "NotSupportedError" && spec.family === "ed") {
      throw new KeyInputError("This system does not support Ed25519 keys.");
    }
    throw new KeyInputError(`The key does not fit ${alg}. Check that the key type and curve match the algorithm.`);
  }
}

/** Imports a private key, then exports its public half as a CryptoKey for verification. */
async function publicFromPrivate(privateKey: CryptoKey, spec: AlgorithmSpec, alg: string): Promise<CryptoKey> {
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  return importOrExplain("jwk", jwkForImport(jwk, true), spec, alg, "verify");
}

/** Returns the candidate verification keys for the token, with their kid when known. */
async function verificationKeys(
  text: string,
  alg: string,
  spec: AlgorithmSpec,
  kid: unknown
): Promise<{ key: CryptoKey; kid?: string }[]> {
  const parsed = parseKeyText(text);
  switch (parsed.kind) {
    case "secret":
      throw new KeyInputError("Paste a PEM public key, a JWK, or a JWKS.");
    case "spki":
      return [{ key: await importOrExplain("spki", parsed.der, spec, alg, "verify") }];
    case "pkcs8":
      return [{ key: await publicFromPrivate(await importOrExplain("pkcs8", parsed.der, spec, alg, "sign"), spec, alg) }];
    case "jwk":
      checkJwkFits(parsed.jwk, alg, spec);
      return [{ key: await importOrExplain("jwk", jwkForImport(parsed.jwk, true), spec, alg, "verify"), kid: parsed.jwk.kid }];
    case "jwks": {
      let candidates = parsed.keys;
      if (typeof kid === "string") {
        candidates = candidates.filter((jwk) => jwk.kid === kid);
        if (candidates.length === 0) throw new KeyInputError(`No key in the JWKS has kid "${kid}".`);
      } else {
        candidates = candidates.filter((jwk) => jwk.kty === spec.kty && (!jwk.alg || jwk.alg === alg));
        if (candidates.length === 0) throw new KeyInputError(`No key in the JWKS fits ${alg}.`);
      }
      const keys: { key: CryptoKey; kid?: string }[] = [];
      for (const jwk of candidates) {
        checkJwkFits(jwk, alg, spec);
        keys.push({ key: await importOrExplain("jwk", jwkForImport(jwk, true), spec, alg, "verify"), kid: jwk.kid });
      }
      return keys;
    }
  }
}

function secretBytes(secret: string, secretIsBase64: boolean): Uint8Array {
  if (!secretIsBase64) return new TextEncoder().encode(secret);
  try {
    return base64ToBytes(secret);
  } catch {
    throw new KeyInputError("The secret is not valid Base64.");
  }
}

// ---------------------------------------------------------------------------
// Verify

export type JwtVerifyStatus = "valid" | "invalid" | "unsupported" | "error";

export interface JwtVerifyResult {
  status: JwtVerifyStatus;
  message: string;
}

/**
 * Verify the token signature with Web Crypto.
 * HS* tokens take a secret. RS*, PS*, ES* and EdDSA tokens take a PEM public key,
 * a certificate, a private key, a JWK, or a JWKS (the key is picked by `kid`).
 * This does not check exp, nbf, issuer, audience or key trust.
 */
export async function verifyJwtSignature(
  token: string,
  key: string,
  options: { secretIsBase64?: boolean } = {}
): Promise<JwtVerifyResult> {
  const trimmed = cleanJwtInput(token);
  const decoded = decodeJwt(trimmed);
  if (decoded.error) {
    return { status: "error", message: decoded.error };
  }

  const alg = typeof decoded.header.alg === "string" ? decoded.header.alg : "";
  if (alg === "none") {
    return { status: "unsupported", message: 'Unsigned token (alg "none")' };
  }
  const spec = algorithmSpec(alg);
  if (!spec) {
    return { status: "unsupported", message: "Algorithm not supported for verification" };
  }

  if (!key.trim()) {
    const what = spec.family === "hmac" ? "a secret" : "a public key";
    return { status: "error", message: `Enter ${what} to verify the signature.` };
  }

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = base64ToBytes(decoded.signature);
  } catch {
    return { status: "invalid", message: "Signature invalid" };
  }

  const [headerB64, payloadB64] = trimmed.split(".");
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  try {
    let keys: { key: CryptoKey; kid?: string }[];
    if (spec.family === "hmac") {
      if (parseKeyText(key).kind !== "secret") {
        throw new KeyInputError(`This looks like a public or private key. ${alg} tokens use a shared secret.`);
      }
      const raw = secretBytes(key, Boolean(options.secretIsBase64));
      keys = [{ key: await crypto.subtle.importKey("raw", raw as BufferSource, { name: "HMAC", hash: spec.hash! }, false, ["verify"]) }];
    } else {
      keys = await verificationKeys(key, alg, spec, decoded.header.kid);
    }

    for (const candidate of keys) {
      if (await crypto.subtle.verify(signParams(spec), candidate.key, signatureBytes as BufferSource, data)) {
        const message = candidate.kid ? `Signature valid (kid "${candidate.kid}")` : "Signature valid";
        return { status: "valid", message };
      }
    }
    return { status: "invalid", message: "Signature invalid" };
  } catch (error) {
    if (error instanceof KeyInputError) return { status: "error", message: error.message };
    return { status: "error", message: "Verification failed: " + (error as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Sign

async function signingKey(text: string, alg: string, spec: AlgorithmSpec, secretIsBase64: boolean): Promise<CryptoKey> {
  if (spec.family === "hmac") {
    if (!text) throw new KeyInputError("Enter a secret to sign the token.");
    const raw = secretBytes(text, secretIsBase64);
    return crypto.subtle.importKey("raw", raw as BufferSource, { name: "HMAC", hash: spec.hash! }, false, ["sign"]);
  }
  if (!text.trim()) throw new KeyInputError("Enter a private key to sign the token.");
  const parsed = parseKeyText(text);
  if (parsed.kind === "pkcs8") return importOrExplain("pkcs8", parsed.der, spec, alg, "sign");
  if (parsed.kind === "jwk" && isPrivateJwk(parsed.jwk)) {
    checkJwkFits(parsed.jwk, alg, spec);
    return importOrExplain("jwk", jwkForImport(parsed.jwk, false), spec, alg, "sign");
  }
  throw new KeyInputError("Paste a private key (PEM or JWK) to sign the token. A public key can only verify.");
}

/** Signs `header` and `payload` with the algorithm in `header.alg`. Throws with a readable message. */
export async function signJwt(
  header: JwtHeader,
  payload: unknown,
  key: string,
  options: { secretIsBase64?: boolean } = {}
): Promise<string> {
  const alg = typeof header.alg === "string" ? header.alg : "";
  const spec = algorithmSpec(alg);
  if (!spec) throw new Error(`Choose an algorithm to sign with. "${alg || "(none)"}" is not supported.`);
  const cryptoKey = await signingKey(key, alg, spec, Boolean(options.secretIsBase64));
  const data = `${textToBase64Url(JSON.stringify(header))}.${textToBase64Url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(signParams(spec), cryptoKey, new TextEncoder().encode(data));
  return `${data}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/** Generates a new key pair for an asymmetric algorithm, as PKCS#8 and SPKI PEM. */
export async function generateJwtKeyPair(alg: string): Promise<{ privateKeyPem: string; publicKeyPem: string }> {
  const spec = algorithmSpec(alg);
  if (!spec || spec.family === "hmac") throw new Error(`${alg} does not use a key pair.`);
  const params =
    spec.family === "rsa" || spec.family === "pss"
      ? { ...importParams(spec), modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }
      : importParams(spec);
  const pair = (await crypto.subtle.generateKey(params as RsaHashedKeyGenParams, true, ["sign", "verify"])) as CryptoKeyPair;
  return {
    privateKeyPem: toPem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
    publicKeyPem: toPem("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey)),
  };
}

/** Derives the public key (SPKI PEM and JWK) that matches a private signing key. */
export async function derivePublicKey(
  alg: string,
  privateKeyText: string,
  options: { kid?: string } = {}
): Promise<{ pem: string; jwk: JsonWebKey & { kid?: string; alg?: string; use?: string } }> {
  const spec = algorithmSpec(alg);
  if (!spec || spec.family === "hmac") throw new Error(`${alg} does not use a key pair.`);
  const privateKey = await signingKey(privateKeyText, alg, spec, false);
  const publicKey = await publicFromPrivate(privateKey, spec, alg);
  const exported = jwkForImport(await crypto.subtle.exportKey("jwk", publicKey), true);
  const jwk = { ...exported, ...(options.kid ? { kid: options.kid } : {}), alg, use: "sig" };
  return { pem: toPem("PUBLIC KEY", await crypto.subtle.exportKey("spki", publicKey)), jwk };
}

// ---------------------------------------------------------------------------
// Encoder helpers

/** Sets `alg` in header JSON text. Invalid JSON is replaced with a minimal header. */
export function setHeaderAlgorithm(headerText: string, alg: string): string {
  let header: Record<string, unknown>;
  try {
    const parsed = JSON.parse(headerText);
    header = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { typ: "JWT" };
  } catch {
    header = { typ: "JWT" };
  }
  const { alg: _old, ...rest } = header;
  void _old;
  return JSON.stringify({ alg, ...rest }, null, 2);
}

/**
 * Sets iat to `nowSeconds`, moves nbf (when present) to now, and sets exp so the token
 * keeps its lifetime (one hour when the payload has no lifetime). Invalid JSON is returned as it is.
 */
export function refreshTimeClaims(payloadText: string, nowSeconds: number): string {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadText);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payloadText;
  } catch {
    return payloadText;
  }
  const { iat, exp } = payload;
  const lifetime = typeof iat === "number" && typeof exp === "number" && exp > iat ? exp - iat : 3600;
  payload.iat = nowSeconds;
  if ("nbf" in payload) payload.nbf = nowSeconds;
  payload.exp = nowSeconds + lifetime;
  return JSON.stringify(payload, null, 2);
}

/** A starter payload for new test tokens. */
export function defaultJwtPayload(nowSeconds: number): string {
  return JSON.stringify({ sub: "1234567890", name: "John Doe", iat: nowSeconds, exp: nowSeconds + 3600 }, null, 2);
}
