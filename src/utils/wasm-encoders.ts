/**
 * WebAssembly encoders for formats the system web view cannot write.
 *
 * This module loads the single-thread, non-SIMD builds of the jSquash codecs
 * directly. The packages' own init() would also pull in the multi-thread and
 * SIMD variants, so it is not used. Load this module only with import() or from
 * the encode worker.
 */
import avifFactory from "@jsquash/avif/codec/enc/avif_enc.js";
import webpFactory from "@jsquash/webp/codec/enc/webp_enc.js";
import { defaultOptions as avifDefaults } from "@jsquash/avif/meta.js";
import { defaultOptions as webpDefaults } from "@jsquash/webp/meta.js";
import avifWasmUrl from "@jsquash/avif/codec/enc/avif_enc.wasm?url";
import webpWasmUrl from "@jsquash/webp/codec/enc/webp_enc.wasm?url";

export type WasmFormat = "avif" | "webp";

export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface EncoderModule {
  encode(data: ArrayBufferView, width: number, height: number, options: object): Uint8Array | null;
}

type Factory = (options: object) => Promise<EncoderModule>;

const modules: Partial<Record<WasmFormat, Promise<EncoderModule>>> = {};

const load = (format: WasmFormat) => {
  if (!modules[format]) {
    const factory = (format === "avif" ? avifFactory : webpFactory) as unknown as Factory;
    const url = format === "avif" ? avifWasmUrl : webpWasmUrl;
    modules[format] = factory({ noInitialRun: true, locateFile: () => url });
  }
  return modules[format]!;
};

/** Encodes RGBA pixels as AVIF or WebP. Quality is 1 to 100. */
export async function encodeWithWasm(format: WasmFormat, image: RgbaImage, quality: number): Promise<Uint8Array> {
  const module = await load(format);
  const output =
    format === "avif"
      ? module.encode(new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength), image.width, image.height, {
          ...avifDefaults,
          quality,
          // Speed 6 keeps large photos at a few seconds without a visible loss.
          speed: 6,
        })
      : module.encode(image.data, image.width, image.height, { ...webpDefaults, quality });
  if (!output) throw new Error(`The ${format.toUpperCase()} encoder failed.`);
  return new Uint8Array(output);
}
