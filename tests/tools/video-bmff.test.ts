import { describe, expect, it } from "vitest";
import { applyPatches, bytesSource } from "@/utils/byte-source";
import { DEFAULT_VIDEO_OPTIONS } from "@/utils/video-format";
import { blankBox, children, headerAt, scanBmff } from "@/utils/video-bmff";
import { UUID_C2PA, UUID_XMP, box, cat, dataBox, fullBox, hdlr, indexBox, latin, qtText, sampleMp4, u32, utf8, uuidBox } from "./video-fixtures";

const scan = (bytes: Uint8Array, options = DEFAULT_VIDEO_OPTIONS) => scanBmff(bytesSource(bytes), options);
const clean = async (bytes: Uint8Array, options = DEFAULT_VIDEO_OPTIONS) => applyPatches(bytes, (await scan(bytes, options)).patches);
const labels = (findings: { label: string }[]) => findings.map((f) => f.label);

describe("ISO BMFF boxes", () => {
  it("reads 32-bit, 64-bit, to-the-end, and uuid headers", () => {
    expect(headerAt(cat(u32(16), latin("free"), new Uint8Array(8)), 100, 200)).toMatchObject({ type: "free", start: 100, size: 16, headerSize: 8, large: false });
    expect(headerAt(cat(u32(1), latin("mdat"), u32(0), u32(40)), 0, 100)).toMatchObject({ type: "mdat", size: 40, headerSize: 16, large: true });
    expect(headerAt(cat(u32(0), latin("mdat")), 10, 90)).toMatchObject({ size: 80 });
    expect(headerAt(cat(u32(40), latin("uuid"), new Uint8Array(16).fill(0xab)), 0, 100)).toMatchObject({ headerSize: 24, uuid: "ab".repeat(16) });
  });

  it("rejects a box that does not fit its parent", () => {
    expect(() => headerAt(cat(u32(500), latin("moov")), 0, 100)).toThrow(/byte 0 has an invalid size/);
    expect(() => headerAt(cat(u32(4), latin("moov")), 0, 100)).toThrow(/invalid size/);
  });

  it("walks child boxes and stops at a QuickTime zero terminator", () => {
    const buf = cat(box("aaaa", [1]), box("bbbb"), u32(0));
    expect([...children(buf, 1000, 0, buf.length)].map((b) => [b.type, b.start])).toEqual([["aaaa", 1000], ["bbbb", 1009]]);
  });

  it("turns a box into a zero-filled free box of the same size", () => {
    const patch = blankBox({ type: "udta", start: 50, headerSize: 8, size: 12, large: false });
    expect(patch.offset).toBe(50);
    expect(Array.from(patch.bytes)).toEqual([0, 0, 0, 12, 0x66, 0x72, 0x65, 0x65, 0, 0, 0, 0]);
    const large = blankBox({ type: "uuid", start: 0, headerSize: 32, size: 40, large: true });
    expect(Array.from(large.bytes.subarray(0, 16))).toEqual([0, 0, 0, 1, 0x66, 0x72, 0x65, 0x65, 0, 0, 0, 0, 0, 0, 0, 40]);
  });
});

describe("scanBmff dates and format", () => {
  it("reports the recording date once and clears it in every header", async () => {
    const { bytes } = sampleMp4();
    const result = await scan(bytes);
    expect(result.format).toBe("mp4");
    const date = result.findings.find((f) => f.label === "Recording date");
    expect(date).toMatchObject({ kind: "camera", detail: "2026-05-01T10:22:03Z, in 3 headers", removable: true });
    const after = await scan(await clean(bytes));
    expect(labels(after.findings)).not.toContain("Recording date");
  });

  it("keeps the dates when Clear dates is off", async () => {
    const { bytes } = sampleMp4();
    const options = { ...DEFAULT_VIDEO_OPTIONS, clearDates: false };
    const result = await scan(bytes, options);
    expect(result.findings.find((f) => f.label === "Recording date")?.removable).toBe(false);
    expect(result.patches).toEqual([]);
  });

  it("reads the format from the brand, and old QuickTime files without ftyp", async () => {
    expect((await scan(sampleMp4({ brand: "qt  " }).bytes)).format).toBe("mov");
    expect((await scan(sampleMp4({ brand: "M4V " }).bytes)).format).toBe("m4v");
    expect((await scan(sampleMp4({ brand: "3gp5" }).bytes)).format).toBe("3gp");
    expect((await scan(sampleMp4({ noFtyp: true }).bytes)).format).toBe("mov");
  });

  it("rejects HEIF images and files without a movie header", async () => {
    await expect(scan(sampleMp4({ brand: "heic" }).bytes)).rejects.toThrow(/HEIF or AVIF image/);
    await expect(scan(box("ftyp", latin("isom"), u32(0)))).rejects.toThrow(/no movie header/);
  });

  it("keeps the audio and video bytes unchanged", async () => {
    const { bytes, video } = sampleMp4();
    const cleaned = await clean(bytes);
    expect(cleaned.length).toBe(bytes.length);
    expect(Array.from(cleaned.subarray(video.offset, video.offset + video.length))).toEqual(Array.from(bytes.subarray(video.offset, video.offset + video.length)));
  });
});

