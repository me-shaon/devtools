/**
 * WebAssembly encoders for formats the system web view cannot write.
 *
 * This module loads the single-thread, non-SIMD builds of the jSquash codecs
 * directly. The packages' own init() would also pull in the multi-thread and
 * SIMD variants, so it is not used. Load this module only with import() or from
 * the encode worker.
 */
import avifFactory from "@jsquash/avif/codec/enc/avif_enc.js";
import mozjpegFactory from "@jsquash/jpeg/codec/enc/mozjpeg_enc.js";
import webpFactory from "@jsquash/webp/codec/enc/webp_enc.js";
import initOxipng, { optimise_raw as oxipngOptimiseRaw } from "@jsquash/oxipng/codec/pkg/squoosh_oxipng.js";
import { defaultOptions as avifDefaults } from "@jsquash/avif/meta.js";
import { defaultOptions as mozjpegDefaults } from "@jsquash/jpeg/meta.js";
import { defaultOptions as webpDefaults } from "@jsquash/webp/meta.js";
import avifWasmUrl from "@jsquash/avif/codec/enc/avif_enc.wasm?url";
import mozjpegWasmUrl from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url";
import oxipngWasmUrl from "@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?url";
import webpWasmUrl from "@jsquash/webp/codec/enc/webp_enc.wasm?url";

export type WasmFormat = "avif" | "webp" | "jpeg" | "png";

export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface EncoderModule {
  encode(data: ArrayBufferView, width: number, height: number, options: object): Uint8Array | null;
}

type Factory = (options: object) => Promise<EncoderModule>;

type EncoderFormat = Exclude<WasmFormat, "png">;

const modules: Partial<Record<EncoderFormat, Promise<EncoderModule>>> = {};
let oxipngReady: Promise<unknown> | null = null;

const load = (format: EncoderFormat) => {
  if (!modules[format]) {
    const factory = { avif: avifFactory, webp: webpFactory, jpeg: mozjpegFactory }[format] as unknown as Factory;
    const url = { avif: avifWasmUrl, webp: webpWasmUrl, jpeg: mozjpegWasmUrl }[format];
    modules[format] = factory({ noInitialRun: true, locateFile: () => url });
  }
  return modules[format]!;
};

/** Encodes RGBA pixels as AVIF, WebP, JPEG (MozJPEG), or PNG (OxiPNG). Quality is 1 to 100 and PNG ignores it. */
export async function encodeWithWasm(format: WasmFormat, image: RgbaImage, quality: number): Promise<Uint8Array> {
  if (format === "png") {
    oxipngReady ??= initOxipng(oxipngWasmUrl);
    await oxipngReady;
    // Level 2 is the OxiPNG default. Alpha stays exact, so hidden pixels keep their color.
    return new Uint8Array(oxipngOptimiseRaw(image.data, image.width, image.height, 2, false, false));
  }
  const module = await load(format);
  const output =
    format === "avif"
      ? module.encode(new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength), image.width, image.height, {
          ...avifDefaults,
          quality,
          // Speed 6 keeps large photos at a few seconds without a visible loss.
          speed: 6,
        })
      : format === "jpeg"
        ? module.encode(image.data, image.width, image.height, { ...mozjpegDefaults, quality })
        : module.encode(image.data, image.width, image.height, { ...webpDefaults, quality });
  if (!output) throw new Error(`The ${format.toUpperCase()} encoder failed.`);
  return new Uint8Array(output);
}
