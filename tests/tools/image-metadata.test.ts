import { zlibSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import {
  Findings,
  VP8X_FLAGS,
  buildOrientationTiff,
  cleanFileName,
  cleanImage,
  crc32,
  detectImageFormat,
  findAiHint,
  inspectImage,
  readC2pa,
  readXmp,
  remainingMetadata,
  scanForMetadataMarkers,
  xmpProperty,
  type CleanOptions,
} from "@/utils/image-metadata";
import { OUTPUT_FORMATS, encodeCanvas, needsWebpFallback, outputMime, usesQuality } from "@/utils/image-reencode";

/* ---------------- byte builders ---------------- */

const enc = (text: string) => new TextEncoder().encode(text);
const latin = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const cat = (...parts: (Uint8Array | number[])[]) => {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((s, a) => s + a.length, 0));
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
};
const u16be = (v: number) => [(v >> 8) & 0xff, v & 0xff];
const u32be = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
const u32le = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

const contains = (hay: Uint8Array, needle: Uint8Array) => {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
};

/** Big-endian TIFF with IFD0 (Make, Software, Orientation, GPS pointer) and a GPS IFD. */
function buildExifTiff(orientation = 6) {
  // Layout: header(8) | IFD0 at 8: 4 entries (2 + 48 + 4 = 54) -> 62 | strings | GPS IFD | rationals
  const make = latin("Canon\0"); // 6 bytes
  const software = latin("Midjourney v6\0"); // 14 bytes
  const ifd0Size = 2 + 4 * 12 + 4;
  const makeOff = 8 + ifd0Size; // 62
  const softOff = makeOff + make.length; // 68
  const gpsOff = softOff + software.length; // 82
  const gpsSize = 2 + 4 * 12 + 4; // 54
  const latOff = gpsOff + gpsSize;
  const lonOff = latOff + 24;
  const entry = (tag: number, type: number, count: number, value: number[]) => [...u16be(tag), ...u16be(type), ...u32be(count), ...value];
  const ifd0 = [
    ...u16be(4),
    ...entry(0x010f, 2, make.length, u32be(makeOff)),
    ...entry(0x0112, 3, 1, [...u16be(orientation), 0, 0]),
    ...entry(0x0131, 2, software.length, u32be(softOff)),
    ...entry(0x8825, 4, 1, u32be(gpsOff)),
    ...u32be(0),
  ];
  const gps = [
    ...u16be(4),
    ...entry(1, 2, 2, [0x4e, 0, 0, 0]), // "N"
    ...entry(2, 5, 3, u32be(latOff)),
    ...entry(3, 2, 2, [0x57, 0, 0, 0]), // "W"
    ...entry(4, 5, 3, u32be(lonOff)),
    ...u32be(0),
  ];
  const rational = (n: number, d: number) => [...u32be(n), ...u32be(d)];
  const lat = [...rational(40, 1), ...rational(30, 1), ...rational(0, 1)];
  const lon = [...rational(74, 1), ...rational(0, 1), ...rational(36, 1)];
  return cat([0x4d, 0x4d, 0x00, 0x2a, ...u32be(8)], ifd0, make, software, gps, lat, lon);
}

const segment = (marker: number, payload: Uint8Array) => cat([0xff, marker, ...u16be(payload.length + 2)], payload);

