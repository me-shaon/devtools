import { Findings, crc32, type FindingKind } from "@/utils/image-metadata";
import { formatBytes } from "@/utils/hash";
import type { ByteSource, Patch } from "@/utils/byte-source";
import { VideoError, iso6709, namedKey, type ScanResult, type VideoCleanOptions } from "@/utils/video-format";

/**
 * Reads and removes metadata in Matroska and WebM files. Removed elements
 * become Void elements of the same size, and removed strings become zero
 * bytes, so the seek index and the cues stay valid.
 */

export interface EbmlElement {
  id: number;
  start: number;
  dataStart: number;
  /** null when the size is unknown, as in live recordings. */
  size: number | null;
  end: number;
}

/** Reads a variable-size integer. IDs keep the marker bit, sizes do not. */
export function readVint(b: Uint8Array, o: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } | null {
  const first = b[o];
  if (first === undefined || first === 0) return null;
  let length = 1;
  let mask = 0x80;
  while (!(first & mask)) {
    length++;
    mask >>= 1;
  }
  if (o + length > b.length) return null;
  let value = keepMarker ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < length; i++) {
    value = value * 256 + b[o + i];
    if (b[o + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

/** Reads the element header in `h`, where h[0] is at file offset `start`. */
export function elementAt(h: Uint8Array, start: number, parentEnd: number): EbmlElement {
  const id = readVint(h, 0, true);
  const size = id && id.length <= 4 ? readVint(h, id.length, false) : null;
  if (!id || !size) throw new VideoError(`The element at byte ${start} is not valid Matroska data.`);
  const dataStart = start + id.length + size.length;
  const end = size.unknown ? parentEnd : dataStart + size.value;
  if (end > parentEnd) throw new VideoError(`The element at byte ${start} runs past the end of its parent.`);
  return { id: id.value, start, dataStart, size: size.unknown ? null : size.value, end };
}

/** A Void element of `total` bytes: ID 0xEC, a size, and zero data. */
export function voidElement(total: number): Uint8Array {
  if (total < 2) throw new Error("A Void element needs at least 2 bytes.");
  const out = new Uint8Array(total);
  out[0] = 0xec;
  // A size field of n bytes. Short elements use a longer size field that holds 0.
  const n = total <= 9 ? total - 1 : 8;
  let value = total - 1 - n;
  for (let i = n; i >= 1; i--) {
    out[i] = value % 256;
    value = Math.floor(value / 256);
  }
  out[1] |= 0x80 >> (n - 1);
  return out;
}

export const EBML_ID = {
  EBML: 0x1a45dfa3,
  DocType: 0x4282,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
  Info: 0x1549a966,
  Title: 0x7ba9,
  MuxingApp: 0x4d80,
  WritingApp: 0x5741,
  DateUTC: 0x4461,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  Name: 0x536e,
  Tags: 0x1254c367,
  Tag: 0x7373,
  SimpleTag: 0x67c8,
  TagName: 0x45a3,
  TagString: 0x4487,
  Attachments: 0x1941a469,
  AttachedFile: 0x61a7,
  FileName: 0x466e,
  FileMediaType: 0x4660,
  FileData: 0x465c,
  Cluster: 0x1f43b675,
  Crc32: 0xbf,
} as const;

const MAX_LEVEL1 = 64 * 1024 * 1024;
const DATE_2001 = Date.UTC(2001, 0, 1);
const textDecoder = new TextDecoder();

interface Ctx {
  out: Findings;
  patches: Patch[];
  options: VideoCleanOptions;
}

export function* ebmlChildren(buf: Uint8Array, base: number, parent: EbmlElement): Generator<EbmlElement> {
  let o = parent.dataStart - base;
  const to = parent.end - base;
  while (to - o >= 2) {
    const element = elementAt(buf.subarray(o, Math.min(to, o + 12)), base + o, base + to);
    yield element;
    if (element.size === null) return;
    o = element.end - base;
  }
}

const data = (buf: Uint8Array, base: number, element: EbmlElement) => buf.subarray(element.dataStart - base, element.end - base);
const text = (b: Uint8Array) => textDecoder.decode(b).replace(/\0+$/, "").trim();
const uint = (b: Uint8Array) => b.reduce((value, byte) => value * 256 + byte, 0);

function dateUtc(b: Uint8Array): string | null {
  if (b.length !== 8) return null;
  const ns = new DataView(b.buffer, b.byteOffset, 8).getBigInt64(0);
  const date = new Date(DATE_2001 + Number(ns) / 1e6);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace(".000Z", "Z");
}

/** Collects changes inside one element, then writes the element back with a correct CRC-32. */
class ElementEdit {
  private changed = false;
  private readonly bytes: Uint8Array;

  constructor(
    private readonly element: EbmlElement,
    buf: Uint8Array,
    base: number,
  ) {
    this.bytes = buf.slice(element.start - base, element.end - base);
  }

  zero(child: EbmlElement) {
    this.bytes.fill(0, child.dataStart - this.element.start, child.end - this.element.start);
    this.changed = true;
  }

  void(child: EbmlElement) {
    this.bytes.set(voidElement(child.end - child.start), child.start - this.element.start);
    this.changed = true;
  }

  finish(): Patch | null {
    if (!this.changed) return null;
    // Repair children first: a parent's checksum includes its children's CRC bytes.
    const repair = (parent: EbmlElement) => {
      const children = [...ebmlChildren(this.bytes, this.element.start, parent)];
      for (const child of children) {
        if (child.id === EBML_ID.TrackEntry || child.id === EBML_ID.AttachedFile) repair(child);
      }
      const first = children[0];
      if (first?.id === EBML_ID.Crc32 && first.size === 4) {
        const crc = crc32(this.bytes.subarray(first.end - this.element.start, parent.end - this.element.start));
        this.bytes.set([crc & 255, (crc >>> 8) & 255, (crc >>> 16) & 255, crc >>> 24], first.dataStart - this.element.start);
      }
    };
    repair(this.element);
    return { offset: this.element.start, bytes: this.bytes };
  }
}

function push(ctx: Ctx, patch: Patch | null) {
  if (patch) ctx.patches.push(patch);
}

function scanInfo(buf: Uint8Array, base: number, element: EbmlElement, ctx: Ctx) {
  const edit = new ElementEdit(element, buf, base);
  const source = "Matroska info";
  for (const child of ebmlChildren(buf, base, element)) {
    const value = data(buf, base, child);
    if (child.id === EBML_ID.Title || child.id === EBML_ID.MuxingApp || child.id === EBML_ID.WritingApp) {
      const content = text(value);
      if (!content) continue;
      const label = child.id === EBML_ID.Title ? "Title" : child.id === EBML_ID.MuxingApp ? "Muxing app" : "Writing app";
      ctx.out.addText(label, content, source, child.id === EBML_ID.Title ? "text" : "other");
      // Zero bytes make an empty string, so the elements that the format requires stay in place.
      edit.zero(child);
    } else if (child.id === EBML_ID.DateUTC) {
      ctx.out.add({ kind: "camera", label: "Recording date", detail: dateUtc(value) ?? "Unreadable date", source }, ctx.options.clearDates);
      if (ctx.options.clearDates) edit.void(child);
    }
  }
  push(ctx, edit.finish());
}

function scanTracks(buf: Uint8Array, base: number, element: EbmlElement, ctx: Ctx) {
  const edit = new ElementEdit(element, buf, base);
  for (const entry of ebmlChildren(buf, base, element)) {
    if (entry.id !== EBML_ID.TrackEntry) continue;
    for (const child of ebmlChildren(buf, base, entry)) {
      if (child.id !== EBML_ID.Name) continue;
      const content = text(data(buf, base, child));
      if (!content) continue;
      ctx.out.addText("Track name", content, "Matroska tracks", "text");
      edit.zero(child);
    }
  }
  push(ctx, edit.finish());
}

/** Tags that muxers write about the streams and the source file. The tool lists them as one item. */
const TECHNICAL = new Set([
  "BPS",
  "DURATION",
  "NUMBER_OF_FRAMES",
  "NUMBER_OF_BYTES",
  "_STATISTICS_WRITING_APP",
  "_STATISTICS_WRITING_DATE_UTC",
  "_STATISTICS_TAGS",
  "MAJOR_BRAND",
  "MINOR_VERSION",
  "COMPATIBLE_BRANDS",
  "HANDLER_NAME",
  "VENDOR_ID",
]);

const tagKind = (name: string): FindingKind =>
  /LOCATION|GPS|COORDINATES/i.test(name)
    ? "location"
    : /MAKE|MODEL|CAMERA|DEVICE|DATE|TIME/i.test(name)
      ? "camera"
      : /ARTIST|AUTHOR|COPYRIGHT|PUBLISHER|PRODUCER|DIRECTOR/i.test(name)
        ? "provenance"
        : /ENCODER|SOFTWARE|WRITING/i.test(name)
          ? "other"
          : "text";

function scanTags(buf: Uint8Array, base: number, element: EbmlElement, ctx: Ctx) {
  let technical = 0;
  const readSimpleTag = (tag: EbmlElement) => {
    let name = "";
    let value = "";
    for (const child of ebmlChildren(buf, base, tag)) {
      if (child.id === EBML_ID.TagName) name = text(data(buf, base, child));
      else if (child.id === EBML_ID.TagString) value = text(data(buf, base, child));
      else if (child.id === EBML_ID.SimpleTag) readSimpleTag(child);
    }
    if (TECHNICAL.has(name.toUpperCase())) {
      technical++;
      return;
    }
    if (!name && !value) return;
    const [label, kind] = namedKey(name) ?? [name || "Tag", tagKind(name)];
    ctx.out.addText(label, kind === "location" ? iso6709(value) : value || "(empty)", "Matroska tags", kind);
  };
  for (const tag of ebmlChildren(buf, base, element)) {
    if (tag.id !== EBML_ID.Tag) continue;
    for (const child of ebmlChildren(buf, base, tag)) if (child.id === EBML_ID.SimpleTag) readSimpleTag(child);
  }
  if (technical) {
    const values = `${technical} ${technical === 1 ? "value" : "values"}`;
    ctx.out.add({ kind: "other", label: "Technical tags", detail: `${values}, such as the bit rate, the frame count, and the source format`, source: "Matroska tags" });
  }
  ctx.patches.push({ offset: element.start, bytes: voidElement(element.end - element.start) });
}

const isFont = (name: string, mime: string) => /font|truetype|opentype|sfnt|woff/i.test(mime) || /\.(ttf|otf|ttc|woff2?)$/i.test(name);

function scanAttachments(buf: Uint8Array, base: number, element: EbmlElement, ctx: Ctx) {
  const edit = new ElementEdit(element, buf, base);
  const remove: EbmlElement[] = [];
  let kept = 0;
  for (const file of ebmlChildren(buf, base, element)) {
    if (file.id !== EBML_ID.AttachedFile) continue;
    let name = "";
    let mime = "";
    let length = 0;
    for (const child of ebmlChildren(buf, base, file)) {
      if (child.id === EBML_ID.FileName) name = text(data(buf, base, child));
      else if (child.id === EBML_ID.FileMediaType) mime = text(data(buf, base, child));
      else if (child.id === EBML_ID.FileData) length = child.end - child.dataStart;
    }
    const font = isFont(name, mime);
    const keep = font && ctx.options.keepFonts;
    const label = font ? "Attached font" : mime.startsWith("image/") ? "Attached picture" : "Attached file";
    ctx.out.add({ kind: "other", label, detail: `${name || "No name"}, ${mime || "unknown type"}, ${formatBytes(length)}`, source: "Matroska attachments" }, !keep);
    if (keep) kept++;
    else remove.push(file);
  }
  if (!remove.length) return;
  if (!kept) {
    ctx.patches.push({ offset: element.start, bytes: voidElement(element.end - element.start) });
    return;
  }
  for (const file of remove) edit.void(file);
  push(ctx, edit.finish());
}

/** The elements this module reads, at the top level of the segment or through the seek index. */
const READ_IDS = new Set<number>([EBML_ID.SeekHead, EBML_ID.Info, EBML_ID.Tracks, EBML_ID.Tags, EBML_ID.Attachments]);

/** Positions of metadata elements in the seek index, as file offsets. */
function seekTargets(buf: Uint8Array, base: number, element: EbmlElement, segmentDataStart: number): number[] {
  const positions: number[] = [];
  for (const seek of ebmlChildren(buf, base, element)) {
    if (seek.id !== EBML_ID.Seek) continue;
    let id = 0;
    let position = -1;
    for (const child of ebmlChildren(buf, base, seek)) {
      if (child.id === EBML_ID.SeekID) id = uint(data(buf, base, child));
      else if (child.id === EBML_ID.SeekPosition) position = uint(data(buf, base, child));
    }
    if (position >= 0 && READ_IDS.has(id)) positions.push(segmentDataStart + position);
  }
  return positions;
}

/** Finds the metadata in an MKV or WebM file, and the patches that remove it. */
export async function scanEbml(source: ByteSource, options: VideoCleanOptions): Promise<ScanResult> {
  const ctx: Ctx = { out: new Findings(), patches: [], options };
  const warnings: string[] = [];
  const ebml = elementAt(await source.read(0, 12), 0, source.size);
  if (ebml.id !== EBML_ID.EBML || ebml.size === null || ebml.end > 4096) throw new VideoError("The file does not start with a valid Matroska header.");
  const header = await source.read(0, ebml.end);
  let docType = "matroska";
  for (const child of ebmlChildren(header, 0, ebml)) if (child.id === EBML_ID.DocType) docType = text(data(header, 0, child));
  if (docType !== "webm" && docType !== "matroska") throw new VideoError(`The Matroska document type "${docType}" is not supported.`);
  const segment = elementAt(await source.read(ebml.end, 12), ebml.end, source.size);
  if (segment.id !== EBML_ID.Segment) throw new VideoError("The file has no Matroska segment.");

  const visited = new Set<number>();
  const pending: number[] = [];
  const visit = async (element: EbmlElement) => {
    if (visited.has(element.start) || !READ_IDS.has(element.id)) return;
    visited.add(element.start);
    if (element.size === null) throw new VideoError("A metadata element has an unknown size. This tool cannot read it.");
    if (element.end - element.start > MAX_LEVEL1) throw new VideoError("A metadata element is larger than 64 MB. This tool cannot read it.");
    const buf = await source.read(element.start, element.end - element.start);
    if (element.id === EBML_ID.SeekHead) pending.push(...seekTargets(buf, element.start, element, segment.dataStart));
    else if (element.id === EBML_ID.Info) scanInfo(buf, element.start, element, ctx);
    else if (element.id === EBML_ID.Tracks) scanTracks(buf, element.start, element, ctx);
    else if (element.id === EBML_ID.Tags) scanTags(buf, element.start, element, ctx);
    else if (element.id === EBML_ID.Attachments) scanAttachments(buf, element.start, element, ctx);
  };

  let o = segment.dataStart;
  while (segment.end - o >= 2) {
    let element: EbmlElement;
    try {
      element = elementAt(await source.read(o, 12), o, segment.end);
    } catch {
      warnings.push(`The file ends inside an element at byte ${o}. It may be cut off.`);
      break;
    }
    await visit(element);
    // After an element of unknown size (a live recording), the rest of the segment cannot be walked.
    if (element.size === null) {
      warnings.push(`The scan is incomplete after an unknown-size element at byte ${element.start}. Metadata not listed in the seek index may remain in the clean copy.`);
      break;
    }
    o = element.end;
  }
  for (let i = 0; i < pending.length; i++) {
    const position = pending[i];
    if (visited.has(position) || position >= segment.end) continue;
    try {
      await visit(elementAt(await source.read(position, 12), position, segment.end));
    } catch (error) {
      if (error instanceof VideoError && !/not valid|past the end/.test(error.message)) throw error;
      warnings.push(`The seek index points to byte ${position}, which is not a valid element.`);
    }
  }
  return { format: docType === "webm" ? "webm" : "mkv", findings: ctx.out.items, patches: ctx.patches, warnings };
}
