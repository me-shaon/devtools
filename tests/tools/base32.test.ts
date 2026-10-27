import { describe, expect, it } from "vitest";
import { base32ToBytes, bytesToBase32 } from "@/utils/base32";

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

// Test vectors from RFC 4648, section 10.
const VECTORS: [string, string, string][] = [
  ["", "", ""],
  ["f", "MY======", "CO======"],
  ["fo", "MZXQ====", "CPNG===="],
  ["foo", "MZXW6===", "CPNMU==="],
  ["foob", "MZXW6YQ=", "CPNMUOG="],
  ["fooba", "MZXW6YTB", "CPNMUOJ1"],
  ["foobar", "MZXW6YTBOI======", "CPNMUOJ1E8======"],
];

describe("bytesToBase32", () => {
  it("matches the RFC 4648 test vectors", () => {
    for (const [text, base32, base32hex] of VECTORS) {
      expect(bytesToBase32(enc(text))).toBe(base32);
      expect(bytesToBase32(enc(text), { variant: "base32hex" })).toBe(base32hex);
    }
  });

  it("drops the padding on request", () => {
    expect(bytesToBase32(enc("foobar"), { padding: false })).toBe("MZXW6YTBOI");
  });
});

describe("base32ToBytes", () => {
  it("decodes the RFC 4648 test vectors with and without padding", () => {
    for (const [text, base32, base32hex] of VECTORS.slice(1)) {
      expect(dec(base32ToBytes(base32))).toBe(text);
      expect(dec(base32ToBytes(base32.replace(/=+$/, "")))).toBe(text);
      expect(dec(base32ToBytes(base32hex, { variant: "base32hex" }))).toBe(text);
    }
  });

  it("ignores case and whitespace, as in grouped TOTP secrets", () => {
    expect(dec(base32ToBytes("mzxw 6ytb oi"))).toBe("foobar");
    expect(dec(base32ToBytes(" MZXW\n6YTB "))).toBe("fooba");
  });

  it("decodes a typical TOTP secret to raw bytes", () => {
    expect(base32ToBytes("JBSWY3DPEHPK3PXP")).toEqual(
      new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]),
    );
  });

  it("reports the first invalid character and its position", () => {
    expect(() => base32ToBytes("MZXW1")).toThrow('Invalid Base32 character "1" at position 5.');
    expect(() => base32ToBytes("MZ=XW")).toThrow('Invalid Base32 character "=" at position 3.');
    expect(() => base32ToBytes("MZXW", { variant: "base32hex" })).toThrow('Invalid Base32 character "Z" at position 2.');
  });

  it("rejects a length that cannot come from whole bytes", () => {
    expect(() => base32ToBytes("MZXW6Y")).toThrow("Invalid Base32 length");
    expect(() => base32ToBytes("M")).toThrow("Invalid Base32 length");
  });

  it("rejects empty input", () => {
    expect(() => base32ToBytes("  ")).toThrow("Please enter Base32 to decode.");
  });
});
