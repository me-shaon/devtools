import { describe, expect, it } from "vitest";
import { applyPatches, bytesSource } from "@/utils/byte-source";
import { DEFAULT_VIDEO_OPTIONS } from "@/utils/video-format";
import { blankBox, children, headerAt, scanBmff } from "@/utils/video-bmff";
import { box, cat, latin, sampleMp4, u32 } from "./video-fixtures";

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
