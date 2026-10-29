import { describe, it, expect } from "vitest";
import { decodeAsnInput, parseAsn1 } from "@/utils/asn1-inspector";
import { decodeHex } from "@/utils/checksum";
const parse = (s: string) => parseAsn1(decodeHex(s));
describe("ASN.1 inspector", () => {
  it("reads nested values with exact offsets and lengths", () => {
    const [n] = parse("30 08 02 01 2a 0c 03 48 65 79");
    expect(n).toMatchObject({
      offset: 0,
      length: 8,
      header: 2,
      name: "SEQUENCE",
    });
    expect(n.children[0]).toMatchObject({ offset: 2, value: "42" });
    expect(n.children[1].value).toBe("Hey");
  });
  it("reads signed and large integers without rounding", () => {
    expect(parse("02 01 ff")[0].value).toBe("-1");
    expect(parse("02 08 7f ff ff ff ff ff ff ff")[0].value).toBe(
      "9223372036854775807",
    );
  });
  it("decodes OIDs including multi-byte first components", () => {
    expect(parse("06 03 88 37 03")[0].value).toBe("2.999.3");
    expect(parse("06 06 2a 86 48 86 f7 0d")[0].value).toBe("1.2.840.113549");
  });
  it("decodes TeletexString bytes as Latin-1", () =>
    expect(parse("14 02 e9 41")[0].value).toBe("\u00e9A"));
  it("accepts long lengths and high tags", () => {
    expect(parse("04 81 01 aa")[0].length).toBe(1);
    expect(parse("9f 81 01 01 ff")[0]).toMatchObject({
      tag: 129,
      tagClass: "Context-specific",
    });
  });
  it.each([
    "30 80 00 00",
    "02 02 01",
    "30 02 02 01",
    "06 01 80",
    "05 01 00",
    "02 00",
    "1f ff",
  ])("rejects malformed or unsupported %s", (hex) =>
    expect(() => parse(hex)).toThrow(),
  );
  it("bounds nesting and input", () => {
    let bytes = decodeHex("05 00");
    for (let i = 0; i < 42; i++)
      bytes = new Uint8Array([0x30, bytes.length, ...bytes]);
    expect(() => parseAsn1(bytes)).toThrow(/Nesting/);
    expect(() => parseAsn1(new Uint8Array(1000001))).toThrow(/limited/);
  });
  it("decodes PEM, Base64 and hex", () => {
    expect(
      decodeAsnInput("-----BEGIN TEST-----\nBQ A=\n-----END TEST-----", "pem"),
    ).toEqual(decodeHex("0500"));
    expect(() =>
      decodeAsnInput("-----BEGIN A-----BQA=-----END B-----", "pem"),
    ).toThrow();
    expect(() => decodeAsnInput("!!!!", "base64")).toThrow();
  });
});
