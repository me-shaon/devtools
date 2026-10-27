import QRCode from "qrcode";
import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImagePixels } from "@/utils/qr-reader";

const mocks = vi.hoisted(() => ({ readImagePixels: vi.fn() }));

// jsdom cannot load or draw images, so the pixels come from a generated code. Decoding stays real.
vi.mock("@/utils/qr-reader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/qr-reader")>()),
  readImagePixels: mocks.readImagePixels,
}));

import { QrReader } from "@/components/tools/QrReader";

function qrPixels(text: string, scale = 4): ImagePixels {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const quiet = 4;
  const width = (modules.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const row = Math.floor(y / scale) - quiet;
      const col = Math.floor(x / scale) - quiet;
      if (row >= 0 && col >= 0 && row < modules.size && col < modules.size && modules.get(row, col)) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  return { data, width, height: width };
}

const imageFile = (name = "code.png") => new File(["png"], name, { type: "image/png" });

const openFile = (file: File) => {
  const input = document.getElementById("qr-reader-file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
};

afterEach(() => {
  mocks.readImagePixels.mockReset();
});

describe("QrReader", () => {
  it("decodes a URL from an opened image and offers to open it", async () => {
    mocks.readImagePixels.mockResolvedValue(qrPixels("https://example.com/docs"));
    render(<QrReader />);
    openFile(imageFile());

    const output = (await screen.findByLabelText("Decoded text")) as HTMLTextAreaElement;
    expect(output.value).toBe("https://example.com/docs");
    expect(output).toHaveAttribute("readonly");
    expect(screen.getByTestId("qr-reader-kind")).toHaveTextContent("URL");
    const link = screen.getByRole("link", { name: "Open link" });
    expect(link).toHaveAttribute("href", "https://example.com/docs");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByTestId("qr-reader-outline")).toBeInTheDocument();
    expect(screen.getByAltText("Preview of the selected image")).toBeInTheDocument();
    expect(screen.getByText(/QR code found · URL/)).toBeInTheDocument();
  });

  it("splits a Wi-Fi code into rows", async () => {
    mocks.readImagePixels.mockResolvedValue(qrPixels("WIFI:S:Office;T:WPA;P:hunter22;;"));
    render(<QrReader />);
    openFile(imageFile());

    expect(await screen.findByTestId("qr-reader-kind")).toHaveTextContent("Wi-Fi network");
    expect(screen.getByText("Office")).toBeInTheDocument();
    expect(screen.getByText("hunter22")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy password" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("says so when the image has no QR code", async () => {
    mocks.readImagePixels.mockResolvedValue({ data: new Uint8ClampedArray(80 * 80 * 4).fill(255), width: 80, height: 80 });
    render(<QrReader />);
    openFile(imageFile("photo.png"));

    expect(await screen.findByRole("alert")).toHaveTextContent("No QR code found in this image");
    expect(screen.queryByLabelText("Decoded text")).not.toBeInTheDocument();
  });

  it("decodes a pasted image", async () => {
    mocks.readImagePixels.mockResolvedValue(qrPixels("pasted text"));
    render(<QrReader />);
    const file = imageFile("");
    const paste = createEvent.paste(document);
    Object.defineProperty(paste, "clipboardData", {
      value: { items: [{ kind: "file", type: "image/png", getAsFile: () => file }], files: [] },
    });
    fireEvent(document, paste);

    const output = (await screen.findByLabelText("Decoded text")) as HTMLTextAreaElement;
    expect(output.value).toBe("pasted text");
    expect(paste.defaultPrevented).toBe(true);
    expect(screen.getByText("Pasted image")).toBeInTheDocument();
    expect(screen.getByTestId("qr-reader-kind")).toHaveTextContent("Plain text");
  });

  it("decodes a dropped image and ignores pastes while the tool is hidden", async () => {
    mocks.readImagePixels.mockResolvedValue(qrPixels("tel:+15550100"));
    const { container } = render(<section hidden><QrReader /></section>);
    const paste = createEvent.paste(document);
    Object.defineProperty(paste, "clipboardData", {
      value: { items: [{ kind: "file", type: "image/png", getAsFile: () => imageFile() }], files: [] },
    });
    fireEvent(document, paste);
    expect(mocks.readImagePixels).not.toHaveBeenCalled();

    container.querySelector("section")!.hidden = false;
    fireEvent.drop(screen.getByTestId("qr-reader-drop"), {
      dataTransfer: { items: [], files: [imageFile()], types: ["Files"] },
    });
    await waitFor(() => expect(screen.getByTestId("qr-reader-kind")).toHaveTextContent("Phone number"));
    expect(screen.getByText("+15550100")).toBeInTheDocument();
  });
});
