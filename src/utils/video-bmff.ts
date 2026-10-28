import type { Patch } from "@/utils/byte-source";
import { VideoError } from "@/utils/video-format";

/**
 * Reads and removes metadata in ISO base media files (MP4, MOV, M4V, 3GP).
 * Every change overwrites bytes in place. The size of each box and the
 * offsets of the audio and video samples stay the same.
 */

export interface Box {
  type: string;
  /** Offset of the box in the file. */
  start: number;
  headerSize: number;
  size: number;
  /** True when the box uses a 64-bit size. */
  large: boolean;
  uuid?: string;
}

const textDecoder = new TextDecoder();

export const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 2 ** 32 + u32(b, o + 4);
const fourcc = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const hex = (b: Uint8Array, o: number, n: number) => Array.from(b.subarray(o, o + n), (x) => x.toString(16).padStart(2, "0")).join("");
const writeU32 = (b: Uint8Array, o: number, v: number) => {
  b[o] = v >>> 24;
  b[o + 1] = (v >>> 16) & 255;
  b[o + 2] = (v >>> 8) & 255;
  b[o + 3] = v & 255;
};
export const utf8 = (b: Uint8Array) => textDecoder.decode(b).replace(/\0+$/, "").trim();
/** The printable ASCII in the bytes, with runs of other bytes turned into one space. */
export const printable = (b: Uint8Array) =>
  Array.from(b, (c) => (c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : " "))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

/** Reads the box header in `h`, where h[0] is at file offset `start`. `end` is the end of the parent. */
export function headerAt(h: Uint8Array, start: number, end: number): Box {
  if (h.length < 8) throw new VideoError(`The box at byte ${start} is cut off.`);
  let size = u32(h, 0);
  const type = fourcc(h, 4);
  let headerSize = 8;
  const large = size === 1;
  if (large) {
    if (h.length < 16) throw new VideoError(`The box at byte ${start} is cut off.`);
    size = u64(h, 8);
    headerSize = 16;
  } else if (size === 0) {
    size = end - start;
  }
  if (size < headerSize || start + size > end) throw new VideoError(`The box at byte ${start} has an invalid size.`);
  let uuid: string | undefined;
  if (type === "uuid") {
    if (h.length < headerSize + 16 || size < headerSize + 16) throw new VideoError(`The box at byte ${start} is cut off.`);
    uuid = hex(h, headerSize, 16);
    headerSize += 16;
  }
  return { type, start, headerSize, size, large, uuid };
}

/** The child boxes in the range [from, to) of `buf`, where buf[0] is at file offset `base`. */
export function* children(buf: Uint8Array, base: number, from: number, to: number): Generator<Box> {
  let o = from;
  while (to - o >= 8) {
    // QuickTime ends some lists with a 32-bit zero.
    if (u32(buf, o) === 0) return;
    const box = headerAt(buf.subarray(o, Math.min(to, o + 32)), base + o, base + to);
    yield box;
    o += box.size;
  }
}

/** Turns a box into a "free" box of the same size with zero content. */
export function blankBox(box: Box): Patch {
  const bytes = new Uint8Array(box.size);
  if (box.large) {
    writeU32(bytes, 0, 1);
    writeU32(bytes, 8, Math.floor(box.size / 2 ** 32));
    writeU32(bytes, 12, box.size >>> 0);
  } else {
    writeU32(bytes, 0, box.size);
  }
  bytes.set([0x66, 0x72, 0x65, 0x65], 4);
  return { offset: box.start, bytes };
}
