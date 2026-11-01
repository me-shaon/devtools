import { unzlibSync } from "fflate";

/**
 * Reads and removes metadata from JPEG, PNG and WebP files without
 * re-encoding pixels. Every function works on bytes only (no DOM).
 */

export type MetadataImageFormat = "jpeg" | "png" | "webp";
export type DetectedFormat = MetadataImageFormat | "gif" | "heic" | "avif" | "unknown";

export type FindingKind = "ai" | "location" | "camera" | "provenance" | "text" | "color-profile" | "other";

export interface MetadataFinding {
  kind: FindingKind;
  /** Short name, for example "GPS position" or "Stable Diffusion parameters". */
  label: string;
  /** One-line summary of the value. */
  detail: string;
  /** Full value (a prompt, a workflow, an XMP packet), when it is longer than the summary. */
  raw?: string;
  /** Where the value is stored, for example "EXIF", "XMP", "PNG tEXt". */
  source: string;
  /** True when cleaning with the given options removes this item. */
  removable: boolean;
}

export interface InspectResult {
  format: MetadataImageFormat;
  size: number;
  findings: MetadataFinding[];
  /** EXIF orientation (1 to 8), or null when the file has none. */
  orientation: number | null;
  hasAi: boolean;
  hasLocation: boolean;
}

export interface CleanOptions {
  /** Keep ICC profiles and PNG color chunks (sRGB, gAMA, cHRM, cICP). */
  keepColorProfile: boolean;
  /** Write back a minimal EXIF block that holds only the orientation tag. */
  keepOrientation: boolean;
}

export interface CleanResult {
  bytes: Uint8Array;
  before: InspectResult;
  after: InspectResult;
  /** Number of findings that the clean copy no longer has. */
  removedCount: number;
  /** Bytes saved. Can be negative only in theory (a re-added orientation block). */
  savedBytes: number;
}

export const DEFAULT_CLEAN_OPTIONS: CleanOptions = { keepColorProfile: true, keepOrientation: true };

export const FINDING_KIND_LABELS: Record<FindingKind, string> = {
  ai: "AI generation",
  location: "Location",
  camera: "Camera and capture",
  provenance: "Provenance and authorship",
  text: "Text and comments",
  "color-profile": "Color profile",
  other: "Other",
};

export const FINDING_KIND_ORDER: FindingKind[] = ["ai", "location", "camera", "provenance", "text", "color-profile", "other"];

export const FORMAT_LABELS: Record<MetadataImageFormat, string> = { jpeg: "JPEG", png: "PNG", webp: "WebP" };

export const FORMAT_MIME: Record<MetadataImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SUMMARY_LIMIT = 160;

/* ------------------------------------------------------------------ */
/* Byte helpers                                                        */
/* ------------------------------------------------------------------ */

const ascii = (bytes: Uint8Array, start: number, length: number) => {
  let out = "";
  const end = Math.min(bytes.length, start + length);
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
};

const latin1 = (bytes: Uint8Array) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 8192)));
  }
  return out;
};

const utf8 = (bytes: Uint8Array) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return latin1(bytes);
  }
};