describe("scanBmff user data and QuickTime metadata", () => {
  it("reads QuickTime text atoms and removes the udta box", async () => {
    const udta = box("udta", qtText("\u00a9xyz", "+52.5200+013.4050/"), qtText("\u00a9mak", "Apple"), qtText("\u00a9too", "Lavf60.16.100"));
    const { bytes, moovStart } = sampleMp4({ moovExtra: [udta] });
    const result = await scan(bytes);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "location", label: "GPS position", detail: "52.52, 13.405", removable: true }),
        expect.objectContaining({ kind: "camera", label: "Camera make", detail: "Apple" }),
        expect.objectContaining({ kind: "other", label: "Encoder", detail: "Lavf60.16.100" }),
      ]),
    );
    const cleaned = await clean(bytes);
    const after = await scan(cleaned);
    expect(after.findings.filter((f) => f.removable)).toEqual([]);
    expect(new TextDecoder().decode(cleaned.subarray(moovStart, cleaned.length))).toContain("free");
  });

  it("reads Apple mdta keys and values", async () => {
    const keys = fullBox("keys", 0, u32(2), box("mdta", utf8("com.apple.quicktime.location.ISO6709")), box("mdta", utf8("com.apple.quicktime.model")));
    const ilst = box("ilst", indexBox(1, dataBox("+37.3349-122.0090+010.000/")), indexBox(2, dataBox("iPhone 16 Pro")));
    const meta = box("meta", hdlr("mdta"), keys, ilst);
    const result = await scan(sampleMp4({ moovExtra: [meta] }).bytes);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "location", label: "GPS position", detail: "37.3349, -122.009" }),
        expect.objectContaining({ kind: "camera", label: "Camera model", detail: "iPhone 16 Pro" }),
      ]),
    );
  });

  it("reads iTunes-style tags in an MP4 meta full box and marks AI tools", async () => {
    const udta = box("udta", fullBox("meta", 0, hdlr("mdir"), box("ilst", box("\u00a9too", dataBox("Sora")))));
    const result = await scan(sampleMp4({ moovExtra: [udta] }).bytes);
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "ai", label: "Encoder (mentions OpenAI Sora)" })]));
  });

  it("reads a 3GPP location box", async () => {
    // Version and flags, language, name "Home", role, longitude 13.405, latitude 52.52, altitude 0.
    const fixed = (n: number) => u32(Math.round(n * 65536) >>> 0);
    const loci = box("loci", [0, 0, 0, 0], [0x15, 0xc7], utf8("Home"), [0], [0], fixed(13.405), fixed(52.52), fixed(0));
    const result = await scan(sampleMp4({ moovExtra: [box("udta", loci)] }).bytes);
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "location", label: "GPS position", detail: "52.52000, 13.40500 (Home)" })]));
  });
});

describe("scanBmff uuid boxes and free space", () => {
  const aiXmp = '<x:xmpmeta><rdf:Description Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></x:xmpmeta>';

  it("removes top-level XMP and C2PA boxes and reports the AI labels", async () => {
    const c2pa = uuidBox(UUID_C2PA, latin("c2pa jumb claim_generator\u0000\u000bOpenAI Sora"));
    const { bytes } = sampleMp4({ topExtra: [uuidBox(UUID_XMP, utf8(aiXmp)), c2pa] });
    const result = await scan(bytes);
    expect(result.findings.some((f) => f.kind === "ai" && f.source === "XMP box")).toBe(true);
    expect(labels(result.findings)).toContain("Content Credentials (C2PA)");
    const after = await scan(await clean(bytes));
    expect(after.findings.filter((f) => f.removable)).toEqual([]);
    expect(labels(after.findings)).not.toContain("Content Credentials (C2PA)");
  });

  it("removes camera vendor boxes, including Garmin GPS data in the movie header", async () => {
    const sony = uuidBox("55534d5421d24fcebb88695cfac9c740", latin("<Device manufacturer=\"Sony\" modelName=\"ILCE-7M4\"/>"));
    const garmin = uuidBox("9b630f8d637440ec8204bc5ff5091728", new Uint8Array(24).fill(3));
    const { bytes } = sampleMp4({ topExtra: [sony], moovExtra: [garmin] });
    const result = await scan(bytes);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "camera", label: "Sony camera metadata", removable: true }),
        expect.objectContaining({ kind: "location", label: "Garmin GPS data", removable: true }),
      ]),
    );
    expect((await scan(await clean(bytes))).findings.filter((f) => f.removable)).toEqual([]);
  });

  it("keeps an unknown uuid box and says so", async () => {
    const { bytes } = sampleMp4({ topExtra: [uuidBox("00112233445566778899aabbccddeeff", [1, 2, 3])] });
    const result = await scan(bytes);
    expect(result.findings).toEqual([expect.objectContaining({ label: "Unknown vendor box", removable: false }), expect.objectContaining({ label: "Recording date" })]);
  });

  it("zeros leftover data in free space and reads old AI tags in it", async () => {
    const { bytes } = sampleMp4({ topExtra: [box("free", latin("old \u00a9too Runway Gen-3"))] });
    const result = await scan(bytes);
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "ai", label: "Leftover data in free space (mentions Runway)" })]));
    const after = await scan(await clean(bytes));
    expect(labels(after.findings)).not.toContain("Leftover data in free space (mentions Runway)");
  });
});
