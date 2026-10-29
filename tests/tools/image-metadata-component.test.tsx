import { unzipSync } from "fflate";
import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveFile: vi.fn(),
  reencodeImage: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/desktop", () => ({ saveFile: mocks.saveFile }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
// jsdom has no canvas or image decoder, so the re-encode step is mocked. Inspection and lossless cleaning stay real.
vi.mock("@/utils/image-reencode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/image-reencode")>()),
  reencodeImage: mocks.reencodeImage,
}));

import { ImageMetadataCleaner } from "@/components/tools/ImageMetadataCleaner";

const latin = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const cat = (...parts: (Uint8Array | number[])[]) => {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((s, a) => s + a.length, 0));
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
};
const segment = (marker: number, payload: Uint8Array) => cat([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff], payload);

const AI_XMP =
  '<x:xmpmeta><rdf:Description Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></x:xmpmeta>';
const GPS_XMP = '<x:xmpmeta><rdf:Description exif:GPSLatitude="40,30.0N" exif:GPSLongitude="74,0.6W"/></x:xmpmeta>';
const XMP_ID = "http://ns.adobe.com/xap/1.0/\0";
const SCAN = cat(segment(0xc0, Uint8Array.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0])), segment(0xda, Uint8Array.from([1, 1, 0, 0, 0x3f, 0])), [1, 2, 3, 0xff, 0xd9]);

const jpeg = (xmp: string) =>
  cat([0xff, 0xd8], segment(0xe1, cat(latin(XMP_ID), latin(xmp))), segment(0xfe, latin("hello")), SCAN);
const PLAIN_JPEG = cat([0xff, 0xd8], SCAN);

const imageFile = (bytes: Uint8Array, name: string, type: string) => new File([bytes], name, { type });

const openFiles = (files: File[]) => {
  fireEvent.change(document.getElementById("image-metadata-file")!, { target: { files } });
};

const readBlob = (blob: Blob) =>
  new Promise<Uint8Array>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });

const contains = (hay: Uint8Array, needle: Uint8Array) => {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
};

afterEach(() => {
  mocks.saveFile.mockReset();
  mocks.reencodeImage.mockReset();
  mocks.toast.success.mockReset();
});

