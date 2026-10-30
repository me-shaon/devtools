import type { ResizeMethod } from "./image-process";

export type ImageFormat = "jpeg" | "png" | "webp" | "avif";
export type CompressionTarget = "original" | ImageFormat;

export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function isSupportedImageType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(mimeType as (typeof SUPPORTED_IMAGE_TYPES)[number]);
}

export function getFormatFromMimeType(mimeType: string): ImageFormat | null {
  switch (mimeType) {
    case "image/jpeg":
    case "image/jpg":
      return "jpeg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

export function getMimeTypeFromFormat(format: ImageFormat): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
  }
}

export function getEffectiveOutputFormat(
  inputMimeType: string,
  target: CompressionTarget,
): ImageFormat | null {
  if (target === "original") {
    return getFormatFromMimeType(inputMimeType);
  }

  return target;
}

export function canAdjustQuality(format: ImageFormat): boolean {
  return format !== "png";
}

export function shouldShowQualityControl(
  inputMimeType: string,
  target: CompressionTarget,
): boolean {
  const outputFormat = getEffectiveOutputFormat(inputMimeType, target);
  return outputFormat ? canAdjustQuality(outputFormat) : false;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 Bytes";
  }

  const units = ["Bytes", "KB", "MB", "GB"];
  const sizeIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, sizeIndex);

  return `${Math.round(value * 100) / 100} ${units[sizeIndex]}`;
}

export function getSavingsPercent(originalSize: number, compressedSize: number): number {
  if (originalSize <= 0) {
    return 0;
  }

  return Math.round((1 - compressedSize / originalSize) * 100);
}

export function formatSavingsLabel(savingsPercent: number): string {
  const absolutePercent = Math.abs(savingsPercent);
  return savingsPercent >= 0 ? `${absolutePercent}% smaller` : `${absolutePercent}% larger`;
}

export function getFormatLabel(format: ImageFormat): string {
  return format.toUpperCase();
}

export function getExtensionForFormat(format: ImageFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export function buildOutputFilename(fileName: string, format: ImageFormat): string {
  const sanitizedName = fileName.replace(/\.[^/.]+$/, "");
  return `${sanitizedName}.${getExtensionForFormat(format)}`;
}

export interface ResizeSettings {
  enabled: boolean;
  method: ResizeMethod;
  /** Scale in percent. Bulk mode uses only this value. */
  percent: number;
  /** A custom size in pixels. When set, it replaces the percent in single mode. */
  width: number | null;
  height: number | null;
  keepAspect: boolean;
  premultiply: boolean;
  linearRgb: boolean;
}

export const DEFAULT_RESIZE: ResizeSettings = {
  enabled: false,
  method: "lanczos3",
  percent: 100,
  width: null,
  height: null,
  keepAspect: true,
  premultiply: true,
  linearRgb: true,
};

export const RESIZE_METHODS: { id: ResizeMethod; label: string }[] = [
  { id: "lanczos3", label: "Lanczos3 (sharpest)" },
  { id: "mitchell", label: "Mitchell" },
  { id: "catrom", label: "Catmull-Rom" },
  { id: "triangle", label: "Triangle (bilinear)" },
];

export const RESIZE_PRESETS = [100, 75, 50, 33.33, 25];

/** Largest output side in pixels, so a typo cannot ask for a huge image. */
export const MAX_RESIZE_SIDE = 16384;

/** The output size for an image, or null when resizing is off. */
export function resizeTarget(
  sourceWidth: number,
  sourceHeight: number,
  settings: ResizeSettings,
): { width: number; height: number } | null {
  if (!settings.enabled) return null;
  const clampSide = (value: number) => Math.min(MAX_RESIZE_SIDE, Math.max(1, Math.round(value)));
  if (settings.width !== null && settings.height !== null) {
    return { width: clampSide(settings.width), height: clampSide(settings.height) };
  }
  const scale = settings.percent / 100;
  return { width: clampSide(sourceWidth * scale), height: clampSide(sourceHeight * scale) };
}
