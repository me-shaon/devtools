/** Images are scaled down so that the longest side is at most this many pixels. */
const MAX_IMAGE_SIDE = 1600;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;

const TYPE_ERROR = "Choose an image file, such as a PNG, JPEG, or WebP.";
const SIZE_ERROR = "This image is larger than 20 MB. Choose a smaller file.";
const PIXEL_ERROR = "This image has too many pixels (limit 40 megapixels). Resize it and try again.";
const DECODE_ERROR = "Cannot read this image. It may be damaged or in an unsupported format.";
const CANVAS_ERROR = "This system cannot draw the image.";

/** Validate a file before decoding. Returns a user-facing message, or null when accepted. */
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return TYPE_ERROR;
  if (file.size > MAX_IMAGE_BYTES) return SIZE_ERROR;
  return null;
}

export interface LoadedImageFile {
  url: string;
  name: string;
  pixels: ImageData;
}

/**
 * Decode a locally selected image into scaled pixel data. The returned object URL belongs to the
 * caller and must be revoked. Rejects with a user-facing message on decode, size, or canvas failure.
 */
export function loadImageFile(file: File): Promise<LoadedImageFile> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        URL.revokeObjectURL(url);
        reject(new Error(DECODE_ERROR));
        return;
      }
      if (img.naturalWidth * img.naturalHeight > MAX_IMAGE_PIXELS) {
        URL.revokeObjectURL(url);
        reject(new Error(PIXEL_ERROR));
        return;
      }
      try {
        const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error(CANVAS_ERROR);
        ctx.drawImage(img, 0, 0, width, height);
        resolve({ url, name: file.name, pixels: ctx.getImageData(0, 0, width, height) });
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error instanceof Error ? error : new Error(DECODE_ERROR));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cannot read this image. Try a PNG, JPEG, or WebP file."));
    };
    img.src = url;
  });
}