const startsWith = (bytes: Uint8Array, offset: number, text: string) => {
  if (offset + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  return true;
};

const indexOfByte = (bytes: Uint8Array, value: number, from: number) => {
  for (let i = from; i < bytes.length; i++) if (bytes[i] === value) return i;
  return -1;
};

const readU16BE = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const readU32BE = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const readU32LE = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

const writeU32LE = (b: Uint8Array, o: number, v: number) => {
  b[o] = v & 0xff;
  b[o + 1] = (v >>> 8) & 0xff;
  b[o + 2] = (v >>> 16) & 0xff;
  b[o + 3] = (v >>> 24) & 0xff;
};

const writeU32BE = (b: Uint8Array, o: number, v: number) => {
  b[o] = (v >>> 24) & 0xff;
  b[o + 1] = (v >>> 16) & 0xff;
  b[o + 2] = (v >>> 8) & 0xff;
  b[o + 3] = v & 0xff;
};

const concat = (parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const summarize = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > SUMMARY_LIMIT ? `${flat.slice(0, SUMMARY_LIMIT - 1)}…` : flat;
};

const formatSize = (size: number) => (size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 as PNG chunks use it. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ */
/* Format detection                                                    */
/* ------------------------------------------------------------------ */

/** Identifies the file type from its first bytes. */
export function detectImageFormat(bytes: Uint8Array): DetectedFormat {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && PNG_SIGNATURE.every((v, i) => bytes[i] === v)) return "png";
  if (bytes.length >= 12 && startsWith(bytes, 0, "RIFF") && startsWith(bytes, 8, "WEBP")) return "webp";
  if (startsWith(bytes, 0, "GIF8")) return "gif";
  if (bytes.length >= 12 && startsWith(bytes, 4, "ftyp")) {
    const brand = ascii(bytes, 8, 4);
    if (brand === "avif" || brand === "avis") return "avif";
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return "heic";
  }
  return "unknown";
}

/* ------------------------------------------------------------------ */
/* AI hints                                                            */
/* ------------------------------------------------------------------ */

const AI_HINTS: Array<[RegExp, string]> = [
  [/compositeWithTrainedAlgorithmicMedia/i, "Edited with generative AI (IPTC)"],
  [/trainedAlgorithmicMedia/i, "Created by generative AI (IPTC)"],
  [/midjourney/i, "Midjourney"],
  [/DALL[·\-.\s]?E/i, "DALL·E"],
  [/\bOpenAI\b|\bChatGPT\b|gpt-image/i, "OpenAI"],
  [/\bFirefly\b/i, "Adobe Firefly"],
  [/Generative (Fill|Expand)/i, "Adobe Generative Fill"],
  [/Stable Diffusion|\bSDXL\b|stability\.ai/i, "Stable Diffusion"],
  [/ComfyUI/i, "ComfyUI"],
  [/NovelAI/i, "NovelAI"],
  [/InvokeAI/i, "InvokeAI"],
  [/Automatic1111|\bA1111\b/i, "Automatic1111"],
  [/Negative prompt:|\bSampler:\s|\bCFG scale:/i, "Stable Diffusion"],
  [/\bImagen\b|\bGemini\b|SynthID/i, "Google AI"],
  [/\bFLUX(\.1)?\b/, "FLUX"],
  [/Leonardo\.Ai|\bIdeogram\b|Bing Image Creator|Microsoft Designer|\bGrok\b|\bAurora\b/i, "AI image service"],
  [/\bSora\b/, "OpenAI Sora"],
  [/\bVeo\b/, "Google Veo"],
  [/\bRunway\b|\bGen-[234]\b/, "Runway"],
  [/\bKling\b/, "Kling"],
  [/\bPika\b/, "Pika"],
  [/Dream Machine|\bLuma AI\b/, "Luma Dream Machine"],
  [/\bHailuo\b|\bMiniMax\b/, "Hailuo"],
  [/Made with AI|AI[- ]generated|Generated (by|with) AI/i, "AI label"],
];

/** Returns the name of the AI tool or label the text mentions, or null. */
export function findAiHint(text: string): string | null {
  for (const [pattern, name] of AI_HINTS) if (pattern.test(text)) return name;
  return null;
}

/* ------------------------------------------------------------------ */
/* Findings collector                                                  */
/* ------------------------------------------------------------------ */

type Draft = Omit<MetadataFinding, "removable">;

export class Findings {
  readonly items: MetadataFinding[] = [];
  orientation: number | null = null;

  add(finding: Draft, removable = true) {
    this.items.push({ ...finding, removable });
  }

  /** Adds a text value, as an AI finding when it mentions an AI tool. */
  addText(label: string, value: string, source: string, fallbackKind: FindingKind = "text", removable = true) {
    const hint = findAiHint(value);
    const raw = value.length > SUMMARY_LIMIT || value.includes("\n") ? value : undefined;
    this.add(
      {
        kind: hint ? "ai" : fallbackKind,
        label: hint && fallbackKind !== "ai" ? `${label} (mentions ${hint})` : label,
        detail: summarize(value) || "(empty)",
        raw,
        source,
      },
      removable,
    );
  }
}

/* ------------------------------------------------------------------ */
/* EXIF / TIFF                                                         */
/* ------------------------------------------------------------------ */

interface TiffEntry {
  tag: number;
  type: number;
  count: number;
  valueOffset: number;
}

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

class TiffReader {
  readonly little: boolean;

  constructor(readonly b: Uint8Array) {
    if (b.length < 8) throw new Error("EXIF block is too short.");
    const order = ascii(b, 0, 2);
    if (order !== "II" && order !== "MM") throw new Error("EXIF block has no byte order mark.");
    this.little = order === "II";
  }

  u16(o: number) {
    return this.little ? this.b[o] | (this.b[o + 1] << 8) : readU16BE(this.b, o);
  }

  u32(o: number) {
    return this.little ? readU32LE(this.b, o) : readU32BE(this.b, o);
  }

  firstIfd() {
    return this.u32(4);
  }

  entries(offset: number): TiffEntry[] {
    if (offset < 8 || offset + 2 > this.b.length) return [];
    const count = this.u16(offset);
    const out: TiffEntry[] = [];
    for (let i = 0; i < count; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > this.b.length) break;
      const type = this.u16(e + 2);
      const n = this.u32(e + 4);
      const size = (TYPE_SIZES[type] ?? 1) * n;
      out.push({ tag: this.u16(e), type, count: n, valueOffset: size <= 4 ? e + 8 : this.u32(e + 8) });
    }
    return out;
  }

  bytes(entry: TiffEntry) {
    const size = (TYPE_SIZES[entry.type] ?? 1) * entry.count;
    const start = entry.valueOffset;
    if (start + size > this.b.length) return new Uint8Array();
    return this.b.subarray(start, start + size);
  }

  string(entry: TiffEntry) {
    return utf8(this.bytes(entry)).replace(/\0+$/, "").trim();
  }

  number(entry: TiffEntry, index = 0): number {
    const o = entry.valueOffset;
    switch (entry.type) {
      case 1:
      case 7:
        return this.b[o + index];
      case 3:
        return this.u16(o + index * 2);
      case 4:
      case 9:
        return this.u32(o + index * 4);
      case 5:
      case 10: {
        const den = this.u32(o + index * 8 + 4);
        return den ? this.u32(o + index * 8) / den : 0;
      }
      default:
        return 0;
    }
  }

  userComment(entry: TiffEntry) {
    const data = this.bytes(entry);
    if (data.length < 8) return "";
    const code = ascii(data, 0, 8).replace(/\0+$/, "");
    const body = data.subarray(8);
    if (code === "UNICODE") {
      // UTF-16 in the TIFF byte order. Some writers ignore that, so guess from the first byte pair.
      let little = this.little;
      if (body.length >= 2 && body[0] === 0 && body[1] !== 0) little = false;
      else if (body.length >= 2 && body[0] !== 0 && body[1] === 0) little = true;
      try {
        return new TextDecoder(little ? "utf-16le" : "utf-16be").decode(body).replace(/\0+$/, "").trim();
      } catch {
        return "";
      }
    }
    return utf8(body).replace(/\0+$/, "").trim();
  }
}

const IFD0_TEXT: Record<number, [string, FindingKind]> = {
  0x010e: ["Image description", "text"],
  0x010f: ["Camera make", "camera"],
  0x0110: ["Camera model", "camera"],
  0x0131: ["Software", "other"],
  0x0132: ["Modified date", "camera"],
  0x013b: ["Artist", "provenance"],
  0x8298: ["Copyright", "provenance"],
};

