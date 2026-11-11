import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveFile = vi.fn(async (_blob: Blob, _name: string) => true);
vi.mock("@/lib/desktop", () => ({ saveFile: (b: Blob, n: string) => saveFile(b, n) }));

// jsdom has no canvas, so rendering returns a placeholder image. The page count comes from the real PDF.
const rendered: { dpi: number; format: string }[] = [];
vi.mock("@/utils/pdf-render", () => ({
  openForRender: async (bytes: Uint8Array) => ({ numPages: (await PDFDocument.load(bytes)).getPageCount() }),
  renderPage: async (_doc: unknown, _index: number, options: { dpi: number; format: string }) => {
    rendered.push(options);
    return new Blob([new Uint8Array([1, 2, 3])], { type: `image/${options.format}` });
  },
  closeRender: () => {},
}));

import { PdfTools } from "@/components/tools/PdfTools";

URL.createObjectURL ??= () => "blob:thumb";
URL.revokeObjectURL ??= () => {};

async function pdfFile(name: string, widths: number[]): Promise<File> {
  const doc = await PDFDocument.create();
  widths.forEach((width) => doc.addPage([width, 400]));
  return new File([await doc.save()], name, { type: "application/pdf" });
}

const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

const blobBytes = (blob: Blob): Promise<Uint8Array> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });

const savedPdf = async (call = 0) => PDFDocument.load(await blobBytes(saveFile.mock.calls[call][0]));
const pageWidths = (doc: PDFDocument) => doc.getPages().map((page) => Math.round(page.getWidth()));

async function addFiles(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('#panel-pdf-tools input[type="file"], input[type="file"]')!;
  await act(async () => {
    fireEvent.change(input, { target: { files } });
  });
}

const pageList = () => screen.getByRole("list", { name: "Pages" });
const pageItems = () => within(pageList()).getAllByRole("listitem");

describe("PdfTools", () => {
  beforeEach(() => {
    saveFile.mockClear();
    rendered.length = 0;
  });

  it("merges files, reorders, rotates, and deletes pages, then saves a PDF", async () => {
    render(<PdfTools />);
    await addFiles([await pdfFile("a.pdf", [200, 210, 220]), await pdfFile("b.pdf", [300])]);
    await waitFor(() => expect(pageItems()).toHaveLength(4));
    expect(screen.getByRole("list", { name: "Files" })).toHaveTextContent("a.pdf");
    expect(screen.getByRole("list", { name: "Files" })).toHaveTextContent("3 pages");

    fireEvent.click(screen.getByRole("button", { name: "Move Page 4 earlier" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Page 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate Page 1 right" }));
    expect(pageItems()).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Save PDF" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(saveFile.mock.calls[0][1]).toBe("merged.pdf");
    const doc = await savedPdf();
    expect(pageWidths(doc)).toEqual([210, 300, 220]);
    expect(doc.getPages().map((page) => page.getRotation().angle)).toEqual([90, 0, 0]);
  });

  it("selects a page range and extracts, splits, and renders only those pages", async () => {
    render(<PdfTools />);
    await addFiles([await pdfFile("Report.pdf", [200, 210, 220, 230])]);
    await waitFor(() => expect(pageItems()).toHaveLength(4));

    const range = screen.getByLabelText("Select");
    fireEvent.change(range, { target: { value: "9" } });
    fireEvent.submit(range.closest("form")!);
    expect(screen.getByText("Page 9 does not exist. The document has 4 pages.")).toBeInTheDocument();

    fireEvent.change(range, { target: { value: "2-3" } });
    fireEvent.submit(range.closest("form")!);
    expect(screen.getByText("Actions use 2 pages")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save PDF" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(saveFile.mock.calls[0][1]).toBe("Report-extract.pdf");
    expect(pageWidths(await savedPdf())).toEqual([210, 220]);

    fireEvent.click(screen.getByRole("button", { name: "Split pages" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(2));
    expect(saveFile.mock.calls[1][1]).toBe("Report-pages.zip");
    const zip = unzipSync(await blobBytes(saveFile.mock.calls[1][0]));
    expect(Object.keys(zip)).toEqual(["Report-01.pdf", "Report-02.pdf"]);
    expect(pageWidths(await PDFDocument.load(zip["Report-02.pdf"]))).toEqual([220]);

    fireEvent.change(screen.getByLabelText("Image format"), { target: { value: "jpeg" } });
    fireEvent.change(screen.getByLabelText("Resolution"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as images" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(3));
    expect(saveFile.mock.calls[2][1]).toBe("Report-images.zip");
    expect(Object.keys(unzipSync(await blobBytes(saveFile.mock.calls[2][0])))).toEqual(["Report-01.jpg", "Report-02.jpg"]);
    expect(rendered.slice(-2)).toEqual([expect.objectContaining({ dpi: 300, format: "jpeg" }), expect.objectContaining({ dpi: 300, format: "jpeg" })]);

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByText("Actions use all pages")).toBeInTheDocument();
  });

  it("turns an image into an A4 page and rejects other files", async () => {
    render(<PdfTools />);
    await addFiles([new File([PNG], "dot.png", { type: "image/png" }), new File(["hello"], "notes.txt", { type: "text/plain" })]);
    await waitFor(() => expect(pageItems()).toHaveLength(1));

    fireEvent.change(screen.getByLabelText("Image page size"), { target: { value: "a4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save PDF" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(saveFile.mock.calls[0][1]).toBe("dot.pdf");
    expect(pageWidths(await savedPdf())).toEqual([595]);

    fireEvent.click(screen.getByRole("button", { name: "Remove dot.png" }));
    expect(screen.getByText("Pages appear here")).toBeInTheDocument();
  });
});