describe("ImageMetadataCleaner", () => {
  it("opens the file picker from the empty drop area", () => {
    const { container } = render(<ImageMetadataCleaner />);
    const input = container.querySelector<HTMLInputElement>("#image-metadata-file")!;
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: /Drop images here or click to open/ }));
    expect(click).toHaveBeenCalled();
  });

  it("lists images, flags AI and location, and skips unsupported formats", async () => {
    render(<ImageMetadataCleaner />);
    openFiles([
      imageFile(jpeg(AI_XMP), "art.jpg", "image/jpeg"),
      imageFile(jpeg(GPS_XMP), "trip.jpg", "image/jpeg"),
      imageFile(latin("GIF89a......"), "anim.gif", "image/gif"),
    ]);

    expect(await screen.findByText("2 images · 1 with AI metadata · 1 with location")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Only JPEG, PNG and WebP images are supported. Skipped: anim.gif.");
    const list = screen.getByRole("list", { name: "Opened images" });
    expect(within(list).getAllByText("AI")).toHaveLength(1);
    expect(screen.getByText("Created by generative AI (trainedAlgorithmicMedia)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI generation" })).toBeInTheDocument();
    expect(screen.getByText(/does not remove invisible watermarks/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show full value of XMP packet" }));
    expect((screen.getByRole("textbox", { name: "Full value of XMP packet" }) as HTMLTextAreaElement).value).toContain("trainedAlgorithmicMedia");

    fireEvent.click(within(list).getByText("trip.jpg"));
    expect(screen.getByText("Metadata in trip.jpg")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Location" })).toBeInTheDocument();
  });

  it("strips metadata losslessly and saves one clean copy", async () => {
    mocks.saveFile.mockResolvedValue(true);
    render(<ImageMetadataCleaner />);
    fireEvent.click(screen.getByLabelText("Preserve original quality"));
    expect(screen.getByText("Remove metadata only. Keeps the exact pixels and format with no recompression.")).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(screen.queryByLabelText("Quality")).not.toBeInTheDocument();

    openFiles([imageFile(jpeg(AI_XMP), "art.jpg", "image/jpeg")]);
    expect(await screen.findByText(/Removed 3 items · /)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clean 1 image" }));
    await waitFor(() => expect(mocks.saveFile).toHaveBeenCalledTimes(1));
    const [blob, name] = mocks.saveFile.mock.calls[0] as [Blob, string];
    expect(name).toBe("art-clean.jpg");
    const bytes = await readBlob(blob);
    expect(Array.from(bytes)).toEqual(Array.from(PLAIN_JPEG));
    expect(mocks.toast.success).toHaveBeenCalledWith("Saved art-clean.jpg.");
    expect(mocks.reencodeImage).not.toHaveBeenCalled();
    expect((await screen.findAllByText(/No metadata left/)).length).toBeGreaterThan(0);
  });

  it("re-encodes in the chosen format and saves several images as a ZIP", async () => {
    mocks.saveFile.mockResolvedValue(true);
    mocks.reencodeImage.mockResolvedValue(cat([0xff, 0xd8], SCAN));
    render(<ImageMetadataCleaner />);

    const jpg = screen.getByRole("radio", { name: /JPG/ });
    expect(jpg).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Quality")).toHaveValue("85");
    fireEvent.keyDown(jpg, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: /PNG/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByLabelText("Quality")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("radio", { name: /PNG/ }), { key: "End" });
    expect(screen.getByRole("radio", { name: /AVIF/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(screen.getByRole("radio", { name: /AVIF/ }), { key: "Home" });
    expect(jpg).toHaveAttribute("aria-checked", "true");

    openFiles([imageFile(jpeg(AI_XMP), "art.png", "image/jpeg"), imageFile(jpeg(GPS_XMP), "trip.jpg", "image/jpeg")]);
    fireEvent.click(await screen.findByRole("button", { name: "Clean 2 images" }));

    await waitFor(() => expect(mocks.saveFile).toHaveBeenCalledTimes(1));
    expect(mocks.reencodeImage).toHaveBeenCalledTimes(2);
    expect(mocks.reencodeImage).toHaveBeenCalledWith(expect.anything(), "jpeg", 85);
    const [blob, name] = mocks.saveFile.mock.calls[0] as [Blob, string];
    expect(name).toBe("clean-images.zip");
    const entries = unzipSync(await readBlob(blob));
    expect(Object.keys(entries).sort()).toEqual(["art-clean.jpg", "trip-clean.jpg"]);
    expect(mocks.toast.success).toHaveBeenCalledWith("Saved 2 clean images as a ZIP file.");
    expect((await screen.findAllByText(/JPG · .* → .* · No metadata left/)).length).toBe(3);
  });

  it("shows an inline error when re-encoding fails", async () => {
    mocks.reencodeImage.mockRejectedValue(new Error("Could not decode this image."));
    render(<ImageMetadataCleaner />);
    openFiles([imageFile(jpeg(AI_XMP), "art.jpg", "image/jpeg")]);
    fireEvent.click(await screen.findByRole("button", { name: "Clean 1 image" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("art.jpg: Could not decode this image.");
    expect(mocks.saveFile).not.toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("adds pasted images only while the tool is visible", async () => {
    const { container } = render(<section hidden><ImageMetadataCleaner /></section>);
    const paste = (file: File) => {
      const event = createEvent.paste(document);
      Object.defineProperty(event, "clipboardData", {
        value: { items: [{ kind: "file", type: file.type, getAsFile: () => file }], files: [] },
      });
      fireEvent(document, event);
      return event;
    };
    paste(imageFile(jpeg(AI_XMP), "", "image/jpeg"));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("list", { name: "Opened images" })).not.toBeInTheDocument();

    container.querySelector("section")!.hidden = false;
    const event = paste(imageFile(jpeg(AI_XMP), "", "image/jpeg"));
    expect(event.defaultPrevented).toBe(true);
    expect(await screen.findByText("pasted-image.jpg")).toBeInTheDocument();
  });

  it("warns about orientation only when Keep orientation is off", async () => {
    const tiff = cat([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]);
    const rotated = cat([0xff, 0xd8], segment(0xe1, cat(latin("Exif\0\0"), tiff)), SCAN);
    render(<ImageMetadataCleaner />);
    fireEvent.click(screen.getByLabelText("Preserve original quality"));
    openFiles([imageFile(rotated, "phone.jpg", "image/jpeg")]);
    expect(await screen.findByText("No removable metadata")).toBeInTheDocument();
    expect(screen.queryByText(/may show rotated/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Keep orientation"));
    expect(screen.getByText(/EXIF orientation 6. The clean copy may show rotated/)).toBeInTheDocument();
    expect(contains(rotated, latin("Exif"))).toBe(true);
  });
});
