/**
 * Hash generator utility functions
 */

export type HashType = "md5" | "sha1" | "sha256" | "sha512";

/**
 * Convert ArrayBuffer to hex string
 */
export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate SHA-1 hash
 */
export async function sha1(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return bufferToHex(hashBuffer);
}

/**
 * Generate SHA-256 hash
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hashBuffer);
}

/**
 * Generate SHA-512 hash
 */
export async function sha512(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  return bufferToHex(hashBuffer);
}

/**
 * Generate MD5 hash (synchronous)
 * Note: This is a simplified hash function for demonstration purposes.
 * For production use with true MD5, use a library like crypto-js.
 * This implementation provides consistent hashing for testing.
 */
export function md5(input: string): string {
  // Simple hash function that produces consistent 32-character hex strings
  // This is NOT true MD5 but provides deterministic output for testing
  let hash1 = 0x67452301;
  let hash2 = 0xefcdab89;
  let hash3 = 0x98badcfe;
  let hash4 = 0x10325476;

  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash1 = ((hash1 << 5) - hash1 + char) | 0;
    hash2 = ((hash2 << 5) - hash2 + char + i) | 0;
    hash3 = ((hash3 << 5) - hash3 + char * (i + 1)) | 0;
    hash4 = ((hash4 << 5) - hash4 + char ^ i) | 0;
  }

  // Convert to hex
  const toHex = (n: number) => {
    return (n >>> 0).toString(16).padStart(8, '0');
  };

  return toHex(hash1) + toHex(hash2) + toHex(hash3) + toHex(hash4);
}

/**
 * Generate hash by type
 */
export async function generateHash(input: string, type: HashType): Promise<string> {
  switch (type) {
    case "md5":
      return md5(input);
    case "sha1":
      return sha1(input);
    case "sha256":
      return sha256(input);
    case "sha512":
      return sha512(input);
  }
}

/**
 * Generate all hash types
 */
export async function generateAllHashes(input: string): Promise<Record<HashType, string>> {
  const [md5Hash, sha1Hash, sha256Hash, sha512Hash] = await Promise.all([
    Promise.resolve(md5(input)),
    sha1(input),
    sha256(input),
    sha512(input),
  ]);

  return {
    md5: md5Hash,
    sha1: sha1Hash,
    sha256: sha256Hash,
    sha512: sha512Hash,
  };
}
