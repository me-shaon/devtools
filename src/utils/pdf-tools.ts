/**
 * Builds new PDF files from pages of other PDFs and from images. Everything runs on this device.
 * Rendering pages to pixels is in pdf-render.ts, because it needs a browser canvas.
 */

import { degrees, PDFDocument, type PDFImage, type PDFPage } from "pdf-lib";

export type SourceKind = "pdf" | "image";

export interface PdfSource {
  id: string;
  name: string;
  kind: SourceKind;
  /** PDF bytes, or JPEG or PNG bytes for an image. */
  bytes: Uint8Array;
  /** "image/jpeg" or "image/png" for an image. */
  mime: string;
  pageCount: number;
  /** Image size in pixels, or the size of the first page in points. */
  width: number;
  height: number;
  /** The rotation each page has in the source, in degrees. One entry per page. */
  baseRotations: number[];
}

export interface PageRef {
  id: string;
  sourceId: string;
  /** The zero-based page number in the source. Always 0 for an image. */
  index: number;
  /** Extra clockwise rotation in degrees: 0, 90, 180, or 270. */
  rotation: number;
}

export type ImagePageSize = "image" | "a4" | "letter";

export interface BuildOptions {
  /** The page size for image pages. "image" makes the page the size of the image at 96 DPI. */
  imagePageSize: ImagePageSize;
}

export const PAGE_SIZES: Record<Exclude<ImagePageSize, "image">, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

/** A margin in points around an image on an A4 or Letter page. */
const IMAGE_MARGIN = 36;

export const MAX_PDF_BYTES = 200 * 1024 * 1024;

export class PdfToolError extends Error {}

const normalizeRotation = (value: number) => ((Math.round(value / 90) * 90) % 360 + 360) % 360;

export const rotate = (rotation: number, by: number) => normalizeRotation(rotation + by);

/** Reads a PDF and returns its page count, page size, and page rotations. Rejects encrypted files. */
export async function inspectPdf(bytes: Uint8Array): Promise<Pick<PdfSource, "pageCount" | "width" | "height" | "baseRotations">> {
  const doc = await loadPdf(bytes);
  let pages: PDFPage[];
  try {
    pages = doc.getPages();
  } catch {
    throw new PdfToolError("The PDF could not be read. Its page tree is damaged.");
  }
  if (!pages.length) throw new PdfToolError("This PDF has no pages.");
  const { width, height } = pages[0].getSize();
  return { pageCount: pages.length, width, height, baseRotations: pages.map((page) => normalizeRotation(page.getRotation().angle)) };
}

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  if (!isPdf(bytes)) throw new PdfToolError("This file is not a PDF. A PDF starts with %PDF.");
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (err) {
    throw new PdfToolError(`The PDF could not be read: ${(err as Error).message}`);
  }
  if (doc.isEncrypted) throw new PdfToolError("This PDF is protected with a password. Remove the password in a PDF reader first.");
  return doc;
}

/** True when the bytes start with the %PDF header, allowing up to 1 KB of junk before it. */
export function isPdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

export const isPng = (bytes: Uint8Array) => bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
export const isJpeg = (bytes: Uint8Array) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/** Reads the EXIF orientation of a JPEG (1 to 8), or 1 when there is none. */
export function jpegOrientation(bytes: Uint8Array): number {
  if (!isJpeg(bytes)) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) return 1;
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && offset + 10 <= bytes.length && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10;
      if (tiff + 8 > bytes.length) return 1;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > bytes.length) return 1;
      const count = view.getUint16(ifd, little);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > bytes.length) return 1;
        if (view.getUint16(entry, little) === 0x0112) {
          const value = view.getUint16(entry + 8, little);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    offset += 2 + length;
  }
  return 1;
}

/**
 * Builds a PDF from pages in the given order. Copied pages keep their content, links, and form
 * fields on the page. The new file has no document metadata such as the title, author, or the app
 * that made the source.
 */
