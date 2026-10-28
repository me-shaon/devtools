import { describe, expect, it } from "vitest";
import { applyPatches, bytesSource } from "@/utils/byte-source";
import { crc32 } from "@/utils/image-metadata";
import { DEFAULT_VIDEO_OPTIONS } from "@/utils/video-format";
import { elementAt, readVint, scanEbml, voidElement } from "@/utils/video-ebml";
import { DATE_2026_NS, ID, cat, el, elText, elUnknown, indexOfSeq, sampleMkv, simpleTag, u32 } from "./video-fixtures";

const scan = (bytes: Uint8Array, options = DEFAULT_VIDEO_OPTIONS) => scanEbml(bytesSource(bytes), options);
const clean = async (bytes: Uint8Array, options = DEFAULT_VIDEO_OPTIONS) => applyPatches(bytes, (await scan(bytes, options)).patches);
const info = (...extra: Uint8Array[]) =>
  el(ID.Info, elText(ID.Title, "Holiday 2026"), elText(ID.MuxingApp, "Lavf61.7.100"), elText(ID.WritingApp, "Lavf61.7.100"), el(ID.DateUTC, DATE_2026_NS), ...extra);
const tracks = () => el(ID.Tracks, el(ID.TrackEntry, elText(ID.Name, "Recorded on Pixel 9")));
const labels = (findings: { label: string }[]) => findings.map((f) => f.label);
const cluster = () => el(ID.Cluster, new Uint8Array(140).fill(7));

describe("EBML basics", () => {
  it("reads sizes without the marker bit and IDs with it", () => {
    expect(readVint(Uint8Array.from([0x81]), 0, false)).toEqual({ value: 1, length: 1, unknown: false });
    expect(readVint(Uint8Array.from([0x40, 0x02]), 0, false)).toEqual({ value: 2, length: 2, unknown: false });
    expect(readVint(Uint8Array.from([0x01, 255, 255, 255, 255, 255, 255, 255]), 0, false)).toMatchObject({ length: 8, unknown: true });
    expect(readVint(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]), 0, true)).toMatchObject({ value: 0x1a45dfa3, length: 4 });
    expect(readVint(Uint8Array.from([0x00]), 0, false)).toBeNull();
  });

  it("reads an element and its end", () => {
    expect(elementAt(Uint8Array.from([0x7b, 0xa9, 0x83, 1, 2, 3]), 10, 100)).toEqual({ id: 0x7ba9, start: 10, dataStart: 13, size: 3, end: 16 });
    expect(elementAt(cat([0x1f, 0x43, 0xb6, 0x75], [0x01, 255, 255, 255, 255, 255, 255, 255]), 0, 500)).toMatchObject({ size: null, end: 500 });
    expect(() => elementAt(Uint8Array.from([0x7b, 0xa9, 0x90]), 0, 10)).toThrow(/past the end/);
  });

  it("builds Void elements of any size from 2 bytes", () => {
    expect(Array.from(voidElement(2))).toEqual([0xec, 0x80]);
    expect(Array.from(voidElement(5))).toEqual([0xec, 0x10, 0, 0, 0]);
    expect(Array.from(voidElement(9))).toEqual([0xec, 0x01, 0, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(voidElement(100).subarray(0, 9))).toEqual([0xec, 0x01, 0, 0, 0, 0, 0, 0, 91]);
    for (const total of [2, 3, 8, 9, 10, 127, 128, 70000]) expect(elementAt(voidElement(total), 0, total).end).toBe(total);
  });
});