const XMP = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
 Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
 photoshop:Credit="Made with Google AI"/></rdf:RDF></x:xmpmeta>`;

const ICC_STUB = cat(new Uint8Array(128), u32be(0));

// Image data: DQT, SOF0, DHT, SOS + entropy bytes + EOI.
const JPEG_IMAGE_SEGMENTS = cat(
  segment(0xdb, Uint8Array.from({ length: 65 }, (_, i) => (i === 0 ? 0 : 1))),
  segment(0xc0, Uint8Array.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0])),
  segment(0xc4, Uint8Array.from([0, ...new Array(16).fill(0)])),
);
const JPEG_SCAN = cat(segment(0xda, Uint8Array.from([1, 1, 0, 0, 0x3f, 0])), [0x12, 0x34, 0xff, 0x00, 0x56], [0xff, 0xd9]);

function buildJpeg(orientation = 6) {
  return cat(
    [0xff, 0xd8],
    segment(0xe0, cat(latin("JFIF\0"), [1, 1, 0, 0, 1, 0, 1, 0, 0])),
    segment(0xe1, cat(latin("Exif\0\0"), buildExifTiff(orientation))),
    segment(0xe1, cat(latin("http://ns.adobe.com/xap/1.0/\0"), enc(XMP))),
    segment(0xeb, cat(latin("JP"), [0, 1, 0, 0, 0, 1], u32be(40), latin("jumb"), u32be(32), latin("jumdc2pa"), new Array(20).fill(0))),
    segment(0xfe, enc("Shot on my phone")),
    segment(0xe2, cat(latin("ICC_PROFILE\0"), [1, 1], ICC_STUB)),
    JPEG_IMAGE_SEGMENTS,
    JPEG_SCAN,
  );
}

const pngChunk = (type: string, data: Uint8Array) => {
  const body = cat(latin(type), data);
  return cat(u32be(data.length), body, u32be(crc32(body)));
};

const IHDR = pngChunk("IHDR", Uint8Array.from([...u32be(1), ...u32be(1), 8, 6, 0, 0, 0]));
const IDAT = pngChunk("IDAT", zlibSync(Uint8Array.from([0, 255, 0, 0, 255])));
const IEND = pngChunk("IEND", new Uint8Array());
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function buildPng() {
  const params = "a castle at dusk\nNegative prompt: blurry\nSteps: 20, Sampler: Euler a, CFG scale: 7";
  return cat(
    PNG_SIG,
    IHDR,
    pngChunk("iCCP", cat(latin("sRGB IEC61966-2.1\0"), [0], zlibSync(ICC_STUB))),
    pngChunk("tEXt", cat(latin("parameters\0"), latin(params))),
    pngChunk("iTXt", cat(latin("XML:com.adobe.xmp\0"), [1, 0], latin("\0\0"), zlibSync(enc(XMP)))),
    pngChunk("zTXt", cat(latin("Comment\0"), [0], zlibSync(latin("hello zTXt")))),
    pngChunk("tIME", Uint8Array.from([...u16be(2026), 10, 27, 12, 0, 0])),
    IDAT,
    IEND,
  );
}

const riff = (fourcc: string, data: Uint8Array) => cat(latin(fourcc), u32le(data.length), data, data.length % 2 ? [0] : []);

const VP8L_DATA = Uint8Array.from([0x2f, 0, 0, 0, 0, 1, 2, 3, 4]); // odd length -> padded
function buildWebp() {
  const vp8x = Uint8Array.from([VP8X_FLAGS.icc | VP8X_FLAGS.exif | VP8X_FLAGS.xmp | VP8X_FLAGS.alpha, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const body = cat(
    latin("WEBP"),
    riff("VP8X", vp8x),
    riff("ICCP", ICC_STUB),
    riff("VP8L", VP8L_DATA),
    riff("EXIF", buildExifTiff(1)),
    riff("XMP ", enc(XMP)),
  );
  return cat(latin("RIFF"), u32le(body.length), body);
}

const keepAll: CleanOptions = { keepColorProfile: true, keepOrientation: false };
const labels = (r: { findings: { label: string }[] }) => r.findings.map((f) => f.label);

/* ---------------- tests ---------------- */

describe("detectImageFormat", () => {
  it("identifies supported and unsupported files", () => {
    expect(detectImageFormat(buildJpeg())).toBe("jpeg");
    expect(detectImageFormat(buildPng())).toBe("png");
    expect(detectImageFormat(buildWebp())).toBe("webp");
    expect(detectImageFormat(latin("GIF89a......"))).toBe("gif");
    expect(detectImageFormat(cat(u32be(24), latin("ftypheic"), new Array(8).fill(0)))).toBe("heic");
    expect(detectImageFormat(cat(u32be(24), latin("ftypavif"), new Array(8).fill(0)))).toBe("avif");
    expect(() => inspectImage(latin("GIF89a......"))).toThrow(/Only JPEG, PNG and WebP/);
  });
});

describe("JPEG", () => {
  it("lists EXIF, GPS, XMP AI labels, C2PA, comment and ICC", () => {
    const result = inspectImage(buildJpeg(), keepAll);
    expect(result.format).toBe("jpeg");
    expect(result.orientation).toBe(6);
    expect(result.hasAi).toBe(true);
    expect(result.hasLocation).toBe(true);
    const gps = result.findings.find((f) => f.label === "GPS position")!;
    expect(gps.kind).toBe("location");
    expect(gps.detail).toBe("40.500000, -74.010000");
    expect(result.findings.find((f) => f.label === "Camera make")).toMatchObject({ kind: "camera", detail: "Canon" });
    expect(result.findings.find((f) => f.label.startsWith("Software"))).toMatchObject({ kind: "ai" });
    expect(result.findings.find((f) => f.label === "Digital source type")).toMatchObject({
      kind: "ai",
      detail: "Created by generative AI (trainedAlgorithmicMedia)",
    });
    expect(result.findings.find((f) => f.label === "Content Credentials (C2PA)")).toMatchObject({ kind: "provenance" });
    expect(result.findings.find((f) => f.label === "Comment")).toMatchObject({ kind: "text", detail: "Shot on my phone" });
    expect(result.findings.find((f) => f.label === "ICC color profile")).toMatchObject({ kind: "color-profile", removable: false });
    expect(result.findings.find((f) => f.label === "XMP packet")?.raw).toContain("trainedAlgorithmicMedia");
    expect(result.findings.find((f) => f.label === "JFIF header")?.removable).toBe(false);
  });

  it("removes metadata, keeps ICC on request and keeps image data byte for byte", () => {
    const input = buildJpeg();
    const result = cleanImage(input, keepAll);
    const out = result.bytes;
    expect(Array.from(out.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
    expect(contains(out, latin("Exif\0\0"))).toBe(false);
    expect(contains(out, latin("http://ns.adobe.com/xap"))).toBe(false);
    expect(contains(out, latin("jumb"))).toBe(false);
    expect(contains(out, enc("Shot on my phone"))).toBe(false);
    expect(contains(out, latin("ICC_PROFILE\0"))).toBe(true);
    expect(contains(out, cat(JPEG_IMAGE_SEGMENTS, JPEG_SCAN))).toBe(true);
    expect(out.subarray(out.length - JPEG_SCAN.length)).toEqual(JPEG_SCAN);
    expect(labels(result.after)).toEqual(["JFIF header", "ICC color profile"]);
    expect(result.after.hasAi).toBe(false);
    expect(result.removedCount).toBe(result.before.findings.length - 2);
    expect(result.savedBytes).toBe(input.length - out.length);
    expect(remainingMetadata(result.after)).toEqual([]);

    // A second clean changes nothing.
    expect(cleanImage(out, keepAll).bytes).toEqual(out);
  });

  it("drops the ICC profile when asked", () => {
    const out = cleanImage(buildJpeg(), { keepColorProfile: false, keepOrientation: false }).bytes;
    expect(contains(out, latin("ICC_PROFILE"))).toBe(false);
  });

  it("writes back only the orientation tag when Keep orientation is on", () => {
    const options = { keepColorProfile: true, keepOrientation: true };
    const result = cleanImage(buildJpeg(6), options);
    expect(result.after.orientation).toBe(6);
    expect(labels(result.after)).toEqual(["JFIF header", "Orientation", "ICC color profile"]);
    expect(contains(result.bytes, cat(latin("Exif\0\0"), buildOrientationTiff(6)))).toBe(true);
    expect(cleanImage(result.bytes, options).bytes).toEqual(result.bytes);
  });
});

describe("PNG", () => {
  it("decodes text chunks, flags the Stable Diffusion prompt and reads compressed XMP", () => {
    const result = inspectImage(buildPng(), keepAll);
    const params = result.findings.find((f) => f.label === "Stable Diffusion parameters")!;
    expect(params.kind).toBe("ai");
    expect(params.raw).toContain("Negative prompt: blurry");
    expect(result.findings.find((f) => f.label === "Digital source type")?.kind).toBe("ai");
    expect(result.findings.find((f) => f.label === "Comment")?.detail).toBe("hello zTXt");
    expect(result.findings.find((f) => f.label === "ICC color profile")?.removable).toBe(false);
    expect(result.findings.find((f) => f.label === "Last modified")?.detail).toBe("2026-10-27 12:00:00 UTC");
  });

  it("removes text chunks and keeps critical and color chunks with valid CRCs", () => {
    const result = cleanImage(buildPng(), keepAll);
    expect(result.bytes).toEqual(cat(PNG_SIG, IHDR, pngChunk("iCCP", cat(latin("sRGB IEC61966-2.1\0"), [0], zlibSync(ICC_STUB))), IDAT, IEND));
    expect(labels(result.after)).toEqual(["ICC color profile"]);
    expect(cleanImage(result.bytes, keepAll).bytes).toEqual(result.bytes);
    expect(cleanImage(buildPng(), { keepColorProfile: false, keepOrientation: false }).bytes).toEqual(cat(PNG_SIG, IHDR, IDAT, IEND));
  });
});

describe("WebP", () => {
  it("lists EXIF, XMP and ICC chunks", () => {
    const result = inspectImage(buildWebp(), keepAll);
    expect(result.hasLocation).toBe(true);
    expect(result.hasAi).toBe(true);
    expect(labels(result)).toContain("ICC color profile");
  });

  it("rebuilds the RIFF container, fixes the size and clears the flags", () => {
    const result = cleanImage(buildWebp(), keepAll);
    const out = result.bytes;
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(String.fromCharCode(...out.subarray(0, 4))).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(out.length - 8);
    expect(out[20] & VP8X_FLAGS.exif).toBe(0);
    expect(out[20] & VP8X_FLAGS.xmp).toBe(0);
    expect(out[20] & VP8X_FLAGS.icc).toBe(VP8X_FLAGS.icc);
    expect(out[20] & VP8X_FLAGS.alpha).toBe(VP8X_FLAGS.alpha);
    expect(contains(out, riff("VP8L", VP8L_DATA))).toBe(true);
    expect(contains(out, latin("XMP "))).toBe(false);
    expect(labels(result.after)).toEqual(["ICC color profile"]);
    expect(cleanImage(out, keepAll).bytes).toEqual(out);

    const noIcc = cleanImage(buildWebp(), { keepColorProfile: false, keepOrientation: false }).bytes;
    expect(noIcc[20] & VP8X_FLAGS.icc).toBe(0);
    expect(contains(noIcc, latin("ICCP"))).toBe(false);
  });
});

describe("helpers", () => {
  it("reads XMP properties in attribute and element form", () => {
    expect(xmpProperty('<a photoshop:Credit="X &amp; Y"/>', "photoshop:Credit")).toBe("X & Y");
    expect(xmpProperty("<dc:title><rdf:Alt><rdf:li xml:lang=\"x-default\">Hello</rdf:li></rdf:Alt></dc:title>", "dc:title")).toBe("Hello");
  });

  it("recognizes AI tool names", () => {
    expect(findAiHint("Adobe Firefly 3")).toBe("Adobe Firefly");
    expect(findAiHint("DALL·E 3")).toBe("DALL·E");
    expect(findAiHint("Adobe Photoshop 25.0")).toBeNull();
  });

  it("builds output names", () => {
    expect(cleanFileName("photo.JPG", "jpeg")).toBe("photo-clean.jpg");
    expect(cleanFileName("photo.jpeg", "jpeg")).toBe("photo-clean.jpeg");
    expect(cleanFileName("art.png", "jpeg")).toBe("art-clean.jpg");
    expect(cleanFileName("art.png", "avif")).toBe("art-clean.avif");
    expect(cleanFileName("noext", "webp")).toBe("noext-clean.webp");
  });

  it("scans unparsed files for metadata markers", () => {
    expect(scanForMetadataMarkers(latin("....ftypavif....mdat"))).toEqual([]);
    expect(scanForMetadataMarkers(latin("xx<x:xmpmeta>Exif\0\0"))).toEqual(["EXIF", "XMP"]);
  });
});

describe("re-encode options", () => {
  it("lists four output formats with quality only for lossy ones", () => {
    expect(OUTPUT_FORMATS.map((f) => f.title)).toEqual(["JPG", "PNG", "WebP", "AVIF"]);
    expect(OUTPUT_FORMATS.filter((f) => usesQuality(f.id)).map((f) => f.id)).toEqual(["jpeg", "webp", "avif"]);
    expect(outputMime("avif")).toBe("image/avif");
  });

  it("decides when WebP needs the WASM encoder", () => {
    expect(needsWebpFallback(new Blob(["x"], { type: "image/webp" }))).toBe(false);
    expect(needsWebpFallback(new Blob(["x"], { type: "image/png" }))).toBe(true);
    expect(needsWebpFallback(null)).toBe(true);
  });

  it("falls back to WASM when the canvas returns PNG for WebP, and always for AVIF", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 1;
    vi.spyOn(canvas, "toBlob").mockImplementation((cb) => cb(new Blob(["png"], { type: "image/png" })));
    vi.spyOn(canvas, "getContext").mockReturnValue({
      getImageData: () => ({ data: new Uint8ClampedArray(8), width: 2, height: 1 }),
    } as unknown as CanvasRenderingContext2D);
    const wasm = vi.fn(async () => Uint8Array.from([1, 2, 3]));
    expect(await encodeCanvas(canvas, "webp", 80, wasm)).toEqual(Uint8Array.from([1, 2, 3]));
    expect(wasm).toHaveBeenCalledWith("webp", expect.objectContaining({ width: 2, height: 1 }), 80);
    await encodeCanvas(canvas, "avif", 150, wasm);
    expect(wasm).toHaveBeenLastCalledWith("avif", expect.anything(), 100);
    expect(canvas.toBlob).toHaveBeenCalledTimes(1);
  });

  it("uses the canvas WebP output when the platform writes WebP", async () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "toBlob").mockImplementation((cb) => cb(new Blob(["webp"], { type: "image/webp" })));
    const wasm = vi.fn();
    expect(Array.from(await encodeCanvas(canvas, "webp", 80, wasm))).toEqual(Array.from(enc("webp")));
    expect(wasm).not.toHaveBeenCalled();
  });
});

describe("shared helpers for video metadata", () => {
  it("names AI video tools", () => {
    expect(findAiHint("Runway Gen-3 Alpha")).toBe("Runway");
    expect(findAiHint("Google Veo 3")).toBe("Google Veo");
    expect(findAiHint("Sora")).toBe("OpenAI Sora");
    expect(findAiHint("OpenAI Sora")).toBe("OpenAI");
    expect(findAiHint("Kling 2.1")).toBe("Kling");
    expect(findAiHint("Pika 2.0")).toBe("Pika");
    expect(findAiHint("Luma Dream Machine")).toBe("Luma Dream Machine");
    expect(findAiHint("Hailuo 02")).toBe("Hailuo");
  });

  it("does not read common words as AI tools", () => {
    expect(findAiHint("veo el mar desde aquí")).toBeNull();
    expect(findAiHint("the runway was wet")).toBeNull();
  });

  it("exports the findings collector and the XMP and C2PA readers", () => {
    const out = new Findings();
    readXmp('<x:xmpmeta><rdf:Description Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></x:xmpmeta>', out, "XMP box");
    readC2pa(Uint8Array.from("c2pa claim_generator: OpenAI Sora", (c) => c.charCodeAt(0)), out, "C2PA box");
    expect(out.items.some((f) => f.kind === "ai" && f.source === "XMP box")).toBe(true);
    expect(out.items.map((f) => f.label)).toContain("Content Credentials (C2PA)");
  });
});