const EXIF_TEXT: Record<number, [string, FindingKind]> = {
  0x9003: ["Date taken", "camera"],
  0xa430: ["Camera owner", "camera"],
  0xa431: ["Camera serial number", "camera"],
  0xa434: ["Lens model", "camera"],
  0xa435: ["Lens serial number", "camera"],
  0xa420: ["Unique image ID", "camera"],
};

const gpsCoordinate = (tiff: TiffReader, entry: TiffEntry | undefined, ref: string) => {
  if (!entry || entry.count < 3) return null;
  const value = tiff.number(entry, 0) + tiff.number(entry, 1) / 60 + tiff.number(entry, 2) / 3600;
  return ref === "S" || ref === "W" ? -value : value;
};

/** Reads an EXIF TIFF block (without the "Exif\0\0" prefix) into findings. */
function readExif(tiffBytes: Uint8Array, out: Findings, source: string, options: CleanOptions) {
  let tiff: TiffReader;
  try {
    tiff = new TiffReader(tiffBytes);
  } catch {
    out.add({ kind: "other", label: "EXIF data", detail: `Unreadable EXIF block, ${formatSize(tiffBytes.length)}`, source });
    return;
  }
  const before = out.items.length;
  const ifd0 = tiff.entries(tiff.firstIfd());
  let exifPointer = 0;
  let gpsPointer = 0;
  for (const entry of ifd0) {
    if (entry.tag === 0x8769) exifPointer = tiff.number(entry);
    else if (entry.tag === 0x8825) gpsPointer = tiff.number(entry);
    else if (entry.tag === 0x0112) {
      const value = tiff.number(entry);
      out.orientation = value;
      out.add(
        { kind: "other", label: "Orientation", detail: `${value}${value === 1 ? " (normal)" : " (rotated or mirrored)"}`, source },
        !options.keepOrientation,
      );
    } else if (IFD0_TEXT[entry.tag]) {
      const [label, kind] = IFD0_TEXT[entry.tag];
      const value = tiff.string(entry);
      if (value) out.addText(label, value, source, kind);
    }
  }
  if (exifPointer) {
    for (const entry of tiff.entries(exifPointer)) {
      if (entry.tag === 0x9286) {
        const value = tiff.userComment(entry);
        if (value) out.addText("User comment", value, source);
      } else if (EXIF_TEXT[entry.tag]) {
        const [label, kind] = EXIF_TEXT[entry.tag];
        const value = tiff.string(entry);
        if (value) out.addText(label, value, source, kind);
      }
    }
  }
  if (gpsPointer) {
    const gps = new Map(tiff.entries(gpsPointer).map((e) => [e.tag, e]));
    const latRef = gps.get(1) ? tiff.string(gps.get(1)!) : "N";
    const lonRef = gps.get(3) ? tiff.string(gps.get(3)!) : "E";
    const lat = gpsCoordinate(tiff, gps.get(2), latRef);
    const lon = gpsCoordinate(tiff, gps.get(4), lonRef);
    if (lat !== null && lon !== null) {
      out.add({ kind: "location", label: "GPS position", detail: `${lat.toFixed(6)}, ${lon.toFixed(6)}`, source });
    } else if (gps.size > 0) {
      out.add({ kind: "location", label: "GPS data", detail: `${gps.size} GPS tags`, source });
    }
    const alt = gps.get(6);
    if (alt) {
      const below = gps.get(5) && tiff.number(gps.get(5)!) === 1;
      out.add({ kind: "location", label: "GPS altitude", detail: `${(below ? -1 : 1) * Math.round(tiff.number(alt) * 10) / 10} m`, source });
    }
  }
  const extra = ifd0.length - (out.items.length - before);
  if (out.items.length === before) {
    out.add({ kind: "other", label: "EXIF data", detail: `${ifd0.length} tags, ${formatSize(tiffBytes.length)}`, source });
  } else if (extra > 0) {
    out.add({ kind: "other", label: "Other EXIF tags", detail: `EXIF block, ${formatSize(tiffBytes.length)}`, source });
  }
}

/**
 * Builds a big-endian TIFF block with one IFD entry: Orientation.
 * Returns the TIFF bytes without the "Exif\0\0" prefix.
 */
export function buildOrientationTiff(orientation: number): Uint8Array {
  const b = new Uint8Array(26);
  b.set([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]); // "MM", 42, IFD0 at offset 8
  b.set([0x00, 0x01], 8); // one entry
  b.set([0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01], 10); // tag 0x0112, SHORT, count 1
  b[18] = (orientation >> 8) & 0xff;
  b[19] = orientation & 0xff;
  // bytes 20-21: padding, 22-25: next IFD offset 0
  return b;
}

/* ------------------------------------------------------------------ */
/* XMP                                                                 */
/* ------------------------------------------------------------------ */

const DIGITAL_SOURCE_LABELS: Record<string, string> = {
  trainedAlgorithmicMedia: "Created by generative AI",
  compositeWithTrainedAlgorithmicMedia: "Edited with generative AI",
  algorithmicMedia: "Algorithmic media (no training data)",
  compositeSynthetic: "Composite with synthetic elements",
  algorithmicallyEnhanced: "Algorithmically enhanced",
  digitalCapture: "Digital capture",
  computationalCapture: "Computational capture",
  negativeFilm: "Scan of negative film",
  positiveFilm: "Scan of positive film",
  print: "Scan of print",
  minorHumanEdits: "Minor human edits",
  compositeCapture: "Composite of captures",
  digitalArt: "Digital art",
  virtualRecording: "Virtual recording",
  screenCapture: "Screen capture",
};

const AI_SOURCE_TYPES = new Set(["trainedAlgorithmicMedia", "compositeWithTrainedAlgorithmicMedia", "algorithmicMedia", "compositeSynthetic"]);

