import { Findings, readC2pa, readXmp, type FindingKind } from "@/utils/image-metadata";
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

const payload = (buf: Uint8Array, base: number, box: Box) => buf.subarray(box.start - base + box.headerSize, box.start - base + box.size);

const findChild = (buf: Uint8Array, base: number, box: Box, type: string) => {
  for (const child of childrenOf(buf, base, box)) if (child.type === type) return child;
  return null;
};

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

const UDTA_TEXT: Record<string, [string, FindingKind]> = {
  "\u00a9xyz": ["GPS position", "location"],
  "\u00a9mak": ["Camera make", "camera"],
  "\u00a9mod": ["Camera model", "camera"],
  "\u00a9swr": ["Software", "other"],
  "\u00a9too": ["Encoder", "other"],
  "\u00a9enc": ["Encoded by", "other"],
  "\u00a9day": ["Creation date", "camera"],
  "\u00a9nam": ["Title", "text"],
  "\u00a9cmt": ["Comment", "text"],
  "\u00a9des": ["Description", "text"],
  "\u00a9inf": ["Information", "text"],
  "\u00a9ART": ["Artist", "provenance"],
  "\u00a9aut": ["Author", "provenance"],
  "\u00a9cpy": ["Copyright", "provenance"],
  "\u00a9prd": ["Producer", "provenance"],
};

const META_KEYS: Record<string, [string, FindingKind]> = {
  "com.apple.quicktime.location.ISO6709": ["GPS position", "location"],
  "com.apple.quicktime.location.name": ["Location name", "location"],
  "com.apple.quicktime.make": ["Camera make", "camera"],
  "com.apple.quicktime.model": ["Camera model", "camera"],
  "com.apple.quicktime.software": ["Software", "other"],
  "com.apple.quicktime.creationdate": ["Creation date", "camera"],
  "com.apple.quicktime.author": ["Author", "provenance"],
  "com.apple.quicktime.title": ["Title", "text"],
  "com.apple.quicktime.description": ["Description", "text"],
  "com.apple.quicktime.content.identifier": ["Content identifier", "other"],
  "com.android.version": ["Android version", "camera"],
  "com.android.capture.fps": ["Capture frame rate", "camera"],
};

const kindForKey = (key: string): FindingKind =>
  /location|gps|latitude|longitude/i.test(key)
    ? "location"
    : /make|model|camera|lens|device|serial/i.test(key)
      ? "camera"
      : /author|artist|copyright|creator|publisher|owner/i.test(key)
        ? "provenance"
        : "text";

/** Writes "+37.3349-122.0090+010.000/" as "37.3349, -122.009". */
export function iso6709(text: string): string {
  const match = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(text.trim());
  return match ? `${Number(match[1])}, ${Number(match[2])}` : text;
}

const typeName = (type: string) => type.replace(/[^\x20-\x7e\u00a9]/g, "?");

function addValue(ctx: Ctx, key: string, value: string, source: string) {
  const [label, kind] = UDTA_TEXT[key] ?? META_KEYS[key] ?? [key, kindForKey(key)];
  ctx.out.addText(label, kind === "location" && /^[+-]\d/.test(value) ? iso6709(value) : value, source, kind);
}

/** Text in a QuickTime text atom (length, language, text) or an iTunes "data" box. */
function atomText(p: Uint8Array): string {
  if (p.length >= 16 && fourcc(p, 4) === "data") return utf8(p.subarray(16, Math.min(p.length, u32(p, 0))));
  if (p.length >= 4) {
    const length = (p[0] << 8) | p[1];
    if (length > 0 && 4 + length <= p.length) return utf8(p.subarray(4, 4 + length));
  }
  return printable(p);
}

function readLoci(p: Uint8Array, ctx: Ctx) {
  // Version and flags (4), language (2), name (ends with 0), role (1), then longitude, latitude, and altitude as 16.16 fixed point.
  const nameEnd = p.indexOf(0, 6);
  if (nameEnd < 0 || nameEnd + 10 > p.length) {
    ctx.out.add({ kind: "location", label: "Location", detail: printable(p) || `${p.length} bytes`, source: "3GPP location" });
    return;
  }
  const name = utf8(p.subarray(6, nameEnd));
  const fixed = (o: number) => (u32(p, o) | 0) / 65536;
  const lon = fixed(nameEnd + 2);
  const lat = fixed(nameEnd + 6);
  ctx.out.add({ kind: "location", label: "GPS position", detail: `${lat.toFixed(5)}, ${lon.toFixed(5)}${name ? ` (${name})` : ""}`, source: "3GPP location" });
}

function readKeys(p: Uint8Array): string[] {
  const keys: string[] = [];
  const count = u32(p, 4);
  let o = 8;
  for (let i = 0; i < count && o + 8 <= p.length; i++) {
    const size = u32(p, o);
    if (size < 8) break;
    keys.push(utf8(p.subarray(o + 8, o + size)));
    o += size;
  }
  return keys;
}

