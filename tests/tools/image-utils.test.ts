import { describe, expect, it } from "vitest";
import {
  buildOutputFilename,
  formatFileSize,
  formatSavingsLabel,
  getEffectiveOutputFormat,
  getMimeTypeFromFormat,
  DEFAULT_RESIZE,
  MAX_RESIZE_SIDE,
  resizeTarget,
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

  it("supports AVIF output with a quality setting", () => {
    expect(getEffectiveOutputFormat("image/png", "avif")).toBe("avif");
    expect(getMimeTypeFromFormat("avif")).toBe("image/avif");
    expect(shouldShowQualityControl("image/png", "avif")).toBe(true);
    expect(buildOutputFilename("banner.png", "avif")).toBe("banner.avif");
  });

  it("works out the resize target", () => {
    expect(resizeTarget(600, 500, DEFAULT_RESIZE)).toBeNull();
    const on = { ...DEFAULT_RESIZE, enabled: true };
    expect(resizeTarget(600, 500, { ...on, percent: 50 })).toEqual({ width: 300, height: 250 });
    expect(resizeTarget(600, 500, { ...on, percent: 33.33 })).toEqual({ width: 200, height: 167 });
    expect(resizeTarget(600, 500, { ...on, width: 120, height: 90 })).toEqual({ width: 120, height: 90 });
    expect(resizeTarget(3, 3, { ...on, percent: 1 })).toEqual({ width: 1, height: 1 });
    expect(resizeTarget(10, 10, { ...on, width: 99999, height: 0 })).toEqual({ width: MAX_RESIZE_SIDE, height: 1 });
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
