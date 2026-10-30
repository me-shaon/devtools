import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColorPalette } from "@/components/tools/ColorPalette";

const behavior = { width: 2, height: 2, fail: false };

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = behavior.width;
  naturalHeight = behavior.height;

  set src(_value: string) {
    queueMicrotask(() => (behavior.fail ? this.onerror?.() : this.onload?.()));
  }
}

class MockImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

const putImageData = vi.fn();
let objectUrls = 0;

const file = (name: string, type = "image/png", size = 1024) => ({ name, type, size } as File);

const chooseFile = (input: File) => {
  const element = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(element, { target: { files: [input] } });
};

beforeEach(() => {
  localStorage.clear();
  behavior.width = 2;
  behavior.height = 2;
  behavior.fail = false;
  objectUrls = 0;
  putImageData.mockClear();
  vi.stubGlobal("Image", MockImage);
  vi.stubGlobal("ImageData", MockImageData);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
    getImageData: () => ({ width: 2, height: 2, data: new Uint8ClampedArray(16) }),
    putImageData,
  } as unknown as CanvasRenderingContext2D);
  vi.mocked(URL.createObjectURL).mockReset();
  vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:mock-${++objectUrls}`);
  vi.mocked(URL.revokeObjectURL).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CvdImage", () => {
  it("rejects a non-image file without decoding it", () => {
    render(<ColorPalette />);
    chooseFile(file("notes.txt", "text/plain"));
    expect(screen.getByText("Choose an image file, such as a PNG, JPEG, or WebP.")).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects an image above the byte limit", () => {
    render(<ColorPalette />);
    chooseFile(file("huge.png", "image/png", 20 * 1024 * 1024 + 1));
    expect(screen.getByText("This image is larger than 20 MB. Choose a smaller file.")).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects an image above the pixel limit and releases the URL", async () => {
    behavior.width = 10_000;
    behavior.height = 5_000;
    render(<ColorPalette />);
    chooseFile(file("giant.png"));
    expect(await screen.findByText(/too many pixels \(limit 40 megapixels\)/)).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("rejects an image without dimensions and releases the URL", async () => {
    behavior.width = 0;
    behavior.height = 0;
    render(<ColorPalette />);
    chooseFile(file("empty.png"));
    expect(await screen.findByText(/Cannot read this image/)).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("reports a decode failure", async () => {
    behavior.fail = true;
    render(<ColorPalette />);
    chooseFile(file("broken.png"));
    expect(await screen.findByText(/Cannot read this image/)).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("simulates a supported image and releases it on clear", async () => {
    render(<ColorPalette />);
    chooseFile(file("chart.png"));
    expect(await screen.findByAltText("Original chart.png")).toBeInTheDocument();
    await waitFor(() => expect(putImageData).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByAltText("Original chart.png")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("keeps the previous image when a replacement is rejected", async () => {
    render(<ColorPalette />);
    chooseFile(file("first.png"));
    await screen.findByAltText("Original first.png");

    chooseFile(file("second.txt", "text/plain"));
    expect(screen.getByText(/Choose an image file/)).toBeInTheDocument();
    expect(screen.getByAltText("Original first.png")).toBeInTheDocument();
  });

  it("releases the old URL when the image is replaced", async () => {
    render(<ColorPalette />);
    chooseFile(file("first.png"));
    await screen.findByAltText("Original first.png");
    chooseFile(file("second.png"));
    await screen.findByAltText("Original second.png");
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1"));
  });

  it("discards a load that finished after the image was replaced", async () => {
    const pending: (() => void)[] = [];
    class SlowImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 2;
      naturalHeight = 2;

      set src(_value: string) {
        pending.push(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", SlowImage);
    render(<ColorPalette />);
    chooseFile(file("slow.png"));
    chooseFile(file("fast.png"));
    // The first file's load lands after the second replaced it; it must not come back.
    pending[0]!();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1"));
    expect(screen.queryByAltText("Original slow.png")).toBeNull();
    expect(screen.queryByAltText("Original fast.png")).toBeNull();
  });
});
