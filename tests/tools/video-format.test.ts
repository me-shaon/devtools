import { describe, expect, it } from "vitest";
import { VideoError, cleanVideoName } from "@/utils/video-format";

describe("cleanVideoName", () => {
  it("adds -clean and keeps a known video extension", () => {
    expect(cleanVideoName("IMG_0042.MOV", "mov")).toBe("IMG_0042-clean.MOV");
    expect(cleanVideoName("clip.mp4", "mov")).toBe("clip-clean.mp4");
    expect(cleanVideoName("talk.webm", "webm")).toBe("talk-clean.webm");
  });

  it("uses the format as the extension when the name has none or an unknown one", () => {
    expect(cleanVideoName("download", "mp4")).toBe("download-clean.mp4");
    expect(cleanVideoName("movie.bin", "mkv")).toBe("movie-clean.mkv");
    // A leading dot is part of the name, as in cleanFileName in image-metadata.ts.
    expect(cleanVideoName(".mp4", "mp4")).toBe(".mp4-clean.mp4");
  });

  it("has an error type that callers can tell apart", () => {
    expect(new VideoError("x")).toBeInstanceOf(Error);
    expect(new VideoError("x")).toBeInstanceOf(VideoError);
  });
});
