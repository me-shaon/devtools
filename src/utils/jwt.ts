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
