import { degrees, PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  baseName,
  buildPdf,
  inspectPdf,
  isPdf,
  jpegOrientation,
  numberedNames,
  parsePageRanges,
  rotate,
  type PageRef,
  type PdfSource,
} from "@/utils/pdf-tools";

/** A PDF with one page per label. Each page shows its label, and the pages have different widths. */
async function makePdf(labels: string[], options: { rotation?: number; title?: string } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (options.title) {
    doc.setTitle(options.title);
    doc.setAuthor("Ada");
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  labels.forEach((label, i) => {
    const page = doc.addPage([200 + i * 10, 300]);
    page.drawText(label, { x: 20, y: 150, font, size: 12 });
    if (options.rotation) page.setRotation(degrees(options.rotation));
  });
  return doc.save();
}

// TextEncoder returns a Uint8Array from another realm under jsdom, and pdf-lib checks instanceof.
const enc = (text: string) => Uint8Array.from(new TextEncoder().encode(text));

// A 1x1 PNG.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

async function source(id: string, bytes: Uint8Array, name = `${id}.pdf`): Promise<PdfSource> {
  return { id, name, kind: "pdf", bytes, mime: "application/pdf", ...(await inspectPdf(bytes)) };
}

const imageSource = (id: string, width: number, height: number): PdfSource => ({
  id,
  name: `${id}.png`,
  kind: "image",
  bytes: PNG,
  mime: "image/png",
  pageCount: 1,
  width,
  height,
  baseRotations: [0],
});

const ref = (sourceId: string, index: number, rotation = 0): PageRef => ({ id: `${sourceId}-${index}`, sourceId, index, rotation });

const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((page) => Math.round(page.getWidth()));

describe("inspectPdf", () => {
  it("reads the page count, size, and rotations", async () => {
    expect(await inspectPdf(await makePdf(["a", "b"], { rotation: 90 }))).toEqual({ pageCount: 2, width: 200, height: 300, baseRotations: [90, 90] });
  });

  it("rejects files that are not PDFs, broken PDFs, and encrypted PDFs", async () => {
    await expect(inspectPdf(enc("hello"))).rejects.toThrow(/not a PDF/);
    await expect(inspectPdf(enc("%PDF-1.7\n garbage"))).rejects.toThrow(/could not be read/);
    const encrypted = enc(
      "%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\n3 0 obj << /Filter /Standard /V 1 /R 2 /O (x) /U (y) /P -4 >> endobj\ntrailer << /Root 1 0 R /Encrypt 3 0 R >>\n%%EOF",
    );
    await expect(inspectPdf(encrypted)).rejects.toThrow(/password/);
  });
});

describe("buildPdf", () => {
  it("merges files and reorders, drops, and rotates pages", async () => {
    const a = await source("a", await makePdf(["a1", "a2", "a3"]));
    const b = await source("b", await makePdf(["b1"], { rotation: 90 }));
    const sources = new Map([a, b].map((s) => [s.id, s]));
    const bytes = await buildPdf(sources, [ref("b", 0, 90), ref("a", 2), ref("a", 0, 270)], { imagePageSize: "image" });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(await widths(bytes)).toEqual([200, 220, 200]);
    expect(doc.getPages().map((page) => page.getRotation().angle)).toEqual([180, 0, 270]);
  });

  it("writes no document metadata from the sources", async () => {
    const a = await source("a", await makePdf(["a1"], { title: "Secret plan" }));
    const bytes = await buildPdf(new Map([[a.id, a]]), [ref("a", 0)], { imagePageSize: "image" });
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getTitle()).toBeUndefined();
    expect(doc.getAuthor()).toBeUndefined();
    expect(doc.getProducer()).toBeUndefined();
    expect(new TextDecoder("latin1").decode(bytes)).not.toContain("Secret plan");
  });

  it("places images on pages of the image size, A4, or Letter", async () => {
    const wide = imageSource("wide", 1, 1);
    const sources = new Map([[wide.id, wide]]);
    const sizes = async (imagePageSize: "image" | "a4" | "letter") => {
      const doc = await PDFDocument.load(await buildPdf(sources, [ref("wide", 0, 90)], { imagePageSize }));
      const page = doc.getPage(0);
      return [Math.round(page.getWidth()), Math.round(page.getHeight()), page.getRotation().angle];
    };
    expect(await sizes("image")).toEqual([1, 1, 90]);
    expect(await sizes("a4")).toEqual([595, 842, 90]);
    expect(await sizes("letter")).toEqual([612, 792, 90]);
  });

  it("fails without pages or with a removed file", async () => {
    await expect(buildPdf(new Map(), [], { imagePageSize: "image" })).rejects.toThrow(/no pages/);
    await expect(buildPdf(new Map(), [ref("gone", 0)], { imagePageSize: "image" })).rejects.toThrow(/removed/);
  });
});

describe("parsePageRanges", () => {
  it("reads single pages, ranges, open ranges, and reverse ranges without duplicates", () => {
    expect(parsePageRanges("1-3, 5", 10)).toEqual({ pages: [0, 1, 2, 4] });
    expect(parsePageRanges("8-", 10)).toEqual({ pages: [7, 8, 9] });
    expect(parsePageRanges("-2", 10)).toEqual({ pages: [0, 1] });
    expect(parsePageRanges("3-1 2", 10)).toEqual({ pages: [2, 1, 0] });
  });

  it("reports invalid input", () => {
    expect(parsePageRanges("", 10)).toHaveProperty("error");
    expect(parsePageRanges("a", 10)).toMatchObject({ error: expect.stringMatching(/not a page/) });
    expect(parsePageRanges("11", 10)).toMatchObject({ error: "Page 11 does not exist. The document has 10 pages." });
    expect(parsePageRanges("0", 10)).toHaveProperty("error");
  });
});

describe("helpers", () => {
  it("normalizes rotations", () => {
    expect(rotate(0, -90)).toBe(270);
    expect(rotate(270, 90)).toBe(0);
    expect(rotate(90, 450)).toBe(180);
  });

  it("detects PDFs and reads JPEG orientation", () => {
    expect(isPdf(enc("%PDF-1.7"))).toBe(true);
    expect(isPdf(enc("junk\n%PDF-1.4"))).toBe(true);
    expect(isPdf(PNG)).toBe(false);
    // SOI, APP1 with Exif, a big-endian TIFF header, and one IFD entry: orientation 6.
    const exif = [0xff, 0xd8, 0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0xff, 0xd9];
    expect(jpegOrientation(Uint8Array.from(exif))).toBe(6);
    expect(jpegOrientation(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBe(1);
    expect(jpegOrientation(PNG)).toBe(1);
  });

  it("builds safe, sortable file names", () => {
    expect(baseName("Q3 report.final.pdf")).toBe("Q3 report.final");
    expect(baseName('a/b:c*?"<>|.pdf')).toBe("a_b_c_");
    expect(baseName(".pdf")).toBe("document");
    expect(numberedNames("doc", 3, "pdf")).toEqual(["doc-01.pdf", "doc-02.pdf", "doc-03.pdf"]);
    expect(numberedNames("doc", 120, "png")[0]).toBe("doc-001.png");
  });
});
