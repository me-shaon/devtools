/** Random strings and Nano IDs from the Web Crypto random source, without modulo bias. */

export type RandomStringMode = "nanoid" | "custom" | "hex" | "base64url";

export const NANOID_ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
export const HEX_ALPHABET = "0123456789abcdef";
export const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export const CHARACTER_SETS = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!#$%&()*+,-./:;<=>?@[]^_{|}~",
} as const;

export type CharacterSet = keyof typeof CHARACTER_SETS;

/** The largest alphabet the byte-based sampler supports. */
export const MAX_ALPHABET_SIZE = 256;

export type RandomFill = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

const cryptoFill: RandomFill = (bytes) => crypto.getRandomValues(bytes);

/** Removes repeated characters and keeps the first occurrence. Handles characters outside the BMP. */
export function uniqueCharacters(text: string): string[] {
  return Array.from(new Set(Array.from(text)));
}

/** Builds an alphabet from the selected character sets, or from a custom alphabet when one is given. */
export function buildAlphabet(sets: Partial<Record<CharacterSet, boolean>>, customAlphabet = ""): string[] {
  if (customAlphabet) return uniqueCharacters(customAlphabet);
  const selected = (Object.keys(CHARACTER_SETS) as CharacterSet[]).filter((key) => sets[key]);
  return uniqueCharacters(selected.map((key) => CHARACTER_SETS[key]).join(""));
}

/** Returns an error message when the alphabet cannot make random strings, or an empty string. */
export function validateAlphabet(alphabet: readonly string[]): string {
  if (alphabet.length === 0) return "Select at least one character set or enter an alphabet.";
  if (alphabet.length < 2) return "The alphabet needs at least 2 different characters.";
  if (alphabet.length > MAX_ALPHABET_SIZE) return `The alphabet can have at most ${MAX_ALPHABET_SIZE} different characters.`;
  return "";
}

/**
 * Picks `size` characters from `alphabet` with Nano ID's algorithm. Each random byte is masked
 * to the smallest power of two that covers the alphabet. Values outside the alphabet are
 * discarded, so every character has the same probability.
 */
export function randomFromAlphabet(alphabet: readonly string[] | string, size: number, fill: RandomFill = cryptoFill): string {
  const chars = typeof alphabet === "string" ? Array.from(alphabet) : alphabet;
  const error = validateAlphabet(chars);
  if (error) throw new Error(error);
  if (!Number.isInteger(size) || size < 0) throw new Error("The length must be a whole number.");
  if (size === 0) return "";

  const mask = (2 << (31 - Math.clz32((chars.length - 1) | 1))) - 1;
  // 1.6 is the factor Nano ID uses: it covers the expected rejections in one call most of the time.
  // getRandomValues fills at most 65,536 bytes in one call.
  const step = Math.min(Math.ceil((1.6 * mask * size) / chars.length), 65_536);
  let id = "";
  let count = 0;
  for (;;) {
    const bytes = fill(new Uint8Array(step));
    for (let i = 0; i < step; i++) {
      const char = chars[bytes[i] & mask];
      if (char !== undefined) {
        id += char;
        if (++count === size) return id;
      }
    }
  }
}

export function randomBytes(length: number, fill: RandomFill = cryptoFill): Uint8Array {
  return fill(new Uint8Array(length));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** URL-safe Base64 without padding, as RFC 4648 section 5 describes. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += BASE64URL_ALPHABET[a >> 2];
    out += BASE64URL_ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += BASE64URL_ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += BASE64URL_ALPHABET[c & 63];
  }
  return out;
}

/** Entropy in bits of one string of `length` characters, each picked uniformly from `alphabetSize`. */
export function entropyBits(alphabetSize: number, length: number): number {
  if (alphabetSize < 2 || length <= 0) return 0;
  return length * Math.log2(alphabetSize);
}

export interface RandomStringOptions {
  mode: RandomStringMode;
  /** Characters for "nanoid" and "custom". Random bytes for "hex" and "base64url". */
  length: number;
  count: number;
  prefix?: string;
  /** The alphabet for "custom" mode. */
  alphabet?: readonly string[];
}

export const LENGTH_LIMITS: Record<RandomStringMode, { min: number; max: number; fallback: number }> = {
  nanoid: { min: 1, max: 256, fallback: 21 },
  custom: { min: 1, max: 256, fallback: 21 },
  hex: { min: 1, max: 128, fallback: 16 },
  base64url: { min: 1, max: 128, fallback: 32 },
};

export const MAX_COUNT = 500;

/** True when `length` counts random bytes rather than characters. */
export const isByteMode = (mode: RandomStringMode) => mode === "hex" || mode === "base64url";

export function alphabetForMode(mode: RandomStringMode, customAlphabet: readonly string[] = []): readonly string[] {
  if (mode === "nanoid") return Array.from(NANOID_ALPHABET);
  if (mode === "hex") return Array.from(HEX_ALPHABET);
  if (mode === "base64url") return Array.from(BASE64URL_ALPHABET);
  return customAlphabet;
}

/** Entropy in bits of one generated string, prefix excluded. */
export function entropyForOptions({ mode, length, alphabet = [] }: Pick<RandomStringOptions, "mode" | "length" | "alphabet">): number {
  if (isByteMode(mode)) return length * 8;
  return entropyBits(alphabetForMode(mode, alphabet).length, length);
}

export function generateRandomString(options: Omit<RandomStringOptions, "count">, fill: RandomFill = cryptoFill): string {
  const { mode, length, prefix = "" } = options;
  if (mode === "hex") return prefix + bytesToHex(randomBytes(length, fill));
  if (mode === "base64url") return prefix + bytesToBase64Url(randomBytes(length, fill));
  return prefix + randomFromAlphabet(alphabetForMode(mode, options.alphabet), length, fill);
}

export function generateRandomStrings(options: RandomStringOptions, fill: RandomFill = cryptoFill): string[] {
  const count = Math.min(Math.max(Math.trunc(options.count), 1), MAX_COUNT);
  return Array.from({ length: count }, () => generateRandomString(options, fill));
}
