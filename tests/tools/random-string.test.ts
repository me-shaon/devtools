import { describe, expect, it, vi } from "vitest";
import {
  BASE64URL_ALPHABET,
  NANOID_ALPHABET,
  buildAlphabet,
  bytesToBase64Url,
  bytesToHex,
  entropyBits,
  entropyForOptions,
  generateRandomStrings,
  randomFromAlphabet,
  validateAlphabet,
} from "@/utils/random-string";

describe("randomFromAlphabet", () => {
  it("makes Nano IDs of the requested length from the default alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const id = randomFromAlphabet(NANOID_ALPHABET, 21);
      expect(id).toHaveLength(21);
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("uses only characters from a custom alphabet, including characters outside the BMP", () => {
    const alphabet = ["a", "b", "🚀"];
    const value = randomFromAlphabet(alphabet, 200);
    expect(Array.from(value)).toHaveLength(200);
    expect(Array.from(value).every((char) => alphabet.includes(char))).toBe(true);
  });

  it("discards masked values that fall outside the alphabet instead of wrapping them", () => {
    // A 3-character alphabet uses mask 3, so masked value 3 must be rejected, not mapped to "a".
    const bytes = [3, 0, 7, 1, 255, 2];
    let offset = 0;
    const fill = (buffer: Uint8Array) => {
      for (let i = 0; i < buffer.length; i++) buffer[i] = bytes[offset++ % bytes.length];
      return buffer;
    };
    expect(randomFromAlphabet("abc", 3, fill)).toBe("abc");
  });

  it("has no visible bias for an alphabet whose size is not a power of two", () => {
    // With modulo, a 10-character alphabet over bytes gives "0".."5" about 4% more often than "6".."9".
    // A seeded byte source keeps the result the same on every run, so the test never fails by chance.
    let seed = 0x9e3779b9;
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T) => {
      const bytes = new Uint8Array((array as unknown as ArrayBufferView).buffer);
      for (let i = 0; i < bytes.length; i++) {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        bytes[i] = (t ^ (t >>> 14)) & 0xff;
      }
      return array;
    });
    const alphabet = "0123456789";
    const counts = new Map<string, number>();
    const sample = randomFromAlphabet(alphabet, 200_000);
    spy.mockRestore();
    for (const char of sample) counts.set(char, (counts.get(char) ?? 0) + 1);
    const expected = sample.length / alphabet.length;
    let chiSquare = 0;
    for (const char of alphabet) {
      const observed = counts.get(char) ?? 0;
      chiSquare += (observed - expected) ** 2 / expected;
    }
    // 9 degrees of freedom: p = 0.001 at 27.9. A modulo bias of 4% would give about 250.
    expect(chiSquare).toBeLessThan(27.9);
    const low = [..."012345"].reduce((sum, c) => sum + (counts.get(c) ?? 0), 0) / 6;
    const high = [..."6789"].reduce((sum, c) => sum + (counts.get(c) ?? 0), 0) / 4;
    expect(Math.abs(low / high - 1)).toBeLessThan(0.02);
  });

  it("rejects alphabets that are too small or too large", () => {
    expect(() => randomFromAlphabet("a", 5)).toThrow(/at least 2/);
    expect(() => randomFromAlphabet(Array.from({ length: 257 }, (_, i) => String.fromCodePoint(0x4e00 + i)), 5)).toThrow(/at most 256/);
    expect(randomFromAlphabet("ab", 0)).toBe("");
  });
});

describe("alphabets", () => {
  it("combines the selected character sets", () => {
    expect(buildAlphabet({ digits: true }).join("")).toBe("0123456789");
    expect(buildAlphabet({ lowercase: true, uppercase: true })).toHaveLength(52);
    expect(buildAlphabet({})).toEqual([]);
  });

  it("removes repeated characters from a custom alphabet and ignores the sets", () => {
    expect(buildAlphabet({ digits: true }, "aabbcc")).toEqual(["a", "b", "c"]);
  });

  it("explains invalid alphabets", () => {
    expect(validateAlphabet([])).toMatch(/Select at least one/);
    expect(validateAlphabet(["x"])).toMatch(/at least 2/);
    expect(validateAlphabet(["x", "y"])).toBe("");
  });
});

describe("byte encodings", () => {
  it("encodes hex", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 255]))).toBe("000fff");
  });

  it("encodes URL-safe Base64 without padding", () => {
    const cases: Array<[number[], string]> = [
      [[], ""],
      [[0xfb], "-w"],
      [[0xfb, 0xff], "-_8"],
      [[0xfb, 0xff, 0xbf], "-_-_"],
      [[104, 101, 108, 108, 111], "aGVsbG8"],
    ];
    for (const [bytes, expected] of cases) expect(bytesToBase64Url(new Uint8Array(bytes))).toBe(expected);
    expect(BASE64URL_ALPHABET).toHaveLength(64);
  });
});

describe("entropy", () => {
  it("is length times log2 of the alphabet size", () => {
    expect(entropyBits(64, 21)).toBe(126);
    expect(entropyBits(16, 32)).toBe(128);
    expect(entropyBits(10, 3)).toBeCloseTo(9.966, 3);
    expect(entropyBits(1, 10)).toBe(0);
  });

  it("counts 8 bits for each byte in the byte modes", () => {
    expect(entropyForOptions({ mode: "nanoid", length: 21 })).toBe(126);
    expect(entropyForOptions({ mode: "hex", length: 16 })).toBe(128);
    expect(entropyForOptions({ mode: "base64url", length: 32 })).toBe(256);
    expect(entropyForOptions({ mode: "custom", length: 10, alphabet: ["a", "b"] })).toBe(10);
  });
});

describe("generateRandomStrings", () => {
  it("makes the requested count with the prefix, and clamps the count", () => {
    const values = generateRandomStrings({ mode: "hex", length: 16, count: 3, prefix: "key_" });
    expect(values).toHaveLength(3);
    for (const value of values) expect(value).toMatch(/^key_[0-9a-f]{32}$/);
    expect(new Set(values).size).toBe(3);
    expect(generateRandomStrings({ mode: "nanoid", length: 4, count: 9999 })).toHaveLength(500);
  });

  it("makes Base64URL tokens from random bytes", () => {
    const [token] = generateRandomStrings({ mode: "base64url", length: 32, count: 1 });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
