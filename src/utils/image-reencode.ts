/**
 * Re-encodes an image through a canvas, so the output has new pixels and no
 * metadata. The browser applies the EXIF orientation while it decodes, so the
 * output is upright.
 */
import type { RgbaImage, WasmFormat } from "./wasm-encoders";

export type OutputFormat = "jpeg" | "png" | "webp" | "avif";

export interface OutputFormatOption {
  id: OutputFormat;
  title: string;
  caption: string;
  mime: string;
}

export const OUTPUT_FORMATS: OutputFormatOption[] = [
  { id: "jpeg", title: "JPG", caption: "Most compatible", mime: "image/jpeg" },
  { id: "png", title: "PNG", caption: "Lossless, keeps transparency", mime: "image/png" },
  { id: "webp", title: "WebP", caption: "Smaller files", mime: "image/webp" },
  { id: "avif", title: "AVIF", caption: "Smallest, newer format", mime: "image/avif" },
];

export const DEFAULT_OUTPUT_FORMAT: OutputFormat = "jpeg";
export const DEFAULT_QUALITY = 85;

export const outputMime = (format: OutputFormat) => OUTPUT_FORMATS.find((f) => f.id === format)!.mime;

/** PNG is lossless, so it has no quality setting. */
export const usesQuality = (format: OutputFormat) => format !== "png";

/** True when the canvas did not write WebP (macOS WebKit returns PNG) and the WASM encoder must run. */
export const needsWebpFallback = (blob: Blob | null) => !blob || blob.type !== "image/webp";

export type WasmEncoder = (format: WasmFormat, image: RgbaImage, quality: number) => Promise<Uint8Array>;

const canvasToBlob = (canvas: HTMLCanvasElement, mime: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, mime, quality);
    } catch {
      resolve(null);
    }
  });

const blobBytes = (blob: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the encoded image."));
    reader.readAsArrayBuffer(blob);
  });

/* ------------------------------------------------------------------ */
/* WASM encoding, in a worker when the platform has one                */
/* ------------------------------------------------------------------ */

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 0;
const pending = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>();

const getWorker = () => {
  if (workerFailed || typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./image-encode.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ id: number; bytes?: Uint8Array; error?: string }>) => {
        const task = pending.get(event.data.id);
        if (!task) return;
        pending.delete(event.data.id);
        if (event.data.bytes) task.resolve(event.data.bytes);
        else task.reject(new Error(event.data.error ?? "Encoding failed."));
      };
      worker.onerror = () => {
        workerFailed = true;
        worker?.terminate();
        worker = null;
        for (const task of pending.values()) task.reject(new Error("worker-failed"));
        pending.clear();
      };
    } catch {
      workerFailed = true;
      return null;
    }
  }
  return worker;
};

const encodeOnMainThread: WasmEncoder = async (format, image, quality) => {
  const { encodeWithWasm } = await import("./wasm-encoders");
  return encodeWithWasm(format, image, quality);
};

/** Encodes in the worker. Falls back to the main thread when the worker cannot start. */
export const encodeWasm: WasmEncoder = async (format, image, quality) => {
  const active = getWorker();
  if (!active) return encodeOnMainThread(format, image, quality);
  const id = ++nextId;
  const copy = new Uint8ClampedArray(image.data);
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      active.postMessage({ id, format, quality, width: image.width, height: image.height, data: copy }, [copy.buffer]);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "worker-failed") return encodeOnMainThread(format, image, quality);
    throw error;
  }
};

/* ------------------------------------------------------------------ */
/* Decode and encode                                                   */
/* ------------------------------------------------------------------ */

const loadElement = (blob: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode this image."));
    };
    image.src = url;
  });

/** Decodes the image upright onto a canvas. JPEG output gets a white background. */
export async function decodeToCanvas(blob: Blob, format: OutputFormat): Promise<HTMLCanvasElement> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
  } else {
    const image = await loadElement(blob);
    source = image;
    width = image.naturalWidth || image.width;
    height = image.naturalHeight || image.height;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the image canvas.");
  if (format === "jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(source, 0, 0);
  if ("close" in source && typeof source.close === "function") source.close();
  return canvas;
}

export const canvasPixels = (canvas: HTMLCanvasElement): RgbaImage => {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not read the image pixels.");
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data, width, height };
};

/** Encodes a canvas in the chosen format. WebP falls back to WASM when the canvas cannot write it; AVIF always uses WASM. */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  quality: number,
  wasm: WasmEncoder = encodeWasm,
): Promise<Uint8Array> {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  if (format === "jpeg" || format === "png") {
    const blob = await canvasToBlob(canvas, outputMime(format), format === "jpeg" ? q / 100 : undefined);
    if (!blob) throw new Error(`Could not encode the image as ${format === "jpeg" ? "JPG" : "PNG"}.`);
    return blobBytes(blob);
  }
  if (format === "webp") {
    const blob = await canvasToBlob(canvas, "image/webp", q / 100);
    if (!needsWebpFallback(blob)) return blobBytes(blob!);
  }
  return wasm(format, canvasPixels(canvas), q);
}

/** Decodes and re-encodes an image. */
export async function reencodeImage(blob: Blob, format: OutputFormat, quality: number, wasm?: WasmEncoder): Promise<Uint8Array> {
  const canvas = await decodeToCanvas(blob, format);
  return encodeCanvas(canvas, format, quality, wasm);
}
