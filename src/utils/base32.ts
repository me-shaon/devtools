/**
 * Base32 encoding and decoding (RFC 4648), in the standard and the
 * "base32hex" (extended hex) alphabets.
 */

export type Base32Variant = "base32" | "base32hex";

export interface Base32Options {
  variant?: Base32Variant;
  /** Pad the output with = to a multiple of 8 characters. On by default, as in RFC 4648. */
  padding?: boolean;
}

const ALPHABETS: Record<Base32Variant, string> = {
  base32: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
  base32hex: "0123456789ABCDEFGHIJKLMNOPQRSTUV",
};

/** Encode bytes to Base32. */
export function bytesToBase32(bytes: Uint8Array, options: Base32Options = {}): string {
  const { variant = "base32", padding = true } = options;
  const alphabet = ALPHABETS[variant];
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(buffer >> bits) & 31];
    }
    // Keep only the bits that are not yet written, so the buffer stays small.
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += alphabet[(buffer << (5 - bits)) & 31];
  if (padding) out += "=".repeat((8 - (out.length % 8)) % 8);
  return out;
}

/**
 * Decode Base32 to bytes. Case, whitespace, and the trailing padding are optional.
 * @throws Error for empty input, an invalid character, or an invalid length
 */
export function base32ToBytes(input: string, options: Pick<Base32Options, "variant"> = {}): Uint8Array {
  const alphabet = ALPHABETS[options.variant ?? "base32"];
  const compact = input.replace(/\s+/g, "");
  if (!compact) throw new Error("Please enter Base32 to decode.");
  const body = compact.replace(/=+$/, "").toUpperCase();

  // Report positions in the input without whitespace, which is what the user counts in a secret.
  const values: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const value = alphabet.indexOf(body[i]);
    if (value < 0) throw new Error(`Invalid Base32 character "${compact[i]}" at position ${i + 1}.`);
    values.push(value);
  }
  // 1, 3, and 6 characters of a final group cannot hold whole bytes.
  if ([1, 3, 6].includes(body.length % 8)) {
    throw new Error("Invalid Base32 length. Check for missing or extra characters.");
  }

  const bytes = new Uint8Array(Math.floor((body.length * 5) / 8));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const value of values) {
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = (buffer >> bits) & 0xff;
      buffer &= (1 << bits) - 1;
    }
  }
  return bytes;
}