function readIlst(buf: Uint8Array, base: number, ilst: Box, keys: string[], ctx: Ctx, source: string) {
  for (const item of childrenOf(buf, base, ilst)) {
    // In QuickTime "mdta" lists, the item type is a 1-based index into the keys.
    const index = u32(buf, item.start - base + 4);
    const key = index >= 1 && index <= keys.length ? keys[index - 1] : item.type;
    for (const data of childrenOf(buf, base, item)) {
      if (data.type !== "data") continue;
      const p = payload(buf, base, data);
      if (p.length < 8) continue;
      const value = (u32(p, 0) & 0xffffff) === 1 ? utf8(p.subarray(8)) : printable(p.subarray(8));
      if (value) addValue(ctx, key, value, source);
    }
  }
}

function readMeta(buf: Uint8Array, base: number, meta: Box, ctx: Ctx, source: string) {
  // In MP4, "meta" is a full box with 4 bytes of version and flags. In QuickTime it is not.
  const skip = u32(buf, meta.start - base + meta.headerSize) === 0 ? 4 : 0;
  const kids = [...childrenOf(buf, base, meta, skip)];
  const keysBox = kids.find((k) => k.type === "keys");
  const keys = keysBox ? readKeys(payload(buf, base, keysBox)) : [];
  for (const child of kids) {
    const p = payload(buf, base, child);
    if (child.type === "ilst") readIlst(buf, base, child, keys, ctx, source);
    else if (child.type === "XMP_") readXmp(utf8(p), ctx.out, source);
    else if (child.type === "xml ") {
      const xml = utf8(p.subarray(4));
      if (/xmpmeta|xap\/1\.0/.test(xml)) readXmp(xml, ctx.out, source);
      else ctx.out.addText("XML metadata", xml, source, "other");
    }
  }
}

function readUdta(buf: Uint8Array, base: number, udta: Box, ctx: Ctx) {
  const source = "QuickTime user data";
  for (const child of childrenOf(buf, base, udta)) {
    const p = payload(buf, base, child);
    if (child.type === "meta") readMeta(buf, base, child, ctx, "MP4 metadata");
    else if (child.type === "XMP_") readXmp(utf8(p), ctx.out, "QuickTime XMP");
    else if (child.type === "loci") readLoci(p, ctx);
    else if (child.type.startsWith("\u00a9") || UDTA_TEXT[child.type]) {
      const text = atomText(p);
      if (text) addValue(ctx, child.type, text, source);
    } else {
      const text = printable(p);
      const label = `User data box ${typeName(child.type)}`;
      if (text.length >= 4) ctx.out.addText(label, text, source, "other");
      else ctx.out.add({ kind: "other", label, detail: `${p.length} bytes`, source });
    }
  }
}

/** Metadata boxes identified by their UUID. The values are from the ExifTool QuickTime tables. */
const METADATA_UUIDS: Record<string, string> = {
  be7acfcb97a942e89c71999491e3afac: "XMP",
  d8fec3d61b0e483c92975828877ec481: "C2PA",
  "85c0b687820f11e08111f4ce462b6a48": "Canon",
  "55534d5421d24fcebb88695cfac9c740": "Sony",
  "9b630f8d637440ec8204bc5ff5091728": "Garmin",
};

/** Adds findings for a uuid box. Returns true when cleaning removes the box. */
function readUuid(box: Box, p: Uint8Array, ctx: Ctx): boolean {
  const vendor = METADATA_UUIDS[box.uuid ?? ""];
  if (vendor === "XMP") readXmp(utf8(p), ctx.out, "XMP box");
  else if (vendor === "C2PA") readC2pa(p, ctx.out, "C2PA box");
  else if (vendor === "Garmin") ctx.out.add({ kind: "location", label: "Garmin GPS data", detail: `GPS track from a Garmin camera, ${p.length} bytes`, source: "Garmin box" });
  else if (vendor) ctx.out.addText(`${vendor} camera metadata`, printable(p) || `${p.length} bytes`, `${vendor} box`, "camera");
  else {
    ctx.out.add({ kind: "other", label: "Unknown vendor box", detail: `uuid ${box.uuid}, ${p.length} bytes. Kept, because some players need it.`, source: "uuid box" }, false);
    return false;
  }
  return true;
}

/** Old metadata can stay behind in free space after an app edits a file. */
function readFree(p: Uint8Array, box: Box, ctx: Ctx, blanked: boolean) {
  if (!p.some((b) => b !== 0)) return;
  const text = printable(p);
  ctx.out.addText("Leftover data in free space", text.length >= 4 ? text : `${p.length} bytes`, "free box", "other");
  if (!blanked) ctx.patches.push({ offset: box.start + box.headerSize, bytes: new Uint8Array(box.size - box.headerSize) });
}

const SUBTITLE_HANDLERS = new Set(["text", "sbtl", "subt", "clcp"]);

