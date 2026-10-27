/**
 * GZIP, zlib, and raw deflate with the built-in CompressionStream and DecompressionStream.
 */
import { base64ToBytes } from "@/utils/base64";
import { formatBytes } from "@/utils/hash";

export type CompressionFormat = "gzip" | "deflate" | "deflate-raw";

export const FORMAT_LABELS: Record<CompressionFormat, string> = {
  gzip: "GZIP",
  deflate: "zlib",
  "deflate-raw": "raw deflate",
};

export const FORMAT_EXTENSIONS: Record<CompressionFormat, string> = {
  gzip: "gz",
  deflate: "zz",
  "deflate-raw": "deflate",
};

/** Decompression stops past this size, so a small bomb cannot fill the memory. */
export const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

export class OutputTooLargeError extends Error {
  constructor(limit: number) {
    super(`The decompressed data is larger than ${formatBytes(limit)}. The tool stopped there to protect memory.`);
    this.name = "OutputTooLargeError";
  }
}

const isGzip = (bytes: Uint8Array) => bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

// A zlib header uses compression method 8 and its two bytes are a multiple of 31.
const isZlib = (bytes: Uint8Array) =>
  bytes.length >= 2 && (bytes[0] & 0x0f) === 8 && bytes[0] >> 4 <= 7 && ((bytes[0] << 8) | bytes[1]) % 31 === 0;

/** Finds the format from the magic bytes. Data without a header is taken as raw deflate. */
export function detectFormat(bytes: Uint8Array): CompressionFormat {
  if (isGzip(bytes)) return "gzip";
  if (isZlib(bytes)) return "deflate";
  return "deflate-raw";
}

export interface EncodedInput {
  bytes: Uint8Array;
  encoding: "base64" | "hex";
  /** True when the Base64 held more Base64, as in Kubernetes Secret data for a Helm release. */
  nested: boolean;
}

const hexToBytes = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
};

/**
 * Reads compressed data written as hex or as Base64 (standard or URL-safe, with or without padding).
 * @throws Error if the text is neither
 */
export function parseEncodedInput(text: string): EncodedInput {
  const hex = text.replace(/0x|\\x|[\s:]/gi, "");
  if (hex && hex.length % 2 === 0 && /^[0-9a-f]+$/i.test(hex)) {
    return { bytes: hexToBytes(hex), encoding: "hex", nested: false };
  }
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(text);
  } catch {
    throw new Error("Enter compressed data as Base64 or hex.");
  }
  // Base64 of gzip starts with "H4sI". A second layer of Base64 hides it one level down.
  if (!isGzip(bytes) && bytes.length > 4 && String.fromCharCode(...bytes.subarray(0, 4)) === "H4sI") {
    try {
      return { bytes: base64ToBytes(new TextDecoder().decode(bytes)), encoding: "base64", nested: true };
    } catch {
      /* Not Base64 after all. Use the first layer. */
    }
  }
  return { bytes, encoding: "base64", nested: false };
}

async function pipe(stream: CompressionStream | DecompressionStream, input: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Errors also reach the reader below, so these promises only need a handler.
  writer.write(input as Uint8Array<ArrayBuffer>).catch(() => {});
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new OutputTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export function compressBytes(bytes: Uint8Array, format: CompressionFormat): Promise<Uint8Array> {
  return pipe(new CompressionStream(format), bytes, Number.POSITIVE_INFINITY);
}

export interface DecompressResult {
  bytes: Uint8Array;
  format: CompressionFormat;
}

/**
 * Decompresses data in the given format, or finds the format from the magic bytes with "auto".
 * @throws OutputTooLargeError past maxBytes, or Error when the data is corrupt
 */
export async function decompress(
  bytes: Uint8Array,
  format: CompressionFormat | "auto",
  maxBytes = MAX_OUTPUT_BYTES,
): Promise<DecompressResult> {
  const used = format === "auto" ? detectFormat(bytes) : format;
  try {
    return { bytes: await pipe(new DecompressionStream(used), bytes, maxBytes), format: used };
  } catch (err) {
    if (err instanceof OutputTooLargeError) throw err;
    if (format === "auto" && used === "deflate-raw") {
      throw new Error("The data is not GZIP, zlib, or raw deflate. Check that you copied all of it.");
    }
    throw new Error(`The data is not valid ${FORMAT_LABELS[used]}. It is corrupt, cut short, or in a different format.`);
  }
}

/** The original file name stored in a gzip header (the FNAME field), if any. */
export function gzipOriginalName(bytes: Uint8Array): string | undefined {
  if (!isGzip(bytes) || bytes.length < 10) return undefined;
  const flags = bytes[3];
  if (!(flags & 0x08)) return undefined;
  let offset = 10;
  if (flags & 0x04) offset += 2 + (bytes[10] | (bytes[11] << 8)); // FEXTRA
  const end = bytes.indexOf(0, offset);
  if (end <= offset) return undefined;
  const name = new TextDecoder("latin1").decode(bytes.subarray(offset, end));
  // Keep only the base name, so a stored path cannot point the save dialog anywhere.
  return name.split(/[\\/]/).pop() || undefined;
}

/** Decodes UTF-8 text, or returns null when the bytes are not valid UTF-8. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** Hex bytes, 16 per line, for at most `limit` bytes. */
export function hexPreview(bytes: Uint8Array, limit = 4096): string {
  const lines: string[] = [];
  const end = Math.min(bytes.length, limit);
  for (let i = 0; i < end; i += 16) {
    lines.push(Array.from(bytes.subarray(i, Math.min(i + 16, end)), (b) => b.toString(16).padStart(2, "0")).join(" "));
  }
  return lines.join("\n");
}

/** The compressed size as a share of the original size. */
export function ratioLabel(compressed: number, original: number): string {
  if (original <= 0) return "";
  const percent = (compressed / original) * 100;
  return `${percent < 10 ? percent.toFixed(1).replace(/\.0$/, "") : Math.round(percent)}% of original`;
}
