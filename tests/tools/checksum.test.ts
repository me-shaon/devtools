import { describe, it, expect } from "vitest";
import {
  crc,
  decodeHex,
  luhnCheckDigit,
  luhnValid,
  type CrcPreset,
} from "@/utils/checksum";
describe("checksums", () => {
  it.each<[CrcPreset, string]>([
    ["CRC-8/SMBUS", "F4"],
    ["CRC-16/ARC", "BB3D"],
    ["CRC-16/MODBUS", "4B37"],
    ["CRC-16/CCITT-FALSE", "29B1"],
    ["CRC-32/ISO-HDLC", "CBF43926"],
    ["CRC-32C", "E3069283"],
  ])("matches the check vector for %s", (name, expected) =>
    expect(crc(new TextEncoder().encode("123456789"), name)).toBe(expected),
  );
  it("matches longer known values", () => {
    const fox = new TextEncoder().encode(
      "The quick brown fox jumps over the lazy dog",
    );
    expect(crc(fox, "CRC-32/ISO-HDLC")).toBe("414FA339");
    expect(crc(fox, "CRC-32C")).toBe("22620404");
  });
  it("handles empty data and binary bytes", () => {
    expect(crc(new Uint8Array(), "CRC-32/ISO-HDLC")).toBe("00000000");
    expect(
      crc(decodeHex("31 32 33 34 35 36 37 38 39"), "CRC-32/ISO-HDLC"),
    ).toBe("CBF43926");
    expect(() => decodeHex("abc")).toThrow();
    expect(() => decodeHex("xx")).toThrow();
  });
  it("generates and validates check digits without dropping zeroes", () => {
    expect(luhnCheckDigit("7992739871")).toBe("3");
    expect(luhnValid("79927398713")).toBe(true);
    expect(luhnValid("79927398714")).toBe(false);
    expect(luhnCheckDigit("000")).toBe("0");
    expect(() => luhnCheckDigit("12x")).toThrow();
    expect(() => luhnValid("1")).toThrow();
  });
});
