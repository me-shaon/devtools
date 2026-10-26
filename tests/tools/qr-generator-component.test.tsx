import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QrGenerator } from "@/components/tools/QrGenerator";

const mocks = vi.hoisted(() => ({
  saveFile: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/desktop", () => ({ saveFile: mocks.saveFile }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

const pngBlob = new Blob(["png"], { type: "image/png" });

const renderAndDownload = () => {
  render(<QrGenerator />);
  fireEvent.change(screen.getByLabelText("Text or URL"), { target: { value: "https://example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Download QR Code" }));
};

beforeEach(() => {
  // The Radix slider measures itself with ResizeObserver, which jsdom lacks.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(pngBlob));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.saveFile.mockReset();
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("QrGenerator download", () => {
  it("saves the PNG and confirms the download", async () => {
    mocks.saveFile.mockResolvedValue(true);

    renderAndDownload();

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("QR code downloaded!"));
    expect(mocks.saveFile).toHaveBeenCalledWith(pngBlob, expect.stringMatching(/^qr-code-\d+\.png$/));
  });

  it("shows nothing when the user cancels the save dialog", async () => {
    mocks.saveFile.mockResolvedValue(false);

    renderAndDownload();

    await waitFor(() => expect(mocks.saveFile).toHaveBeenCalled());
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("shows an error when the save fails", async () => {
    mocks.saveFile.mockRejectedValue(new Error("disk full"));

    renderAndDownload();

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Unable to save the QR code."));
  });

  it("shows an error when the canvas cannot create an image", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));

    renderAndDownload();

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith("Unable to create the QR code image."),
    );
    expect(mocks.saveFile).not.toHaveBeenCalled();
  });
});
