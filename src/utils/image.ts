export type ImageFormat = "jpeg" | "png" | "webp";
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
  return format === "jpeg" || format === "webp";
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