const decodeXmlEntities = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** Reads a property from an XMP packet, in attribute or element form. */
export function xmpProperty(xml: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attr = new RegExp(`\\s${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(xml);
  if (attr) return decodeXmlEntities(attr[1] ?? attr[2] ?? "").trim();
  const resource = new RegExp(`<${escaped}\\b[^>]*rdf:resource\\s*=\\s*"([^"]*)"`).exec(xml);
  if (resource) return decodeXmlEntities(resource[1]).trim();
  const element = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)</${escaped}>`).exec(xml);
  if (element) {
    const items = [...element[1].matchAll(/<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/g)].map((m) => m[1]);
    const values = (items.length ? items : [element[1]]).map((v) => decodeXmlEntities(v.replace(/<[^>]+>/g, "")).trim()).filter(Boolean);
    return values.length ? values.join("; ") : null;
  }
  return null;
}

const XMP_FIELDS: Array<[string, string, FindingKind]> = [
  ["photoshop:Credit", "Credit", "provenance"],
  ["dc:creator", "Creator", "provenance"],
  ["dc:rights", "Rights", "provenance"],
  ["xmpRights:WebStatement", "Rights statement", "provenance"],
  ["xmp:CreatorTool", "Creator tool", "other"],
  ["dc:title", "Title", "text"],
  ["dc:description", "Description", "text"],
  ["exif:UserComment", "User comment", "text"],
  ["tiff:Make", "Camera make", "camera"],
  ["tiff:Model", "Camera model", "camera"],
  ["exifEX:BodySerialNumber", "Camera serial number", "camera"],
  ["aux:SerialNumber", "Camera serial number", "camera"],
  ["photoshop:City", "City", "location"],
  ["photoshop:State", "State or province", "location"],
  ["photoshop:Country", "Country", "location"],
  ["Iptc4xmpCore:Location", "Location", "location"],
];

/** Reads an XMP packet into findings. */
export function readXmp(xml: string, out: Findings, source: string) {
  const source2 = xmpProperty(xml, "Iptc4xmpExt:DigitalSourceType");
  let aiFound = false;
  if (source2) {
    const code = source2.split("/").pop() ?? source2;
    const isAi = AI_SOURCE_TYPES.has(code);
    aiFound = isAi;
    out.add({
      kind: isAi ? "ai" : "provenance",
      label: "Digital source type",
      detail: `${DIGITAL_SOURCE_LABELS[code] ?? code} (${code})`,
      source,
    });
  }
  for (const [name, label, kind] of XMP_FIELDS) {
    const value = xmpProperty(xml, name);
    if (!value) continue;
    const before = out.items.length;
    out.addText(label, value, source, kind);
    if (out.items[before].kind === "ai") aiFound = true;
  }
  const lat = xmpProperty(xml, "exif:GPSLatitude");
  const lon = xmpProperty(xml, "exif:GPSLongitude");
  if (lat || lon) out.add({ kind: "location", label: "GPS position", detail: [lat, lon].filter(Boolean).join(", "), source });
  if (/c2pa|contentauth|Content Credentials/i.test(xml)) {
    out.add({ kind: "provenance", label: "Content Credentials reference", detail: "The XMP packet points to a C2PA manifest", source });
  }
  if (!aiFound) {
    const hint = findAiHint(xml);
    if (hint) out.add({ kind: "ai", label: "AI tool mentioned", detail: hint, source });
  }
  out.add({ kind: "other", label: "XMP packet", detail: `XML metadata, ${formatSize(xml.length)}`, raw: xml.trim(), source });
}

/* ------------------------------------------------------------------ */
/* C2PA / JUMBF, ICC, IPTC                                             */
/* ------------------------------------------------------------------ */

/** The CBOR text value of `key`, when the key appears within 64 characters after `from`. */
function cborTextAfter(text: string, from: number, key: string): string | null {
  const at = text.indexOf(String.fromCharCode(0x60 + key.length) + key, from);
  if (at < 0 || at - from > 64) return null;
  let p = at + 1 + key.length;
  const head = text.charCodeAt(p++);
  if (head >> 5 !== 3) return null;
  let length = head & 0x1f;
  if (length === 24) length = text.charCodeAt(p++);
  else if (length > 24) return null;
  const value = text.slice(p, p + length);
  return /^[\x20-\x7e]{3,80}$/.test(value) ? value : null;
}

export function readC2pa(data: Uint8Array, out: Findings, source: string) {
  const text = latin1(data);
  const isC2pa = /c2pa/.test(text);
  // C2PA 2.x names the maker in claim_generator_info; older manifests use a claim_generator string.
  const infoAt = text.indexOf("claim_generator_info");
  const generator = (infoAt >= 0 ? cborTextAfter(text, infoAt, "name") : null)
    ?? /claim_generator(?!_info)[^A-Za-z0-9]{1,4}([\x20-\x7e]{3,80})/.exec(text)?.[1];
  const hint = findAiHint(text);
  out.add({
    kind: "provenance",
    label: isC2pa ? "Content Credentials (C2PA)" : "JUMBF metadata box",
    detail: [isC2pa ? "C2PA manifest present" : "JPEG universal metadata box", generator ? `made by ${generator}` : "", formatSize(data.length)]
      .filter(Boolean)
      .join(", "),
    source,
  });
  if (hint) out.add({ kind: "ai", label: "AI noted in Content Credentials", detail: hint, source });
}

/** Reads the profile description from an ICC profile, if the bytes hold it. */
export function iccDescription(profile: Uint8Array): string | null {
  if (profile.length < 132) return null;
  const count = readU32BE(profile, 128);
  for (let i = 0; i < count; i++) {
    const e = 132 + i * 12;
    if (e + 12 > profile.length) break;
    if (ascii(profile, e, 4) !== "desc") continue;
    const offset = readU32BE(profile, e + 4);
    const type = ascii(profile, offset, 4);
    if (type === "desc") {
      const length = readU32BE(profile, offset + 8);
      return ascii(profile, offset + 12, Math.max(0, length - 1)).trim() || null;
    }
    if (type === "mluc" && offset + 28 <= profile.length) {
      const recLength = readU32BE(profile, offset + 20);
      const recOffset = readU32BE(profile, offset + 24);
      const start = offset + recOffset;
      if (start + recLength > profile.length) return null;
      try {
        return new TextDecoder("utf-16be").decode(profile.subarray(start, start + recLength)).replace(/\0+$/, "").trim() || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

const addIcc = (profile: Uint8Array, out: Findings, source: string, options: CleanOptions) => {
  const name = iccDescription(profile);
  out.add(
    { kind: "color-profile", label: "ICC color profile", detail: `${name ?? "Embedded profile"}, ${formatSize(profile.length)}`, source },
    !options.keepColorProfile,
  );
};

const IPTC_FIELDS: Record<number, [string, FindingKind]> = {
  5: ["Title", "text"],
  25: ["Keywords", "text"],
  80: ["By-line", "provenance"],
  90: ["City", "location"],
  92: ["Sublocation", "location"],
  95: ["State or province", "location"],
  101: ["Country", "location"],
  110: ["Credit", "provenance"],
  115: ["Source", "provenance"],
  116: ["Copyright", "provenance"],
  120: ["Caption", "text"],
};

function readIptc(data: Uint8Array, out: Findings, source: string) {
  const values = new Map<number, string[]>();
  let p = 0;
  while (p + 5 <= data.length && data[p] === 0x1c) {
    const record = data[p + 1];
    const dataset = data[p + 2];
    const length = readU16BE(data, p + 3);
    if (length & 0x8000) break;
    const value = utf8(data.subarray(p + 5, p + 5 + length)).trim();
    if (record === 2 && IPTC_FIELDS[dataset] && value) values.set(dataset, [...(values.get(dataset) ?? []), value]);
    p += 5 + length;
  }
  for (const [dataset, list] of values) {
    const [label, kind] = IPTC_FIELDS[dataset];
    out.addText(label, list.join("; "), source, kind);
  }
  return values.size;
}

function readPhotoshop(segment: Uint8Array, out: Findings, source: string) {
  // segment starts after "Photoshop 3.0\0"
  let p = 0;
  let found = 0;
  let resources = 0;
  while (p + 12 <= segment.length && startsWith(segment, p, "8BIM")) {
    const id = readU16BE(segment, p + 4);
    const nameLength = segment[p + 6];
    let q = p + 6 + 1 + nameLength;
    if ((1 + nameLength) % 2) q++;
    if (q + 4 > segment.length) break;
    const size = readU32BE(segment, q);
    const data = segment.subarray(q + 4, q + 4 + size);
    resources++;
    if (id === 0x0404) found += readIptc(data, out, source);
    p = q + 4 + size + (size % 2);
  }
  out.add({ kind: "other", label: "Photoshop data", detail: `${resources} resource blocks${found ? ", includes IPTC" : ""}, ${formatSize(segment.length)}`, source });
}

/* ------------------------------------------------------------------ */
/* JPEG                                                                */
/* ------------------------------------------------------------------ */

interface JpegSegment {
  marker: number;
  /** Offset of the 0xFF that starts the marker. */
  start: number;
  /** Offset after the segment. */
  end: number;
  /** Payload, after the two length bytes. */
  data: Uint8Array;
}

const EXIF_ID = "Exif\0\0";
const XMP_ID = "http://ns.adobe.com/xap/1.0/\0";
const XMP_EXT_ID = "http://ns.adobe.com/xmp/extension/\0";
const ICC_ID = "ICC_PROFILE\0";

/** Splits a JPEG into the segments before the first SOS and the rest (scan data, kept as is). */
function parseJpeg(bytes: Uint8Array): { segments: JpegSegment[]; tailStart: number } {
  const segments: JpegSegment[] = [];
  let p = 2;
  while (p < bytes.length) {
    if (bytes[p] !== 0xff) throw new Error("The JPEG structure is damaged.");
    let m = p + 1;
    while (m < bytes.length && bytes[m] === 0xff) m++;
    const marker = bytes[m];
    if (marker === 0xda || marker === 0xd9) return { segments, tailStart: p };
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      segments.push({ marker, start: p, end: m + 1, data: new Uint8Array() });
      p = m + 1;
      continue;
    }
    if (m + 3 > bytes.length) throw new Error("The JPEG file is cut off.");
    const length = readU16BE(bytes, m + 1);
    const end = m + 1 + length;
    if (length < 2 || end > bytes.length) throw new Error("The JPEG file is cut off.");
    segments.push({ marker, start: p, end, data: bytes.subarray(m + 3, end) });
    p = end;
  }
  return { segments, tailStart: bytes.length };
}

type JpegRole = "jfif" | "exif" | "xmp" | "xmp-ext" | "icc" | "c2pa" | "photoshop" | "comment" | "adobe" | "app" | "image";

function jpegRole(s: JpegSegment): JpegRole {
  const { marker, data } = s;
  if (marker === 0xe0) return startsWith(data, 0, "JFIF\0") || startsWith(data, 0, "JFXX\0") ? "jfif" : "app";
  if (marker === 0xe1) {
    if (startsWith(data, 0, EXIF_ID)) return "exif";
    if (startsWith(data, 0, XMP_ID)) return "xmp";
    if (startsWith(data, 0, XMP_EXT_ID)) return "xmp-ext";
    return "app";
  }
  if (marker === 0xe2 && startsWith(data, 0, ICC_ID)) return "icc";
  if (marker === 0xeb) return "c2pa";
  if (marker === 0xed) return "photoshop";
  if (marker === 0xee && startsWith(data, 0, "Adobe")) return "adobe";
  if (marker === 0xfe) return "comment";
  if (marker >= 0xe0 && marker <= 0xef) return "app";
  return "image";
}

function inspectJpeg(bytes: Uint8Array, options: CleanOptions, out: Findings) {
  const { segments } = parseJpeg(bytes);
  const iccParts: Array<[number, Uint8Array]> = [];
  const c2paParts: Uint8Array[] = [];
  const extendedXmp: Uint8Array[] = [];
  for (const s of segments) {
    const role = jpegRole(s);
    switch (role) {
      case "jfif":
        out.add({ kind: "other", label: "JFIF header", detail: "Basic format header. Always kept.", source: "APP0" }, false);
        break;
      case "exif":
        readExif(s.data.subarray(EXIF_ID.length), out, "EXIF", options);
        break;
      case "xmp":
        readXmp(utf8(s.data.subarray(XMP_ID.length)), out, "XMP");
        break;
      case "xmp-ext":
        extendedXmp.push(s.data.subarray(XMP_EXT_ID.length + 40));
        break;
      case "icc":
        iccParts.push([s.data[ICC_ID.length], s.data.subarray(ICC_ID.length + 2)]);
        break;
      case "c2pa":
        c2paParts.push(s.data);
        break;
      case "photoshop":
        if (startsWith(s.data, 0, "Photoshop 3.0\0")) readPhotoshop(s.data.subarray(14), out, "IPTC");
        else out.add({ kind: "other", label: "APP13 data", detail: formatSize(s.data.length), source: "APP13" });
        break;
      case "comment":
        out.addText("Comment", utf8(s.data).replace(/\0+$/, ""), "JPEG comment");
        break;
      case "app": {
        const n = s.marker - 0xe0;
        const id = ascii(s.data, 0, 16).split("\0")[0].replace(/[^\x20-\x7e]/g, "");
        out.add({ kind: "other", label: `APP${n} block`, detail: `${id || "Unnamed"}, ${formatSize(s.data.length)}`, source: `APP${n}` });
        break;
      }
      default:
        break;
    }
  }
  if (extendedXmp.length) {
    readXmp(utf8(concat(extendedXmp)), out, "Extended XMP");
  }
  if (iccParts.length) {
    iccParts.sort((a, b) => a[0] - b[0]);
    addIcc(concat(iccParts.map(([, d]) => d)), out, "APP2", options);
  }
  if (c2paParts.length) readC2pa(concat(c2paParts), out, "APP11");
}

function cleanJpeg(bytes: Uint8Array, options: CleanOptions, orientation: number | null): Uint8Array {
  const { segments, tailStart } = parseJpeg(bytes);
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  const orientationBlock =
    options.keepOrientation && orientation && orientation !== 1 ? jpegExifSegment(buildOrientationTiff(orientation)) : null;
  let orientationWritten = false;
  const writeOrientation = () => {
    if (orientationBlock && !orientationWritten) {
      parts.push(orientationBlock);
      orientationWritten = true;
    }
  };
  segments.forEach((s, index) => {
    const role = jpegRole(s);
    const keep = role === "jfif" || role === "adobe" || role === "image" || (role === "icc" && options.keepColorProfile);
    if (index === 0 && role !== "jfif") writeOrientation();
    if (keep) parts.push(bytes.subarray(s.start, s.end));
    if (role === "jfif") writeOrientation();
  });
  writeOrientation();
  parts.push(bytes.subarray(tailStart));
  return concat(parts);
}

const jpegExifSegment = (tiff: Uint8Array) => {
  const length = 2 + EXIF_ID.length + tiff.length;
  const seg = new Uint8Array(2 + length);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  seg[2] = (length >> 8) & 0xff;
  seg[3] = length & 0xff;
  for (let i = 0; i < EXIF_ID.length; i++) seg[4 + i] = EXIF_ID.charCodeAt(i);
  seg.set(tiff, 4 + EXIF_ID.length);
  return seg;
};

/* ------------------------------------------------------------------ */
/* PNG                                                                 */
/* ------------------------------------------------------------------ */

interface PngChunk {
  type: string;
  start: number;
  end: number;
  data: Uint8Array;
}

function parsePng(bytes: Uint8Array): PngChunk[] {
  const chunks: PngChunk[] = [];
  let p = 8;
  while (p + 12 <= bytes.length) {
    const length = readU32BE(bytes, p);
    const type = ascii(bytes, p + 4, 4);
    const end = p + 12 + length;
    if (end > bytes.length) throw new Error("The PNG file is cut off.");
    chunks.push({ type, start: p, end, data: bytes.subarray(p + 8, p + 8 + length) });
    p = end;
    if (type === "IEND") break;
  }
  if (!chunks.length || chunks[0].type !== "IHDR") throw new Error("The PNG structure is damaged.");
  return chunks;
}

const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "pHYs", "sBIT", "bKGD", "hIST", "sPLT", "acTL", "fcTL", "fdAT"]);
const PNG_COLOR = new Set(["iCCP", "sRGB", "gAMA", "cHRM", "cICP", "mDCv", "cLLi"]);

const inflate = (data: Uint8Array) => {
  try {
    return unzlibSync(data);
  } catch {
    return null;
  }
};

const PNG_AI_KEYS: Record<string, string> = {
  parameters: "Stable Diffusion parameters",
  prompt: "ComfyUI prompt",
  workflow: "ComfyUI workflow",
  "sd-metadata": "InvokeAI metadata",
  invokeai_metadata: "InvokeAI metadata",
  invokeai_graph: "InvokeAI graph",
  dream: "Dream prompt",
  generation_data: "Generation data",
  "Negative Prompt": "Negative prompt",
};

const prettyJson = (text: string) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

function readPngText(keyword: string, text: string, out: Findings, source: string, software: string) {
  if (keyword === "XML:com.adobe.xmp") {
    readXmp(text, out, `${source} XMP`);
    return;
  }
  const novel = /NovelAI/i.test(software);
  const aiLabel = PNG_AI_KEYS[keyword] ?? (novel && (keyword === "Comment" || keyword === "Description") ? `NovelAI ${keyword.toLowerCase()}` : null);
  if (aiLabel) {
    const raw = text.trim().startsWith("{") ? prettyJson(text) : text;
    out.add({ kind: "ai", label: aiLabel, detail: summarize(text) || "(empty)", raw, source: `${source} "${keyword}"` });
    return;
  }
  const kind: FindingKind = keyword === "Author" || keyword === "Copyright" ? "provenance" : keyword === "Software" ? "other" : "text";
  out.addText(keyword, text, `${source} "${keyword}"`, kind);
}

function inspectPng(bytes: Uint8Array, options: CleanOptions, out: Findings) {
  const chunks = parsePng(bytes);
  const texts: Array<[string, string, string]> = [];
  for (const c of chunks) {
    const { type, data } = c;
    if (type === "tEXt") {
      const zero = indexOfByte(data, 0, 0);
      if (zero < 0) continue;
      texts.push([latin1(data.subarray(0, zero)), latin1(data.subarray(zero + 1)), "PNG tEXt"]);
    } else if (type === "zTXt") {
      const zero = indexOfByte(data, 0, 0);
      if (zero < 0) continue;
      const inflated = inflate(data.subarray(zero + 2));
      texts.push([latin1(data.subarray(0, zero)), inflated ? latin1(inflated) : "(could not decompress)", "PNG zTXt"]);
    } else if (type === "iTXt") {
      const zero = indexOfByte(data, 0, 0);
      if (zero < 0 || zero + 3 > data.length) continue;
      const compressed = data[zero + 1] === 1;
      const langEnd = indexOfByte(data, 0, zero + 3);
      const transEnd = langEnd < 0 ? -1 : indexOfByte(data, 0, langEnd + 1);
      if (transEnd < 0) continue;
      const body = data.subarray(transEnd + 1);
      const decoded = compressed ? inflate(body) : body;
      texts.push([latin1(data.subarray(0, zero)), decoded ? utf8(decoded) : "(could not decompress)", "PNG iTXt"]);
    } else if (type === "eXIf") {
      readExif(data, out, "PNG eXIf", options);
    } else if (type === "caBX") {
      readC2pa(data, out, "PNG caBX");
    } else if (type === "iCCP") {
      const zero = indexOfByte(data, 0, 0);
      const name = zero > 0 ? latin1(data.subarray(0, zero)) : "";
      const profile = zero >= 0 ? inflate(data.subarray(zero + 2)) : null;
      const desc = profile ? iccDescription(profile) : null;
      out.add(
        { kind: "color-profile", label: "ICC color profile", detail: `${desc ?? (name || "Embedded profile")}, ${formatSize(data.length)}`, source: "PNG iCCP" },
        !options.keepColorProfile,
      );
    } else if (PNG_COLOR.has(type)) {
      out.add({ kind: "color-profile", label: `Color information (${type})`, detail: formatSize(data.length), source: `PNG ${type}` }, !options.keepColorProfile);
    } else if (type === "tIME") {
      const year = readU16BE(data, 0);
      const pad = (n: number) => String(n).padStart(2, "0");
      out.add({ kind: "other", label: "Last modified", detail: `${year}-${pad(data[2])}-${pad(data[3])} ${pad(data[4])}:${pad(data[5])}:${pad(data[6])} UTC`, source: "PNG tIME" });
    } else if (!PNG_KEEP.has(type) && !isCriticalPng(type)) {
      out.add({ kind: "other", label: `Private chunk ${type}`, detail: formatSize(data.length), source: `PNG ${type}` });
    }
  }
  const software = texts.find(([k]) => k === "Software")?.[1] ?? "";
  for (const [keyword, text, source] of texts) readPngText(keyword, text, out, source, software);
}

const isCriticalPng = (type: string) => type.charCodeAt(0) >= 65 && type.charCodeAt(0) <= 90;

const pngChunk = (type: string, data: Uint8Array) => {
  const chunk = new Uint8Array(12 + data.length);
  writeU32BE(chunk, 0, data.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  writeU32BE(chunk, 8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
};

function cleanPng(bytes: Uint8Array, options: CleanOptions, orientation: number | null): Uint8Array {
  const chunks = parsePng(bytes);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  const orientationChunk = options.keepOrientation && orientation && orientation !== 1 ? pngChunk("eXIf", buildOrientationTiff(orientation)) : null;
  for (const c of chunks) {
    const keep = PNG_KEEP.has(c.type) || isCriticalPng(c.type) || (PNG_COLOR.has(c.type) && options.keepColorProfile);
    // eXIf must come before the first IDAT.
    if (orientationChunk && (c.type === "IDAT" || c.type === "fdAT" || c.type === "acTL") && !parts.includes(orientationChunk)) parts.push(orientationChunk);
    if (keep) parts.push(bytes.subarray(c.start, c.end));
  }
  return concat(parts);
}

/* ------------------------------------------------------------------ */
/* WebP                                                                */
/* ------------------------------------------------------------------ */

interface RiffChunk {
  fourcc: string;
  start: number;
  /** End including the pad byte. */
  end: number;
  data: Uint8Array;
}

function parseWebp(bytes: Uint8Array): RiffChunk[] {
  const chunks: RiffChunk[] = [];
  const riffEnd = Math.min(bytes.length, 8 + readU32LE(bytes, 4));
  let p = 12;
  while (p + 8 <= riffEnd) {
    const fourcc = ascii(bytes, p, 4);
    const size = readU32LE(bytes, p + 4);
    const dataEnd = p + 8 + size;
    if (dataEnd > bytes.length) throw new Error("The WebP file is cut off.");
    const end = Math.min(bytes.length, dataEnd + (size % 2));
    chunks.push({ fourcc, start: p, end, data: bytes.subarray(p + 8, dataEnd) });
    p = end;
  }
  if (!chunks.length) throw new Error("The WebP structure is damaged.");
  return chunks;
}

const WEBP_KEEP = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF"]);
export const VP8X_FLAGS = { icc: 0x20, alpha: 0x10, exif: 0x08, xmp: 0x04, animation: 0x02 } as const;

const stripExifPrefix = (data: Uint8Array) => (startsWith(data, 0, EXIF_ID) ? data.subarray(EXIF_ID.length) : data);

function inspectWebp(bytes: Uint8Array, options: CleanOptions, out: Findings) {
  for (const c of parseWebp(bytes)) {
    if (c.fourcc === "EXIF") readExif(stripExifPrefix(c.data), out, "WebP EXIF", options);
    else if (c.fourcc === "XMP ") readXmp(utf8(c.data), out, "WebP XMP");
    else if (c.fourcc === "ICCP") addIcc(c.data, out, "WebP ICCP", options);
    else if (c.fourcc === "C2PA") readC2pa(c.data, out, "WebP C2PA");
    else if (!WEBP_KEEP.has(c.fourcc)) out.add({ kind: "other", label: `Chunk ${c.fourcc.trim()}`, detail: formatSize(c.data.length), source: "WebP" });
  }
}

const riffChunk = (fourcc: string, data: Uint8Array) => {
  const chunk = new Uint8Array(8 + data.length + (data.length % 2));
  for (let i = 0; i < 4; i++) chunk[i] = fourcc.charCodeAt(i);
  writeU32LE(chunk, 4, data.length);
  chunk.set(data, 8);
  return chunk;
};

function cleanWebp(bytes: Uint8Array, options: CleanOptions, orientation: number | null): Uint8Array {
  const chunks = parseWebp(bytes);
  const hasVp8x = chunks[0].fourcc === "VP8X";
  const orientationChunk =
    hasVp8x && options.keepOrientation && orientation && orientation !== 1 ? riffChunk("EXIF", buildOrientationTiff(orientation)) : null;
  const parts: Uint8Array[] = [new Uint8Array(12)];
  let keptIcc = false;
  for (const c of chunks) {
    const keep = WEBP_KEEP.has(c.fourcc) || (c.fourcc === "ICCP" && options.keepColorProfile);
    if (!keep) continue;
    if (c.fourcc === "ICCP") keptIcc = true;
    parts.push(bytes.subarray(c.start, c.end));
  }
  if (orientationChunk) parts.push(orientationChunk);
  const out = concat(parts);
  out.set(bytes.subarray(0, 12));
  writeU32LE(out, 4, out.length - 8);
  if (hasVp8x) {
    // The VP8X chunk is the first one, so its flags byte sits at offset 20.
    let flags = out[20] & ~(VP8X_FLAGS.exif | VP8X_FLAGS.xmp);
    if (!keptIcc) flags &= ~VP8X_FLAGS.icc;
    if (orientationChunk) flags |= VP8X_FLAGS.exif;
    out[20] = flags;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

const toSupported = (bytes: Uint8Array): MetadataImageFormat => {
  const format = detectImageFormat(bytes);
  if (format === "jpeg" || format === "png" || format === "webp") return format;
  throw new Error("Only JPEG, PNG and WebP images are supported.");
};

/** Lists the metadata in an image without changing it. */
export function inspectImage(bytes: Uint8Array, options: CleanOptions = DEFAULT_CLEAN_OPTIONS): InspectResult {
  const format = toSupported(bytes);
  const out = new Findings();
  if (format === "jpeg") inspectJpeg(bytes, options, out);
  else if (format === "png") inspectPng(bytes, options, out);
  else inspectWebp(bytes, options, out);
  return {
    format,
    size: bytes.length,
    findings: out.items,
    orientation: out.orientation,
    hasAi: out.items.some((f) => f.kind === "ai"),
    hasLocation: out.items.some((f) => f.kind === "location"),
  };
}

/** Removes metadata without touching the compressed image data, then inspects the result. */
export function cleanImage(bytes: Uint8Array, options: CleanOptions = DEFAULT_CLEAN_OPTIONS): CleanResult {
  const before = inspectImage(bytes, options);
  const clean = before.format === "jpeg" ? cleanJpeg : before.format === "png" ? cleanPng : cleanWebp;
  const output = clean(bytes, options, before.orientation);
  if (detectImageFormat(output) !== before.format) throw new Error("Cleaning produced an invalid file. The original is unchanged.");
  const after = inspectImage(output, options);
  return {
    bytes: output,
    before,
    after,
    removedCount: Math.max(0, before.findings.length - after.findings.length),
    savedBytes: bytes.length - output.length,
  };
}

/** Builds "<name>-clean.<ext>", keeping the original extension when it matches the format. */
export function cleanFileName(name: string, format: MetadataImageFormat | "avif"): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name) || "image";
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const valid: string[] = format === "jpeg" ? ["jpg", "jpeg", "jfif"] : [format];
  return `${base}-clean.${valid.includes(ext) ? ext : format === "jpeg" ? "jpg" : format}`;
}

/**
 * Byte scan for metadata markers in a file this module cannot parse (AVIF).
 * Returns the names of the markers it finds.
 */
export function scanForMetadataMarkers(bytes: Uint8Array): string[] {
  const text = latin1(bytes);
  const found: string[] = [];
  if (/Exif\0\0|\binfe[\s\S]{4,12}Exif/.test(text)) found.push("EXIF");
  if (/<x:xmpmeta|http:\/\/ns\.adobe\.com\/xap/.test(text)) found.push("XMP");
  if (/c2pa|jumb/.test(text)) found.push("C2PA");
  return found;
}

/** Findings that still matter after cleaning: everything except the JFIF header, color data and orientation. */
export function remainingMetadata(result: InspectResult): MetadataFinding[] {
  return result.findings.filter((f) => f.kind !== "color-profile" && f.label !== "JFIF header" && f.label !== "Orientation");
}
