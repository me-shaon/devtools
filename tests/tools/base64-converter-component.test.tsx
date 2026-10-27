import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveFile = vi.fn(async (_blob: Blob, _name: string) => true);
vi.mock("@/lib/desktop", () => ({ saveFile: (b: Blob, n: string) => saveFile(b, n) }));

import { Base64Converter } from "@/components/tools/Base64Converter";

describe("Base64Converter", () => {
  beforeEach(() => saveFile.mockClear());

  it("encodes text as the user types", async () => {
    render(<Base64Converter />);
    fireEvent.change(screen.getByPlaceholderText("Enter text to encode to Base64..."), {
      target: { value: "hello" },
    });
    expect(await screen.findByDisplayValue("aGVsbG8=")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Encode to Base64/ })).toBeNull();
  });

  it("encodes URL-safe without padding", async () => {
    render(<Base64Converter />);
    fireEvent.click(screen.getByRole("switch", { name: /URL-safe/ }));
    fireEvent.change(screen.getByPlaceholderText("Enter text to encode to Base64..."), {
      target: { value: "???>>>a" },
    });
    expect(await screen.findByDisplayValue("Pz8_Pj4-YQ")).toBeInTheDocument();
  });

  it("encodes a file and shows an image preview with a data URI", async () => {
    render(<Base64Converter />);
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "a.png", {
      type: "image/png",
    });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    });
    await waitFor(() => expect(screen.getByDisplayValue("iVBORw==")).toBeInTheDocument());
    expect(screen.getByAltText("Preview of the selected file")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Data URI" }));
    expect(screen.getByDisplayValue("data:image/png;base64,iVBORw==")).toBeInTheDocument();
  });

  it("decodes live and reports invalid input inline", async () => {
    render(<Base64Converter />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Decode" }));
    const box = await screen.findByPlaceholderText(/Enter Base64 string/);
    fireEvent.change(box, { target: { value: "aGVsbG8=" } });
    expect(await screen.findByDisplayValue("hello")).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "***" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid Base64 format");
  });

  it("swaps the encoded result into the decoder", async () => {
    render(<Base64Converter />);
    fireEvent.change(screen.getByPlaceholderText("Enter text to encode to Base64..."), {
      target: { value: "hi" },
    });
    await screen.findByDisplayValue("aGk=");
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect(screen.getByPlaceholderText(/Enter Base64 string/)).toHaveValue("aGk=");
    expect(await screen.findByDisplayValue("hi")).toBeInTheDocument();
  });

  it("saves a decoded data URI as a file", async () => {
    render(<Base64Converter />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Decode" }));
    const box = await screen.findByPlaceholderText(/Enter Base64 string/);
    fireEvent.change(box, { target: { value: "data:text/plain;base64,aGk=" } });
    fireEvent.click(screen.getByRole("button", { name: /Save as file/ }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(saveFile.mock.calls[0][1]).toBe("decoded.txt");
  });
});
