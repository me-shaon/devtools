import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { QrGenerator } from "@/components/tools/QrGenerator";

const mocks = vi.hoisted(() => ({
  saveFile: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/desktop", () => ({ saveFile: mocks.saveFile }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

const pngBlob = new Blob(["png"], { type: "image/png" });

const enterText = (value: string) => fireEvent.change(screen.getByLabelText("Text or URL"), { target: { value } });

const renderWithText = async (value = "https://example.com") => {
  render(<QrGenerator />);
  enterText(value);
  return screen.findByRole("button", { name: "Save PNG" });
};

const chooseTemplate = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }));

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

describe("QrGenerator save", () => {
  it("saves the PNG and confirms the save", async () => {
    mocks.saveFile.mockResolvedValue(true);

    fireEvent.click(await renderWithText());

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("QR code saved."));
    expect(mocks.saveFile).toHaveBeenCalledWith(pngBlob, expect.stringMatching(/^qr-code-\d+\.png$/));
  });

  it("shows nothing when the user cancels the save dialog", async () => {
    mocks.saveFile.mockResolvedValue(false);

    fireEvent.click(await renderWithText());

    await waitFor(() => expect(mocks.saveFile).toHaveBeenCalled());
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("shows an error when the save fails", async () => {
    mocks.saveFile.mockRejectedValue(new Error("disk full"));

    fireEvent.click(await renderWithText());

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Unable to save the QR code."));
  });

  it("shows an error when the canvas cannot create an image", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));

    fireEvent.click(await renderWithText());

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Unable to create the QR code image."));
    expect(mocks.saveFile).not.toHaveBeenCalled();
  });

  it("saves an SVG", async () => {
    mocks.saveFile.mockResolvedValue(true);
    await renderWithText();

    fireEvent.click(screen.getByRole("button", { name: "Save SVG" }));

    await waitFor(() => expect(mocks.saveFile).toHaveBeenCalled());
    const [blob, name] = mocks.saveFile.mock.calls[0];
    expect(name).toMatch(/^qr-code-\d+\.svg$/);
    expect((blob as Blob).type).toBe("image/svg+xml");
    const svg = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob as Blob);
    });
    expect(svg).toContain("<svg");
  });
});

describe("QrGenerator copy image", () => {
  it("hides the button when the clipboard cannot hold images", async () => {
    await renderWithText();
    expect(screen.queryByRole("button", { name: /copy image/i })).not.toBeInTheDocument();
  });

  it("writes a PNG to the clipboard", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", class {
      constructor(public items: Record<string, Promise<Blob>>) {}
    });
    const clipboard = navigator.clipboard as Omit<Clipboard, "write"> & { write?: typeof write };
    clipboard.write = write;
    onTestFinished(() => {
      delete clipboard.write;
    });

    await renderWithText();
    fireEvent.click(screen.getByRole("button", { name: /copy image/i }));

    await waitFor(() => expect(write).toHaveBeenCalled());
    const [item] = write.mock.calls[0][0];
    expect(await item.items["image/png"]).toBe(pngBlob);
    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
  });
});

describe("QrGenerator content", () => {
  it("shows an empty state until there is content", () => {
    render(<QrGenerator />);
    expect(screen.getByText("The QR code appears here")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save PNG" })).not.toBeInTheDocument();
  });

  it("shows the version and the error correction level", async () => {
    await renderWithText("hello");
    expect(screen.getByText("Level M")).toBeInTheDocument();
    expect(screen.getByText(/Version 1 · 21 × 21 modules/)).toBeInTheDocument();
  });

  it("uses the error correction level the user chooses", async () => {
    await renderWithText("hello");
    fireEvent.change(screen.getByLabelText("Error correction"), { target: { value: "H" } });
    expect(await screen.findByText("Level H")).toBeInTheDocument();
  });

  it("reports content that is too long", async () => {
    render(<QrGenerator />);
    enterText("a".repeat(3000));
    expect(await screen.findByRole("alert")).toHaveTextContent("This content is too long for a QR code.");
  });

  it("builds a Wi-Fi payload with escaped values", async () => {
    render(<QrGenerator />);
    chooseTemplate("Wi-Fi");
    fireEvent.change(screen.getByLabelText("Network name (SSID)"), { target: { value: "Cafe;Guest" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "p:w" } });

    expect(screen.getByLabelText("Payload")).toHaveValue("WIFI:T:WPA;S:Cafe\\;Guest;P:p\\:w;;");
    expect(await screen.findByRole("button", { name: "Save PNG" })).toBeInTheDocument();
  });

  it("hides the password for an open network", () => {
    render(<QrGenerator />);
    chooseTemplate("Wi-Fi");
    fireEvent.change(screen.getByLabelText("Security"), { target: { value: "nopass" } });
    fireEvent.change(screen.getByLabelText("Network name (SSID)"), { target: { value: "Open" } });

    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Payload")).toHaveValue("WIFI:T:nopass;S:Open;;");
  });

  it("keeps each form's values when the user switches type", () => {
    render(<QrGenerator />);
    enterText("kept");
    chooseTemplate("Phone");
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+1 (555) 0100" } });
    expect(screen.getByLabelText("Payload")).toHaveValue("tel:+15550100");
    chooseTemplate("Text");
    expect(screen.getByLabelText("Text or URL")).toHaveValue("kept");
  });

  it("shows a validation error for a location", () => {
    render(<QrGenerator />);
    chooseTemplate("Location");
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "95" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "10" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a latitude from -90 to 90.");
  });

  it("builds a calendar event", () => {
    render(<QrGenerator />);
    chooseTemplate("Event");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Demo" } });
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "2026-11-02T14:00" } });
    expect(screen.getByLabelText("Payload")).toHaveValue(
      // A text area shows CRLF line breaks as LF.
      "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Demo\nDTSTART:20261102T140000\nEND:VEVENT\nEND:VCALENDAR",
    );
  });
});

describe("QrGenerator logo", () => {
  it("raises Auto to level H when a logo is added", async () => {
    await renderWithText("hello");
    const file = new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "logo.svg", { type: "image/svg+xml" });
    fireEvent.change(screen.getByTestId("qr-logo-input"), { target: { files: [file] } });

    expect(await screen.findByText("Level H")).toBeInTheDocument();
    expect(screen.getByText("logo.svg")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove logo" }));
    expect(await screen.findByText("Level M")).toBeInTheDocument();
  });

  it("warns when a logo is used with a low level", async () => {
    await renderWithText("hello");
    fireEvent.change(screen.getByLabelText("Error correction"), { target: { value: "L" } });
    const file = new File(["x"], "logo.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("qr-logo-input"), { target: { files: [file] } });

    expect(await screen.findByText(/Use level Q or H/)).toBeInTheDocument();
  });

  it("rejects a file that is not an image", async () => {
    render(<QrGenerator />);
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByTestId("qr-logo-input"), { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose an image file for the logo");
  });
});
