import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { ImageEditor } from "@/components/tools/ImageEditor";
import { ImageConverter } from "@/components/tools/ImageConverter";
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  draw: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  fill: vi.fn(),
}));
vi.mock("@/lib/desktop", () => ({ saveFile: mocks.save }));
class LoadedImage {
  naturalWidth = 200;
  naturalHeight = 100;
  onload: (() => void) | null = null;
  set src(_value: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}
beforeEach(() => {
  vi.stubGlobal("Image", LoadedImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return {
        canvas: this,
        translate: vi.fn(),
        rotate: mocks.rotate,
        scale: mocks.scale,
        drawImage: mocks.draw,
        fillRect: mocks.fill,
      } as unknown as CanvasRenderingContext2D;
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
    (type) => `data:${type ?? "image/png"};base64,`,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (cb, type) => cb(new Blob(["image"], { type })),
  );
  mocks.save.mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const load = async () => {
  render(<ImageEditor />);
  fireEvent.change(screen.getByLabelText("Image to edit"), {
    target: {
      files: [new File(["image"], "photo.png", { type: "image/png" })],
    },
  });
  await screen.findByLabelText("Output width");
  await waitFor(() =>
    expect(screen.getByText("Save edited image")).toBeEnabled(),
  );
};
it("resizes with aspect lock, rotates and exports the rendered blob", async () => {
  await load();
  fireEvent.change(screen.getByLabelText("Output width"), {
    target: { value: "100" },
  });
  expect(screen.getByLabelText("Output height")).toHaveValue(50);
  fireEvent.click(screen.getByText("Rotate right"));
  await waitFor(() =>
    expect(screen.getByText("Output · 50 × 100")).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByText("Save edited image"));
  expect(mocks.save).toHaveBeenCalledWith(expect.any(Blob), "photo-edited.png");
  expect(mocks.rotate).toHaveBeenLastCalledWith(Math.PI / 2);
});
it("keeps a typed output width when the crop changes with the lock on", async () => {
  await load();
  fireEvent.change(screen.getByLabelText("Output width"), {
    target: { value: "80" },
  });
  fireEvent.change(screen.getByLabelText("Crop width"), {
    target: { value: "100" },
  });
  expect(screen.getByLabelText("Output width")).toHaveValue(80);
  expect(screen.getByLabelText("Output height")).toHaveValue(80);
  expect(screen.getByLabelText("Resize percent")).toHaveValue(80);
  fireEvent.change(screen.getByLabelText("Resize percent"), {
    target: { value: "50" },
  });
  fireEvent.change(screen.getByLabelText("Crop width"), {
    target: { value: "200" },
  });
  expect(screen.getByLabelText("Output width")).toHaveValue(100);
  expect(screen.getByLabelText("Output height")).toHaveValue(50);
});
it("rejects outside crops and resets all edit dimensions", async () => {
  await load();
  fireEvent.change(screen.getByLabelText("Crop x"), {
    target: { value: "300" },
  });
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("inside"),
  );
  expect(screen.getByText("Save edited image")).toBeDisabled();
  fireEvent.click(screen.getByText("Reset edits"));
  await waitFor(() =>
    expect(screen.getByText("Save edited image")).toBeEnabled(),
  );
  expect(screen.getByLabelText("Crop x")).toHaveValue(0);
  expect(screen.getByLabelText("Output width")).toHaveValue(200);
});
it("flips before export and flattens JPEG transparency", async () => {
  await load();
  fireEvent.click(screen.getByText("Flip horizontal"));
  fireEvent.change(screen.getByLabelText("Edited image format"), {
    target: { value: "image/jpeg" },
  });
  await waitFor(() =>
    expect(screen.getByText("Save edited image")).toBeEnabled(),
  );
  expect(mocks.scale).toHaveBeenLastCalledWith(-1, 1);
  expect(mocks.fill).toHaveBeenCalled();
});
it("reports a save failure while retaining the original image", async () => {
  await load();
  mocks.save.mockRejectedValue(new Error("disk full"));
  fireEvent.click(screen.getByText("Save edited image"));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save"),
  );
  expect(
    screen.getByAltText("Original image for cropping"),
  ).toBeInTheDocument();
});
it("offers WebP only when the browser can encode it", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
    (type) =>
      type === "image/webp" ? "data:image/png;base64," : `data:${type};base64,`,
  );
  await load();
  const formats = Array.from(
    screen.getByLabelText<HTMLSelectElement>("Edited image format").options,
    (o) => o.textContent,
  );
  expect(formats).toEqual(["PNG", "JPEG"]);
});
it("opens from an Edit Image tab beside the single and bulk workflows", () => {
  render(<ImageConverter />);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Edit Image" }), {
    button: 0,
  });
  expect(screen.getByLabelText("Image to edit")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Bulk Compress" })).toBeInTheDocument();
});