describe("scanEbml Info and Tracks", () => {
  it("reads and clears the title, apps, date, and track names", async () => {
    const { bytes } = sampleMkv([info(), tracks(), cluster()]);
    const result = await scan(bytes);
    expect(result.format).toBe("mkv");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Title", detail: "Holiday 2026" }),
        expect.objectContaining({ label: "Muxing app", detail: "Lavf61.7.100" }),
        expect.objectContaining({ label: "Writing app" }),
        expect.objectContaining({ kind: "camera", label: "Recording date", detail: "2026-05-01T10:22:03Z" }),
        expect.objectContaining({ label: "Track name", detail: "Recorded on Pixel 9" }),
      ]),
    );
    const cleaned = await clean(bytes);
    expect(cleaned.length).toBe(bytes.length);
    expect((await scan(cleaned)).findings).toEqual([]);
  });

  it("keeps the date when Clear dates is off", async () => {
    const result = await scan(sampleMkv([info(), cluster()]).bytes, { ...DEFAULT_VIDEO_OPTIONS, clearDates: false });
    expect(result.findings.find((f) => f.label === "Recording date")?.removable).toBe(false);
  });

  it("reads WebM as WebM", async () => {
    expect((await scan(sampleMkv([info(), cluster()], "webm").bytes)).format).toBe("webm");
  });

  it("writes a correct CRC-32 after changing an element that has one", async () => {
    const rest = cat(elText(ID.Title, "Holiday 2026"), elText(ID.MuxingApp, "Lavf61.7.100"));
    const crc = crc32(rest);
    const crcElement = el(ID.Crc32, [crc & 255, (crc >>> 8) & 255, (crc >>> 16) & 255, crc >>> 24]);
    const { bytes } = sampleMkv([el(ID.Info, crcElement, rest), cluster()]);
    const cleaned = await clean(bytes);
    const infoAt = indexOfSeq(cleaned, [0x15, 0x49, 0xa9, 0x66]);
    const infoElement = elementAt(cleaned.subarray(infoAt, infoAt + 12), infoAt, cleaned.length);
    // The CRC-32 element is the first child: ID 0xBF, size 0x84, then 4 bytes.
    const crcAt = infoElement.dataStart + 2;
    const stored = (cleaned[crcAt] | (cleaned[crcAt + 1] << 8) | (cleaned[crcAt + 2] << 16) | (cleaned[crcAt + 3] << 24)) >>> 0;
    expect(stored).toBe(crc32(cleaned.subarray(crcAt + 4, infoElement.end)));
    expect(stored).not.toBe(crc);
  });
});

describe("scanEbml Tags, Attachments, and seek index", () => {
  const tags = () => el(ID.Tags, el(ID.Tag, simpleTag("ENCODER", "Lavf61.7.100"), simpleTag("LOCATION", "+52.5200+013.4050/"), simpleTag("COMMENT", "made with Pika"), simpleTag("BPS", "4000000")));
  const attachment = (name: string, mime: string) => el(ID.AttachedFile, elText(ID.FileName, name), elText(ID.FileMediaType, mime), el(ID.FileData, new Uint8Array(20).fill(1)));

  it("reads tags, marks AI and location, groups statistics, and removes the Tags element", async () => {
    const { bytes } = sampleMkv([el(ID.Info, elText(ID.Title, "x")), cluster(), tags()]);
    const result = await scan(bytes);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "location", label: "LOCATION" }),
        expect.objectContaining({ kind: "ai", label: "COMMENT (mentions Pika)" }),
        expect.objectContaining({ kind: "other", label: "Track statistics", detail: "1 value, such as the bit rate and the frame count" }),
      ]),
    );
    expect((await scan(await clean(bytes))).findings).toEqual([]);
  });

  it("removes a cover picture and keeps fonts by default", async () => {
    const { bytes } = sampleMkv([el(ID.Info, elText(ID.Title, "x")), el(ID.Attachments, attachment("cover.jpg", "image/jpeg"), attachment("OpenSans.ttf", "font/ttf")), cluster()]);
    const result = await scan(bytes);
    expect(result.findings.find((f) => f.label === "Attached picture")?.removable).toBe(true);
    expect(result.findings.find((f) => f.label === "Attached font")?.removable).toBe(false);
    const after = await scan(await clean(bytes));
    expect(labels(after.findings)).toEqual(["Attached font"]);
  });

  it("removes fonts too when Keep fonts is off", async () => {
    const options = { ...DEFAULT_VIDEO_OPTIONS, keepFonts: false };
    const { bytes } = sampleMkv([el(ID.Info, elText(ID.Title, "x")), el(ID.Attachments, attachment("OpenSans.ttf", "font/ttf")), cluster()]);
    expect((await scan(await clean(bytes, options), options)).findings).toEqual([]);
  });

  it("follows the seek index past a cluster of unknown size", async () => {
    // Build the segment twice: the seek position is a fixed 4-byte number, so the layout does not change.
    const seekHead = (position: number) => el(ID.SeekHead, el(ID.Seek, el(ID.SeekID, [0x12, 0x54, 0xc3, 0x67]), el(ID.SeekPosition, u32(position))));
    const live = elUnknown(ID.Cluster, new Uint8Array(140).fill(7));
    const first = cat(seekHead(0), el(ID.Info, elText(ID.Title, "x")), live);
    const { bytes } = sampleMkv([seekHead(first.length), el(ID.Info, elText(ID.Title, "x")), live, tags()]);
    const result = await scan(bytes);
    expect(labels(result.findings)).toContain("COMMENT (mentions Pika)");
  });
});