const META_TRACKS: Record<string, [string, FindingKind, string]> = {
  gpmd: ["GoPro telemetry track", "location", "GPS position, speed, and motion data (GPMF)"],
  camm: ["Camera motion track", "location", "Motion data, and the GPS position on some cameras (camm)"],
  mebx: ["Timed metadata track", "camera", "Face detection, focus, or other capture data (mebx)"],
};

/** The byte ranges of the samples in a track, one range for each chunk. */
export function sampleRanges(buf: Uint8Array, base: number, stbl: Box): Array<{ offset: number; length: number }> {
  const sizes: number[] = [];
  const stsc: Array<[number, number]> = [];
  const offsets: number[] = [];
  let constant = 0;
  let count = 0;
  const need = (p: Uint8Array, end: number) => {
    if (end > p.length) throw new VideoError("The sample table of a metadata track is cut off.");
  };
  for (const child of childrenOf(buf, base, stbl)) {
    const p = payload(buf, base, child);
    if (child.type === "stz2") throw new VideoError("A metadata track uses compact sample sizes (stz2), which this tool cannot read. Turn off Remove metadata tracks to clean the rest.");
    if (child.type === "stsz") {
      need(p, 12);
      constant = u32(p, 4);
      count = u32(p, 8);
      if (!constant) {
        need(p, 12 + 4 * count);
        for (let i = 0; i < count; i++) sizes.push(u32(p, 12 + 4 * i));
      }
    } else if (child.type === "stsc") {
      need(p, 8);
      const n = u32(p, 4);
      need(p, 8 + 12 * n);
      for (let i = 0; i < n; i++) stsc.push([u32(p, 8 + 12 * i), u32(p, 12 + 12 * i)]);
    } else if (child.type === "stco" || child.type === "co64") {
      need(p, 8);
      const n = u32(p, 4);
      const wide = child.type === "co64";
      need(p, 8 + (wide ? 8 : 4) * n);
      for (let i = 0; i < n; i++) offsets.push(wide ? u64(p, 8 + 8 * i) : u32(p, 8 + 4 * i));
    }
  }
  const ranges: Array<{ offset: number; length: number }> = [];
  let sample = 0;
  for (let chunk = 1; chunk <= offsets.length && sample < count; chunk++) {
    // The last stsc entry whose first chunk is at or before this chunk applies.
    let perChunk = 0;
    for (const [first, n] of stsc) if (first <= chunk) perChunk = n;
    let length = 0;
    for (let i = 0; i < perChunk && sample < count; i++, sample++) length += constant || sizes[sample] || 0;
    if (length) ranges.push({ offset: offsets[chunk - 1], length });
  }
  return ranges;
}

function scanTrack(buf: Uint8Array, base: number, trak: Box, ctx: Ctx, blanked: boolean) {
  const mdia = findChild(buf, base, trak, "mdia");
  const handlerBox = mdia && findChild(buf, base, mdia, "hdlr");
  const handler = handlerBox && handlerBox.size >= handlerBox.headerSize + 12 ? fourcc(buf, handlerBox.start - base + handlerBox.headerSize + 8) : "";
  const minf = mdia && findChild(buf, base, mdia, "minf");
  const stbl = minf && findChild(buf, base, minf, "stbl");
  const stsd = stbl && findChild(buf, base, stbl, "stsd");
  const format = stsd && stsd.size >= stsd.headerSize + 16 ? fourcc(buf, stsd.start - base + stsd.headerSize + 12) : "";
  if (handler === "meta" || handler === "camm" || format === "gpmd" || format === "camm") {
    const [label, kind, detail] = META_TRACKS[format] ?? ["Timed metadata track", "other" as FindingKind, `Metadata samples (${format || "unknown format"})`];
    const remove = ctx.options.removeMetadataTracks;
    ctx.out.add({ kind, label, detail, source: "Track" }, remove || blanked);
    if (remove && !blanked) {
      ctx.patches.push(blankBox(trak));
      if (stbl) for (const range of sampleRanges(buf, base, stbl)) ctx.patches.push({ offset: range.offset, bytes: new Uint8Array(range.length) });
    }
    scanContainer(buf, base, trak, ctx, blanked || remove);
    return;
  }
  if (SUBTITLE_HANDLERS.has(handler)) {
    ctx.out.add({ kind: "other", label: "Subtitle track", detail: "Kept. Some drones and dash cameras store GPS data in a subtitle track.", source: "Track" }, false);
  }
  scanContainer(buf, base, trak, ctx, blanked);
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
        scanTrack(buf, base, box, ctx, blanked);
        break;
      case "udta":
        readUdta(buf, base, box, ctx);
        if (!blanked) ctx.patches.push(blankBox(box));
        break;
      case "meta":
        readMeta(buf, base, box, ctx, "QuickTime metadata");
        if (!blanked) ctx.patches.push(blankBox(box));
        break;
      case "uuid":
        if (readUuid(box, payload(buf, base, box), ctx) && !blanked) ctx.patches.push(blankBox(box));
        break;
      case "free":
      case "skip":
        readFree(payload(buf, base, box), box, ctx, blanked);
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
