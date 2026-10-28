import { describe, expect, it } from "vitest";
import { blobSource, bytesSource } from "@/utils/byte-source";
import { DEFAULT_VIDEO_OPTIONS } from "@/utils/video-format";
import { cleanVideo, detectContainer, inspectVideo } from "@/utils/video-metadata";
import { ID, box, el, elText, qtText, sampleMkv, sampleMp4 } from "./video-fixtures";

describe("video metadata", () => {
  it("detects the container from the first bytes", async () => {
    expect(await detectContainer(bytesSource(sampleMp4().bytes))).toBe("bmff");
    expect(await detectContainer(bytesSource(sampleMp4({ noFtyp: true }).bytes))).toBe("bmff");
    expect(await detectContainer(bytesSource(sampleMkv([el(ID.Info, elText(ID.Title, "x"))]).bytes))).toBe("ebml");
    expect(await detectContainer(bytesSource(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9])))).toBeNull();
  });

  it("rejects a file that is not a supported video", async () => {
    await expect(inspectVideo(bytesSource(new TextEncoder().encode("hello world, not a video")))).rejects.toThrow(/not an MP4, MOV, M4V, 3GP, MKV, or WebM video/);
  });

  it("marks AI and location findings", async () => {
    const udta = box("udta", qtText("©xyz", "+52.5200+013.4050/"), qtText("©too", "Kling 2.1"));
    const result = await inspectVideo(bytesSource(sampleMp4({ moovExtra: [udta] }).bytes));
    expect(result).toMatchObject({ format: "mp4", hasAi: true, hasLocation: true });
  });

  it("builds a clean copy of the same size with no removable metadata left", async () => {
    const udta = box("udta", qtText("©xyz", "+52.5200+013.4050/"));
    const { bytes } = sampleMp4({ moovExtra: [udta], withGpmd: true });
    const file = new Blob([bytes]);
    const before = await inspectVideo(blobSource(file));
    const result = await cleanVideo(file, before, DEFAULT_VIDEO_OPTIONS);
    expect(result.blob.size).toBe(bytes.length);
    expect(result.blob.type).toBe("video/mp4");
    expect(result.after.findings.filter((f) => f.removable)).toEqual([]);
    expect(result.removedCount).toBe(before.findings.filter((f) => f.removable).length);
  });
});
