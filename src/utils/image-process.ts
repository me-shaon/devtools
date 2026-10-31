/**
 * Pixel processing for the Image Converter: an optional resize, an optional palette reduction,
 * then the encoder.
 *
 * This module loads the single-thread build of the jSquash resize codec directly, like
 * wasm-encoders. Load it only with import() or from the encode worker.
 */
import initResize, { resize as wasmResize } from "@jsquash/resize/lib/resize/pkg/squoosh_resize.js";
import resizeWasmUrl from "@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm?url";
import { applyPaletteSync, buildPaletteSync, utils } from "image-q";
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

export interface PaletteOptions {
  /** Number of colors, from 2 to 256. */
  colors: number;
  /** Spreads the color error to nearby pixels (Floyd-Steinberg), which hides banding in gradients. */
  dither: boolean;
}

export interface ProcessOptions {
  format: WasmFormat;
  quality: number;
  resize?: ResizeOptions;
  palette?: PaletteOptions;
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

/** Reduces the image to a palette of at most the given number of colors. Alpha counts as part of each color. */
export function reducePalette(image: RgbaImage, options: PaletteOptions): RgbaImage {
  const colors = Math.min(256, Math.max(2, Math.round(options.colors)));
  const points = utils.PointContainer.fromUint8Array(image.data, image.width, image.height);
  const palette = buildPaletteSync([points], { colors, paletteQuantization: "wuquant", colorDistanceFormula: "euclidean-bt709" });
  const output = applyPaletteSync(points, palette, {
    imageQuantization: options.dither ? "floyd-steinberg" : "nearest",
    colorDistanceFormula: "euclidean-bt709",
  });
  return { data: new Uint8ClampedArray(output.toUint8Array()), width: image.width, height: image.height };
}

/** Resizes and reduces the palette when asked, then encodes. */
export async function processPixels(image: RgbaImage, options: ProcessOptions): Promise<ProcessedPixels> {
  const resized = options.resize ? await resizePixels(image, options.resize) : image;
  const pixels = options.palette ? reducePalette(resized, options.palette) : resized;
  const bytes = await encodeWithWasm(options.format, pixels, options.quality);
  return { bytes, width: pixels.width, height: pixels.height };
}
