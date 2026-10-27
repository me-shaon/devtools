/**
 * JWT decoder utility functions
 */

export interface JwtHeader {
  alg?: string;
  typ?: string;
  [key: string]: any;
}

export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: any;
}

export interface DecodedJwt {
  header: JwtHeader;
  payload: JwtPayload;
  signature: string;
  isValid: boolean;
  isExpired?: boolean;
  error?: string;
}

/**
 * Decode JWT token
 */
export function decodeJwt(token: string): DecodedJwt {
  if (!token.trim()) {
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

    // Add padding if needed
    const addPadding = (str: string) => str + "=".repeat((4 - (str.length % 4)) % 4);

    // Decode base64url
    const base64urlDecode = (str: string): string => {
      try {
        const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
        const padded = addPadding(base64);
        return atob(padded);
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
      let cleaned = payloadJson.replace(/[\x00-\x1F\x7F]+$/g, '');
      // Also try stripping any non-ASCII characters at the end
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

export type JwtVerifyStatus = "valid" | "invalid" | "unsupported" | "error";

export interface JwtVerifyResult {
  status: JwtVerifyStatus;
  message: string;
}

const HMAC_HASHES: Record<string, string> = {
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
};

function base64ToBytes(value: string): Uint8Array {
  const base64 = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Verify the signature of an HS256, HS384 or HS512 token with Web Crypto.
 * This does not check exp, nbf, issuer, audience or key trust.
 */
export async function verifyJwtSignature(
  token: string,
  secret: string,
  options: { secretIsBase64?: boolean } = {}
): Promise<JwtVerifyResult> {
  const trimmed = token.trim();
  const decoded = decodeJwt(trimmed);
  if (decoded.error) {
    return { status: "error", message: decoded.error };
  }

  const alg = typeof decoded.header.alg === "string" ? decoded.header.alg : "";
  const hash = HMAC_HASHES[alg];
  if (!hash) {
    return { status: "unsupported", message: "Algorithm not supported for verification" };
  }

  if (!secret) {
    return { status: "error", message: "Enter a secret to verify the signature." };
  }

  let keyBytes: Uint8Array;
  try {
    keyBytes = options.secretIsBase64
      ? base64ToBytes(secret)
      : new TextEncoder().encode(secret);
  } catch {
    return { status: "error", message: "The secret is not valid Base64." };
  }

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = base64ToBytes(decoded.signature);
  } catch {
    return { status: "invalid", message: "Signature invalid" };
  }

  try {
    const [headerB64, payloadB64] = trimmed.split(".");
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes as BufferSource,
      { name: "HMAC", hash },
      false,
      ["verify"]
    );
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as BufferSource,
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );
    return ok
      ? { status: "valid", message: "Signature valid" }
      : { status: "invalid", message: "Signature invalid" };
  } catch (error) {
    return { status: "error", message: "Verification failed: " + (error as Error).message };
  }
}
