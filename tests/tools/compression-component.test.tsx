import { gzipSync, deflateSync } from "node:zlib";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveFile = vi.fn(async (_blob: Blob, _name: string) => true);
vi.mock("@/lib/desktop", () => ({ saveFile: (b: Blob, n: string) => saveFile(b, n) }));

import { Compression } from "@/components/tools/Compression";

const gzipBase64 = (text: string) => gzipSync(Buffer.from(text)).toString("base64");

const readBlob = (blob: Blob) =>
  new Promise<Uint8Array>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });

describe("Compression", () => {
  beforeEach(() => saveFile.mockClear());

  it("decompresses gzip Base64 as the user types and says what it found", async () => {
    render(<Compression />);
    fireEvent.change(screen.getByLabelText("Compressed"), { target: { value: gzipBase64("hello from helm") } });
    await waitFor(() => expect(screen.getByLabelText("Text")).toHaveValue("hello from helm"));
    expect(screen.getByRole("status")).toHaveTextContent("GZIP from Base64");
  });

  it("decompresses zlib hex", async () => {
    render(<Compression />);
    const hex = deflateSync(Buffer.from("zlib text")).toString("hex");
    fireEvent.change(screen.getByLabelText("Compressed"), { target: { value: hex } });
    await waitFor(() => expect(screen.getByLabelText("Text")).toHaveValue("zlib text"));
    expect(screen.getByRole("status")).toHaveTextContent("zlib from hex");
  });

  it("decodes Kubernetes Secret data that wraps the Base64 twice", async () => {
    render(<Compression />);
    const twice = Buffer.from(gzipBase64('{"name":"release"}')).toString("base64");
    fireEvent.change(screen.getByLabelText("Compressed"), { target: { value: twice } });
    await waitFor(() => expect(screen.getByLabelText("Text")).toHaveValue('{"name":"release"}'));
    expect(screen.getByRole("status")).toHaveTextContent("Base64 twice");
  });

  it("reports corrupt input", async () => {
    render(<Compression />);
    fireEvent.change(screen.getByLabelText("Compressed"), { target: { value: "H4sIAAAAAAAAE8tIzcnJVyjP" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/not valid GZIP/);
  });

  it("shows hex for binary output and saves the bytes", async () => {
    render(<Compression />);
    const binary = gzipSync(Buffer.from([0xff, 0xfe, 0x00, 0x01])).toString("base64");
    fireEvent.change(screen.getByLabelText("Compressed"), { target: { value: binary } });
    await waitFor(() => expect(screen.getByLabelText("Hex")).toHaveValue("ff fe 00 01"));
    fireEvent.click(screen.getByRole("button", { name: "Save file" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(saveFile.mock.calls[0][1]).toBe("decompressed.bin");
    expect(Array.from(await readBlob(saveFile.mock.calls[0][0]))).toEqual([0xff, 0xfe, 0x00, 0x01]);
  });

  it("opens a .gz file and saves it without the extension", async () => {
    render(<Compression />);
    const file = new File([gzipSync(Buffer.from("log line"))], "app.log.gz");
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByLabelText("Text")).toHaveValue("log line"));
    expect(screen.getByText("app.log.gz")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save file" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(saveFile.mock.calls[0][1]).toBe("app.log");
  });

  it("compresses text to Base64 and hex, and the result decompresses back", async () => {
    render(<Compression />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Compress" }));
    fireEvent.change(await screen.findByLabelText("Text"), { target: { value: "round trip ".repeat(10) } });
    await waitFor(() => expect(String((screen.getByLabelText("Base64") as HTMLTextAreaElement).value)).toMatch(/^H4sI/));
    expect(screen.getByText(/% of original/)).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Hex" }));
    await waitFor(() => expect(String((screen.getByLabelText("Hex") as HTMLTextAreaElement).value)).toMatch(/^1f8b/));
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    await waitFor(() => expect(screen.getByLabelText("Text")).toHaveValue("round trip ".repeat(10)));
  });

  it("saves compressed text as a .gz file", async () => {
    render(<Compression />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Compress" }));
    fireEvent.change(await screen.findByLabelText("Text"), { target: { value: "save me" } });
    await waitFor(() => expect(String((screen.getByLabelText("Base64") as HTMLTextAreaElement).value)).toMatch(/^H4sI/));
    fireEvent.click(screen.getByRole("button", { name: "Save file" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(saveFile.mock.calls[0][1]).toBe("compressed.gz");
  });
});
