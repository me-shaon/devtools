import { Findings } from "@/utils/image-metadata";
import type { ByteSource, Patch } from "@/utils/byte-source";
import { VideoError, type ScanResult, type VideoCleanOptions, type VideoFormat } from "@/utils/video-format";

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

const childrenOf = (buf: Uint8Array, base: number, box: Box, skip = 0) =>
  children(buf, base, box.start - base + box.headerSize + skip, box.start - base + box.size);

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

const MAX_MOOV = 256 * 1024 * 1024;
const MAX_SIDE_BOX = 64 * 1024 * 1024;
const MAC_EPOCH = 2082844800;
const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "mif1", "msf1", "avif", "avis"]);
const CONTAINERS = new Set(["moov", "mdia", "minf", "edts", "dinf"]);

interface Ctx {
  out: Findings;
  patches: Patch[];
  options: VideoCleanOptions;
  dates: { value: string; count: number } | null;
}

const macDate = (seconds: number) => {
  if (!seconds) return null;
  const date = new Date((seconds - MAC_EPOCH) * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace(".000Z", "Z");
};

/** Reads and clears the creation and modification dates of a mvhd, tkhd, or mdhd box. */
function readDates(buf: Uint8Array, base: number, box: Box, ctx: Ctx, blanked: boolean) {
  const p = box.start - base + box.headerSize;
  if (box.size - box.headerSize < 20) return;
  const wide = buf[p] === 1;
  const created = wide ? u64(buf, p + 4) : u32(buf, p + 4);
  const modified = wide ? u64(buf, p + 12) : u32(buf, p + 8);
  if (!created && !modified) return;
  const value = macDate(created) ?? macDate(modified);
  if (value) ctx.dates = ctx.dates ? { ...ctx.dates, count: ctx.dates.count + 1 } : { value, count: 1 };
  if (ctx.options.clearDates && !blanked) ctx.patches.push({ offset: box.start + box.headerSize + 4, bytes: new Uint8Array(wide ? 16 : 8) });
}

/** Reads the boxes inside `parent`. `blanked` is true when a parent box is already being removed. */
function scanContainer(buf: Uint8Array, base: number, parent: Box, ctx: Ctx, blanked: boolean) {
  for (const box of childrenOf(buf, base, parent)) {
    switch (box.type) {
      case "mvhd":
      case "tkhd":
      case "mdhd":
        readDates(buf, base, box, ctx, blanked);
        break;
      case "trak":
        scanContainer(buf, base, box, ctx, blanked);
        break;
      default:
        if (CONTAINERS.has(box.type)) scanContainer(buf, base, box, ctx, blanked);
    }
  }
}

const formatForBrand = (brand: string): VideoFormat => (brand === "qt" ? "mov" : /^M4V/.test(brand) ? "m4v" : /^3g/.test(brand) ? "3gp" : "mp4");

/** Finds the metadata in an MP4, MOV, M4V, or 3GP file, and the patches that remove it. */
export async function scanBmff(source: ByteSource, options: VideoCleanOptions): Promise<ScanResult> {
  const ctx: Ctx = { out: new Findings(), patches: [], options, dates: null };
  const warnings: string[] = [];
  // Old QuickTime files start without an ftyp box.
  let format: VideoFormat = "mov";
  let sawMoov = false;
  let offset = 0;
  while (source.size - offset >= 8) {
    const box = headerAt(await source.read(offset, 32), offset, source.size);
    if (box.type === "ftyp") {
      const brand = fourcc(await source.read(offset + box.headerSize, 4), 0).trim();
      if (HEIF_BRANDS.has(brand)) throw new VideoError("This file is a HEIF or AVIF image. Use Image Metadata Cleaner for images.");
      format = formatForBrand(brand);
    } else if (box.type === "moov") {
      if (box.size > MAX_MOOV) throw new VideoError("The movie header is larger than 256 MB. This tool cannot read it.");
      // A parent range with no header, so scanContainer reads this one box.
      scanContainer(await source.read(box.start, box.size), box.start, { ...box, headerSize: 0 }, ctx, false);
      sawMoov = true;
    } else if (["uuid", "meta", "udta", "free", "skip"].includes(box.type)) {
      if (box.size > MAX_SIDE_BOX) {
        warnings.push(`A ${box.type} box of ${box.size} bytes at byte ${box.start} is too large to check, so it was kept.`);
      } else {
        scanContainer(await source.read(box.start, box.size), box.start, { ...box, headerSize: 0 }, ctx, false);
      }
    }
    offset += box.size;
  }
  if (!sawMoov) throw new VideoError("The file has no movie header (moov box). It may be cut off, or the recording did not finish.");
  if (ctx.dates) {
    const { value, count } = ctx.dates;
    ctx.out.add({ kind: "camera", label: "Recording date", detail: count > 1 ? `${value}, in ${count} headers` : value, source: "Movie and track headers" }, options.clearDates);
  }
  return { format, findings: ctx.out.items, patches: ctx.patches, warnings };
}
