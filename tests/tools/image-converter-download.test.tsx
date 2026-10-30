import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageConverter } from "@/components/tools/ImageConverter";

const mocks = vi.hoisted(() => ({
  saveFile: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  encodeWithWasm: vi.fn(),
}));

vi.mock("@/lib/desktop", () => ({ saveFile: mocks.saveFile }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/utils/wasm-encoders", () => ({ encodeWithWasm: mocks.encodeWithWasm }));

// jsdom cannot decode or encode images, so stub the image and canvas steps.
class LoadedImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 4;
  naturalHeight = 4;
  width = 4;
  height = 4;

  set src(_value: string) {
    setTimeout(() => this.onload?.());
  }
}

const compressedBlob = () => {
  const blob = new Blob(["compressed"], { type: "image/jpeg" });
  // jsdom's Blob has no arrayBuffer(), which the ZIP step needs.
  Object.defineProperty(blob, "arrayBuffer", {
    value: async () => new TextEncoder().encode("compressed").buffer,
  });
  return blob;
};

const jpegFile = (name: string) => new File(["original image data"], name, { type: "image/jpeg" });

const fileInputs = () => document.querySelectorAll<HTMLInputElement>('input[type="file"]');

beforeEach(() => {
  vi.stubGlobal("Image", LoadedImage);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return {
      canvas: this,
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(64), width: 4, height: 4 }),
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(compressedBlob()));
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.encodeWithWasm.mockResolvedValue(new TextEncoder().encode("compressed"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.saveFile.mockReset();
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
  mocks.encodeWithWasm.mockReset();
});

const compressSingleImage = async () => {
  render(<ImageConverter />);
  fireEvent.change(fileInputs()[0], { target: { files: [jpegFile("photo.jpg")] } });
  const download = await screen.findByRole("button", { name: "Download Image" });
  await waitFor(() => expect(download).toBeEnabled());
  fireEvent.click(download);
};

describe("ImageConverter single download", () => {
  it("saves the compressed image", async () => {
    mocks.saveFile.mockResolvedValue(true);

    await compressSingleImage();

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Compressed image downloaded."));
    expect(mocks.saveFile).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^photo.*\.jpe?g$/));
    // JPEG output goes through MozJPEG, not the browser encoder.
    expect(mocks.encodeWithWasm).toHaveBeenCalledWith("jpeg", expect.objectContaining({ width: 4, height: 4 }), 82);
    expect((mocks.saveFile.mock.calls[0][0] as Blob).type).toBe("image/jpeg");
  });

  it("shows nothing when the user cancels the save dialog", async () => {
    mocks.saveFile.mockResolvedValue(false);

    await compressSingleImage();

    await waitFor(() => expect(mocks.saveFile).toHaveBeenCalled());
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("shows an error when the save fails", async () => {
    mocks.saveFile.mockRejectedValue(new Error("disk full"));

    await compressSingleImage();

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith("Unable to save the compressed image."),
    );
  });
});

describe("ImageConverter WebP output", () => {
  it("encodes WebP with WASM when the web view writes PNG instead", async () => {
    // The macOS web view ignores image/webp in toBlob and returns a PNG.
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(new Blob(["png bytes"], { type: "image/png" })),
    );
    mocks.encodeWithWasm.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mocks.saveFile.mockResolvedValue(true);

    render(<ImageConverter />);
    fireEvent.change(fileInputs()[0], { target: { files: [new File(["webp"], "banner.webp", { type: "image/webp" })] } });
    const download = await screen.findByRole("button", { name: "Download Image" });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);

    await waitFor(() => expect(mocks.saveFile).toHaveBeenCalled());
    expect(mocks.encodeWithWasm).toHaveBeenCalledWith("webp", expect.objectContaining({ width: 4, height: 4 }), expect.any(Number));
    const [blob, name] = mocks.saveFile.mock.calls[0] as [Blob, string];
    expect(blob.type).toBe("image/webp");
    expect(blob.size).toBe(3);
    expect(name).toBe("banner.webp");
  });
});

describe("ImageConverter bulk download", () => {
  const compressBulkImages = async () => {
    render(<ImageConverter />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Bulk Compress" }), { button: 0 });
    await waitFor(() => expect(fileInputs()).toHaveLength(1));
    fireEvent.change(fileInputs()[0], { target: { files: [jpegFile("a.jpg"), jpegFile("a.jpg")] } });
    const download = await screen.findByRole("button", { name: "Download ZIP" });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
  };

  it("saves one ZIP with unique file names", async () => {
    mocks.saveFile.mockResolvedValue(true);

    await compressBulkImages();

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("ZIP download is ready."));
    const [zip, name] = mocks.saveFile.mock.calls[0];
    expect(name).toBe("compressed-images.zip");
    expect(zip.type).toBe("application/zip");
  });

  it("shows an error when the ZIP cannot be saved", async () => {
    mocks.saveFile.mockRejectedValue(new Error("disk full"));

    await compressBulkImages();

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Unable to save the ZIP file."));
  });
});
