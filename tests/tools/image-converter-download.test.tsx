import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageConverter } from "@/components/tools/ImageConverter";

const mocks = vi.hoisted(() => ({
  saveFile: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/desktop", () => ({ saveFile: mocks.saveFile }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

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
    return { canvas: this, fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(compressedBlob()));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.saveFile.mockReset();
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

const compressSingleImage = async () => {
  render(<ImageConverter />);
  fireEvent.change(fileInputs()[0], { target: { files: [jpegFile("photo.jpg")] } });
  const download = await screen.findByRole("button", { name: "Download Image" });
  fireEvent.click(download);
};

describe("ImageConverter single download", () => {
  it("saves the compressed image", async () => {
    mocks.saveFile.mockResolvedValue(true);

    await compressSingleImage();

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Compressed image downloaded."));
    expect(mocks.saveFile).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^photo.*\.jpe?g$/));
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
