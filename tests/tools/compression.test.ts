import { gzipSync, deflateSync, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  compressBytes,
  decodeUtf8,
  decompress,
  detectFormat,
  gzipOriginalName,
  hexPreview,
  OutputTooLargeError,
  parseEncodedInput,
  ratioLabel,
} from "@/utils/compression";

const text = "Hello, compression! ".repeat(20);
const bytes = new TextEncoder().encode(text);
const toBase64 = (data: Uint8Array) => Buffer.from(data).toString("base64");
const asBytes = (data: Buffer) => new Uint8Array(data);

describe("detectFormat", () => {
  it("finds gzip, zlib, and falls back to raw deflate", () => {
    expect(detectFormat(asBytes(gzipSync(bytes)))).toBe("gzip");
    expect(detectFormat(asBytes(deflateSync(bytes)))).toBe("deflate");
    expect(detectFormat(asBytes(deflateSync(bytes, { level: 9 })))).toBe("deflate");
    expect(detectFormat(asBytes(deflateRawSync(bytes)))).toBe("deflate-raw");
  });

  it("does not take a 0x78 byte with a bad header checksum as zlib", () => {
    expect(detectFormat(new Uint8Array([0x78, 0x00, 0x01]))).toBe("deflate-raw");
  });
});

describe("parseEncodedInput", () => {
  it("reads standard Base64 with whitespace", () => {
    const encoded = toBase64(asBytes(gzipSync(bytes)));
    const parsed = parseEncodedInput(`  ${encoded.slice(0, 10)}\n${encoded.slice(10)}  `);
    expect(parsed.encoding).toBe("base64");
    expect(parsed.bytes[0]).toBe(0x1f);
  });

  it("reads URL-safe Base64 without padding", () => {
    const encoded = Buffer.from(gzipSync(bytes)).toString("base64url");
    expect(parseEncodedInput(encoded).bytes).toEqual(asBytes(gzipSync(bytes)));
  });

  it("reads hex with spaces and a 0x prefix", () => {
    const gz = asBytes(gzipSync(bytes));
    const hex = Buffer.from(gz).toString("hex");
    expect(parseEncodedInput(hex).encoding).toBe("hex");
    expect(parseEncodedInput(`0x${hex.match(/../g)!.join(" ")}`).bytes).toEqual(gz);
  });

  it("decodes Base64 twice when the inner text is gzip Base64 (Kubernetes Secret data)", () => {
    const helm = toBase64(asBytes(gzipSync(bytes)));
    const parsed = parseEncodedInput(Buffer.from(helm).toString("base64"));
    expect(parsed.nested).toBe(true);
    expect(parsed.bytes[0]).toBe(0x1f);
  });

  it("rejects text that is neither Base64 nor hex", () => {
    expect(() => parseEncodedInput("not base64!")).toThrow(/Base64 or hex/);
  });
});

describe("compress and decompress", () => {
  it.each(["gzip", "deflate", "deflate-raw"] as const)("round-trips %s", async (format) => {
    const compressed = await compressBytes(bytes, format);
    expect(compressed.length).toBeLessThan(bytes.length);
    const result = await decompress(compressed, "auto");
    expect(result.format).toBe(format);
    expect(decodeUtf8(result.bytes)).toBe(text);
  });

  it("reads data that Node's zlib made", async () => {
    const result = await decompress(asBytes(gzipSync(bytes)), "auto");
    expect(decodeUtf8(result.bytes)).toBe(text);
  });

  it("uses the format the user picks", async () => {
    const raw = asBytes(deflateRawSync(bytes));
    expect(decodeUtf8((await decompress(raw, "deflate-raw")).bytes)).toBe(text);
    await expect(decompress(raw, "gzip")).rejects.toThrow(/not valid GZIP/);
  });

  it("explains corrupt input", async () => {
    const gz = asBytes(gzipSync(bytes));
    await expect(decompress(gz.subarray(0, gz.length - 12), "auto")).rejects.toThrow(/not valid GZIP/);
    await expect(decompress(new TextEncoder().encode("plain text"), "auto")).rejects.toThrow(/not GZIP, zlib, or raw deflate/);
  });

  it("stops when the output passes the limit", async () => {
    const bomb = asBytes(gzipSync(new Uint8Array(200_000)));
    await expect(decompress(bomb, "auto", 100_000)).rejects.toBeInstanceOf(OutputTooLargeError);
  });
});

describe("helpers", () => {
  it("reads the original file name from a gzip header", () => {
    // FNAME flag (0x08) followed by a zero-terminated name.
    const header = [0x1f, 0x8b, 0x08, 0x08, 0, 0, 0, 0, 0, 0x03, ...new TextEncoder().encode("notes.txt"), 0];
    expect(gzipOriginalName(new Uint8Array(header))).toBe("notes.txt");
    expect(gzipOriginalName(asBytes(gzipSync(bytes)))).toBeUndefined();
  });

  it("returns null for bytes that are not UTF-8", () => {
    expect(decodeUtf8(new Uint8Array([0xff, 0xfe, 0x00]))).toBeNull();
  });

  it("shows hex and limits the preview", () => {
    expect(hexPreview(new Uint8Array([0, 15, 255]))).toBe("00 0f ff");
    expect(hexPreview(new Uint8Array(40), 16).split("\n")).toHaveLength(1);
  });

  it("states the ratio as a share of the original size", () => {
    expect(ratioLabel(25, 100)).toBe("25% of original");
    expect(ratioLabel(10, 0)).toBe("");
  });
});
