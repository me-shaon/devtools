import { describe, expect, it } from "vitest";
import {
  buildOutputFilename,
  formatFileSize,
  formatSavingsLabel,
  getEffectiveOutputFormat,
  getSavingsPercent,
  isSupportedImageType,
  shouldShowQualityControl,
} from "@/utils/image";

describe("image utils", () => {
  it("resolves the effective output format", () => {
    expect(getEffectiveOutputFormat("image/jpeg", "original")).toBe("jpeg");
    expect(getEffectiveOutputFormat("image/png", "webp")).toBe("webp");
    expect(getEffectiveOutputFormat("image/gif", "original")).toBeNull();
  });

  it("detects when quality controls should be shown", () => {
    expect(shouldShowQualityControl("image/jpeg", "original")).toBe(true);
    expect(shouldShowQualityControl("image/png", "original")).toBe(false);
    expect(shouldShowQualityControl("image/png", "webp")).toBe(true);
  });

  it("formats output file names with the expected extension", () => {
    expect(buildOutputFilename("photo.png", "webp")).toBe("photo.webp");
    expect(buildOutputFilename("summer-trip.jpeg", "jpeg")).toBe("summer-trip.jpg");
  });

  it("formats file sizes and savings", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(getSavingsPercent(1000, 700)).toBe(30);
    expect(formatSavingsLabel(30)).toBe("30% smaller");
    expect(formatSavingsLabel(-12)).toBe("12% larger");
  });

  it("accepts supported input image types", () => {
    expect(isSupportedImageType("image/jpeg")).toBe(true);
    expect(isSupportedImageType("image/png")).toBe(true);
    expect(isSupportedImageType("image/webp")).toBe(true);
    expect(isSupportedImageType("image/gif")).toBe(false);
  });
});
