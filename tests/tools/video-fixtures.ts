export type Part = Uint8Array | number[];

export const latin = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
export const utf8 = (text: string) => new TextEncoder().encode(text);
export const cat = (...parts: Part[]) => {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
};
export const u16 = (n: number) => [(n >>> 8) & 255, n & 255];
export const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
export const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));

/* ISO BMFF -------------------------------------------------------------- */

/** A box. Write "©" for the 0xA9 byte, for example "©xyz". */
export const box = (type: string, ...payload: Part[]) => {
  const body = cat(...payload);
  return cat(u32(8 + body.length), latin(type), body);
};
export const fullBox = (type: string, version: number, ...payload: Part[]) => box(type, [version, 0, 0, 0], ...payload);
/** A box whose type is a 32-bit number, as in QuickTime "ilst" items that point to a key. */
export const indexBox = (index: number, ...payload: Part[]) => {
  const body = cat(...payload);
  return cat(u32(8 + body.length), u32(index), body);
};
export const uuidBox = (uuid: string, ...payload: Part[]) => box("uuid", hexBytes(uuid), ...payload);
export const qtText = (type: string, text: string) => box(type, u16(utf8(text).length), u16(0x15c7), utf8(text));
export const dataBox = (text: string) => box("data", u32(1), u32(0), utf8(text));

export const UUID_XMP = "be7acfcb97a942e89c71999491e3afac";
export const UUID_C2PA = "d8fec3d61b0e483c92975828877ec481";

/** 2026-05-01T10:22:03Z in seconds since 1904-01-01. */
export const MAC_2026 = Date.UTC(2026, 4, 1, 10, 22, 3) / 1000 + 2082844800;

export const mvhd = (created: number) => fullBox("mvhd", 0, u32(created), u32(created), u32(1000), u32(0), new Uint8Array(80));
export const tkhd = (created: number, trackId: number) => fullBox("tkhd", 0, u32(created), u32(created), u32(trackId), new Uint8Array(68));
export const mdhd = (created: number) => fullBox("mdhd", 0, u32(created), u32(created), u32(1000), u32(0), [0x55, 0xc4, 0, 0]);
export const hdlr = (handler: string) => fullBox("hdlr", 0, u32(0), latin(handler), new Uint8Array(12), [0]);

export interface Sample {
  offset: number;
  size: number;
}

/** A track with one sample in each chunk. */
export const trak = (handler: string, format: string, trackId: number, samples: Sample[], ...extra: Part[]) =>
  box(
    "trak",
    tkhd(MAC_2026, trackId),
    box(
      "mdia",
      mdhd(MAC_2026),
      hdlr(handler),
      box(
        "minf",
        box(
          "stbl",
          fullBox("stsd", 0, u32(1), box(format, new Uint8Array(8))),
          fullBox("stsc", 0, u32(1), u32(1), u32(1), u32(1)),
          fullBox("stsz", 0, u32(0), u32(samples.length), ...samples.map((s) => u32(s.size))),
          fullBox("stco", 0, u32(samples.length), ...samples.map((s) => u32(s.offset))),
        ),
      ),
    ),
    ...extra,
  );

export interface Mp4Options {
  brand?: string;
  /** Leave out the ftyp box, as old QuickTime files do. */
  noFtyp?: boolean;
  withGpmd?: boolean;
  withSubtitles?: boolean;
  moovExtra?: Part[];
  /** Boxes after moov at the top level. */
  topExtra?: Part[];
}

export function sampleMp4(options: Mp4Options = {}) {
  const ftyp = options.noFtyp ? new Uint8Array(0) : box("ftyp", latin(options.brand ?? "isom"), u32(512), latin("isomiso2mp41"));
  const video = latin("VIDEODATAVIDEODATA");
  const gps = latin("GPS5:52.5200,13.4050");
  const mdat = box("mdat", video, gps);
  const dataStart = ftyp.length + 8;
  const tracks = [trak("vide", "avc1", 1, [{ offset: dataStart, size: video.length }])];
  if (options.withGpmd) tracks.push(trak("meta", "gpmd", 2, [{ offset: dataStart + video.length, size: gps.length }]));
  if (options.withSubtitles) tracks.push(trak("sbtl", "tx3g", 3, []));
  const moov = box("moov", mvhd(MAC_2026), ...tracks, ...(options.moovExtra ?? []));
  return {
    bytes: cat(ftyp, mdat, moov, ...(options.topExtra ?? [])),
    video: { offset: dataStart, length: video.length },
    gps: { offset: dataStart + video.length, length: gps.length },
    moovStart: ftyp.length + mdat.length,
  };
}

/* EBML ------------------------------------------------------------------ */

export const ID = {
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

const idBytes = (id: number) => {
  const out: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 255);
  return out;
};
/** Sizes up to 126 use 1 byte. Larger sizes use the 8-byte form. */
const sizeBytes = (n: number) => (n < 127 ? [0x80 | n] : [0x01, 0, 0, 0, ...u32(n)]);

export const el = (id: number, ...payload: Part[]) => {
  const body = cat(...payload);
  return cat(idBytes(id), sizeBytes(body.length), body);
};
export const elText = (id: number, text: string) => el(id, utf8(text));
/** An element whose size is "unknown", as in live recordings. */
export const elUnknown = (id: number, ...payload: Part[]) => cat(idBytes(id), [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], ...payload);
/** 2026-05-01T10:22:03Z as nanoseconds since 2001-01-01, as an 8-byte signed integer. */
export const DATE_2026_NS = (() => {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigInt64(0, BigInt(Date.UTC(2026, 4, 1, 10, 22, 3) - Date.UTC(2001, 0, 1)) * BigInt(1_000_000));
  return new Uint8Array(view.buffer);
})();

export const simpleTag = (name: string, value: string) => el(ID.SimpleTag, elText(ID.TagName, name), elText(ID.TagString, value));

export function sampleMkv(children: Part[], docType = "matroska") {
  return { bytes: cat(el(ID.EBML, elText(ID.DocType, docType)), el(ID.Segment, ...children)) };
}

/** The offset of the first match of `seq` in `bytes`, or -1. */
export const indexOfSeq = (bytes: Uint8Array, seq: number[]) => {
  for (let i = 0; i + seq.length <= bytes.length; i++) if (seq.every((b, j) => bytes[i + j] === b)) return i;
  return -1;
};
