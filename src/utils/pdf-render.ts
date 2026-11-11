/**
 * Renders PDF pages to images with PDF.js. PDF.js is large, so it loads on first use.
 * The legacy build runs in older system web views, such as WebKitGTK on Linux.
 */

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

// The app works offline, so PDF.js gets its CMaps, standard fonts, and image decoders from the
// bundle instead of a CDN. Each file becomes a separate asset that loads only when a PDF needs it.
const CMAPS = import.meta.glob("/node_modules/pdfjs-dist/cmaps/*.bcmap", { query: "?url", import: "default" }) as Record<string, () => Promise<string>>;
const FONTS = import.meta.glob(["/node_modules/pdfjs-dist/standard_fonts/*.pfb", "/node_modules/pdfjs-dist/standard_fonts/*.ttf"], {
  query: "?url",
  import: "default",
}) as Record<string, () => Promise<string>>;
const WASM = import.meta.glob("/node_modules/pdfjs-dist/wasm/*.wasm", { query: "?url", import: "default" }) as Record<string, () => Promise<string>>;

const TABLES: Record<string, [Record<string, () => Promise<string>>, string]> = {
  cMapUrl: [CMAPS, "/node_modules/pdfjs-dist/cmaps/"],
  standardFontDataUrl: [FONTS, "/node_modules/pdfjs-dist/standard_fonts/"],
  wasmUrl: [WASM, "/node_modules/pdfjs-dist/wasm/"],
};

/** Gives PDF.js the bundled data files. PDF.js calls `fetch` with the kind and file name. */
class BundledDataFactory {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const [table, prefix] = TABLES[kind] ?? [];
    const load = table?.[`${prefix}${filename}`];
    if (!load) throw new Error(`PDF.js asked for ${filename}, which is not bundled.`);
    const response = await fetch(await load());
    if (!response.ok) throw new Error(`Could not load ${filename}.`);
    return new Uint8Array(await response.arrayBuffer());
  }
}

let loading: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  loading ??= Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")])
    .then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })
    .catch((err) => {
      loading = null;
      throw err;
    });
  return loading;
}

export type RenderDocument = PDFDocumentProxy;

/** Opens a PDF for rendering. PDF.js takes ownership of the buffer, so it gets a copy. */
export async function openForRender(bytes: Uint8Array): Promise<RenderDocument> {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({
    data: bytes.slice(),
    BinaryDataFactory: BundledDataFactory,
    useWorkerFetch: false,
    enableXfa: false,
  }).promise;
}

export type ImageFormat = "png" | "jpeg";

export interface RenderOptions {
  /** Pixels per inch. 72 renders a page at its size in points. */
  dpi: number;
  format: ImageFormat;
  /** JPEG quality from 0 to 1. */
  quality?: number;
  /** Largest width or height in pixels, to keep thumbnails small. */
  maxSide?: number;
}

/** Most browsers cannot make a canvas larger than about 16,000 pixels on a side or 268 million pixels. */
const MAX_CANVAS_SIDE = 16_000;
const MAX_CANVAS_AREA = 120_000_000;

/** Renders one page (zero-based) with its own rotation to a PNG or JPEG blob. */
export async function renderPage(doc: RenderDocument, index: number, options: RenderOptions): Promise<Blob> {
  const page = await doc.getPage(index + 1);
  try {
    const base = page.getViewport({ scale: 1 });
    let scale = options.dpi / 72;
    if (options.maxSide) scale = Math.min(scale, options.maxSide / Math.max(base.width, base.height));
    scale = Math.min(scale, MAX_CANVAS_SIDE / Math.max(base.width, base.height), Math.sqrt(MAX_CANVAS_AREA / (base.width * base.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    // PDF pages are transparent. A white background matches how readers show them, and JPEG has no alpha.
    await page.render({ canvas, viewport, background: "#ffffff" }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, `image/${options.format}`, options.quality ?? 0.92));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) throw new Error("The page could not be turned into an image.");
    return blob;
  } finally {
    page.cleanup();
  }
}

/** Frees a document and its worker data. */
export function closeRender(doc: RenderDocument): void {
  void doc.loadingTask.destroy();
}
