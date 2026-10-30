/**
 * Pixel processing for the Image Converter: an optional resize, then the encoder.
 *
 * This module loads the single-thread build of the jSquash resize codec directly, like
 * wasm-encoders. Load it only with import() or from the encode worker.
 */
import initResize, { resize as wasmResize } from "@jsquash/resize/lib/resize/pkg/squoosh_resize.js";
import resizeWasmUrl from "@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm?url";
import { encodeWithWasm, type RgbaImage, type WasmFormat } from "./wasm-encoders";

export type ResizeMethod = "lanczos3" | "mitchell" | "catrom" | "triangle";

/** The codec's filter index for each method. */
const METHOD_INDEX: Record<ResizeMethod, number> = { triangle: 0, catrom: 1, mitchell: 2, lanczos3: 3 };

export interface ResizeOptions {
  width: number;
  height: number;
  method: ResizeMethod;
  /** Premultiplies color by alpha first, so transparent pixels do not bleed their color into edges. */
  premultiply: boolean;
  /** Blends in linear light, which keeps fine detail from turning darker. */
  linearRgb: boolean;
}

export interface ProcessOptions {
  format: WasmFormat;
  quality: number;
  resize?: ResizeOptions;
}

export interface ProcessedPixels {
  bytes: Uint8Array;
  width: number;
  height: number;
}

let resizeReady: Promise<unknown> | null = null;

/** Resizes RGBA pixels. A resize to the same size returns the input. */
export async function resizePixels(image: RgbaImage, options: ResizeOptions): Promise<RgbaImage> {
  const width = Math.max(1, Math.round(options.width));
  const height = Math.max(1, Math.round(options.height));
  if (width === image.width && height === image.height) return image;
  resizeReady ??= initResize(resizeWasmUrl);
  await resizeReady;
  const data = wasmResize(
    new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
    image.width,
    image.height,
    width,
    height,
    METHOD_INDEX[options.method],
    options.premultiply,
    options.linearRgb,
  );
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height };
}

/** Resizes when asked, then encodes. */
export async function processPixels(image: RgbaImage, options: ProcessOptions): Promise<ProcessedPixels> {
  const pixels = options.resize ? await resizePixels(image, options.resize) : image;
  const bytes = await encodeWithWasm(options.format, pixels, options.quality);
  return { bytes, width: pixels.width, height: pixels.height };
}