export async function buildPdf(sources: ReadonlyMap<string, PdfSource>, pages: readonly PageRef[], options: BuildOptions): Promise<Uint8Array> {
  if (!pages.length) throw new PdfToolError("There are no pages to save.");
  const out = await PDFDocument.create({ updateMetadata: false });
  const loaded = new Map<string, PDFDocument>();
  const images = new Map<string, PDFImage>();

  for (const ref of pages) {
    const source = sources.get(ref.sourceId);
    if (!source) throw new PdfToolError("A page refers to a file that was removed.");
    let page: PDFPage;
    if (source.kind === "pdf") {
      let doc = loaded.get(source.id);
      if (!doc) {
        doc = await loadPdf(source.bytes);
        loaded.set(source.id, doc);
      }
      [page] = await out.copyPages(doc, [ref.index]);
      out.addPage(page);
      page.setRotation(degrees(rotate(source.baseRotations[ref.index] ?? 0, ref.rotation)));
    } else {
      let image = images.get(source.id);
      if (!image) {
        image = source.mime === "image/png" ? await out.embedPng(source.bytes) : await out.embedJpg(source.bytes);
        images.set(source.id, image);
      }
      page = addImagePage(out, image, options.imagePageSize);
      page.setRotation(degrees(rotate(0, ref.rotation)));
    }
  }
  return out.save();
}

function addImagePage(doc: PDFDocument, image: PDFImage, size: ImagePageSize): PDFPage {
  // Pixels at 96 DPI become points at 72 per inch.
  const naturalWidth = (image.width * 72) / 96;
  const naturalHeight = (image.height * 72) / 96;
  if (size === "image") {
    const page = doc.addPage([naturalWidth, naturalHeight]);
    page.drawImage(image, { x: 0, y: 0, width: naturalWidth, height: naturalHeight });
    return page;
  }
  const [short, long] = PAGE_SIZES[size];
  // A wide image goes on a landscape page.
  const [pageWidth, pageHeight] = image.width > image.height ? [long, short] : [short, long];
  const boxWidth = pageWidth - IMAGE_MARGIN * 2;
  const boxHeight = pageHeight - IMAGE_MARGIN * 2;
  const scale = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight, 1);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  const page = doc.addPage([pageWidth, pageHeight]);
  page.drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
  return page;
}

/**
 * Reads page ranges such as "1-3, 5, 8-" into zero-based page numbers, in order and without
 * duplicates. Returns an error message for an invalid range.
 */
export function parsePageRanges(input: string, pageCount: number): { pages: number[] } | { error: string } {
  const pages: number[] = [];
  const seen = new Set<number>();
  const parts = input.split(/[,\s]+/).filter(Boolean);
  if (!parts.length) return { error: "Enter page numbers, such as 1-3, 5." };
  for (const part of parts) {
    const match = /^(\d+)?(?:(-)(\d+)?)?$/.exec(part);
    if (!match || (!match[1] && !match[3])) return { error: `"${part}" is not a page or a range. Use a form such as 1-3, 5, or 8-.` };
    const start = match[1] ? Number(match[1]) : 1;
    const end = match[2] ? (match[3] ? Number(match[3]) : pageCount) : start;
    if (start < 1 || end < 1 || start > pageCount || end > pageCount) return { error: `Page ${Math.max(start, end)} does not exist. The document has ${pageCount} pages.` };
    const step = start <= end ? 1 : -1;
    for (let page = start; page !== end + step; page += step) {
      if (!seen.has(page)) {
        seen.add(page);
        pages.push(page - 1);
      }
    }
  }
  return { pages };
}

/** Removes the extension and characters that file systems do not accept. */
export function baseName(fileName: string): string {
  // eslint-disable-next-line no-control-regex
  const name = fileName.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim();
  return name || "document";
}

/** File names for split pages, padded so they sort in page order: name-01.pdf, name-02.pdf. */
export function numberedNames(base: string, count: number, extension: string): string[] {
  const width = String(count).length;
  return Array.from({ length: count }, (_, i) => `${base}-${String(i + 1).padStart(Math.max(2, width), "0")}.${extension}`);
}
