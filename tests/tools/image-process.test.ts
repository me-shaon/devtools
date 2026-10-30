import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  init: vi.fn(async () => {}),
  resize: vi.fn((_data: Uint8Array, _w: number, _h: number, ow: number, oh: number) => new Uint8ClampedArray(ow * oh * 4)),
  encodeWithWasm: vi.fn(async () => new Uint8Array([9, 9])),
}));

vi.mock("@jsquash/resize/lib/resize/pkg/squoosh_resize.js", () => ({ default: mocks.init, resize: mocks.resize }));
vi.mock("@/utils/wasm-encoders", () => ({ encodeWithWasm: mocks.encodeWithWasm }));

import { processPixels, reducePalette, resizePixels } from "@/utils/image-process";

const image = () => ({ data: new Uint8ClampedArray(4 * 3 * 4), width: 4, height: 3 });

beforeEach(() => {
  mocks.resize.mockClear();
  mocks.encodeWithWasm.mockClear();
});

describe("image processing", () => {
  it("encodes without resizing when no resize is asked", async () => {
    const result = await processPixels(image(), { format: "webp", quality: 70 });
    expect(mocks.resize).not.toHaveBeenCalled();
    expect(mocks.encodeWithWasm).toHaveBeenCalledWith("webp", expect.objectContaining({ width: 4, height: 3 }), 70);
    expect(result).toEqual({ bytes: new Uint8Array([9, 9]), width: 4, height: 3 });
  });

  it("resizes with the chosen method and options, then encodes the new size", async () => {
    const result = await processPixels(image(), {
      format: "jpeg",
      quality: 80,
      resize: { width: 2, height: 1, method: "mitchell", premultiply: false, linearRgb: true },
    });
    // Mitchell is filter index 2 in the codec.
    expect(mocks.resize).toHaveBeenCalledWith(expect.any(Uint8Array), 4, 3, 2, 1, 2, false, true);
    expect(mocks.encodeWithWasm).toHaveBeenCalledWith("jpeg", expect.objectContaining({ width: 2, height: 1 }), 80);
    expect(result.width).toBe(2);
    expect(result.height).toBe(1);
  });

  it("skips the codec when the size does not change", async () => {
    const input = image();
    const output = await resizePixels(input, { width: 4, height: 3, method: "lanczos3", premultiply: true, linearRgb: true });
    expect(output).toBe(input);
    expect(mocks.resize).not.toHaveBeenCalled();
  });

  it("reduces the image to the asked number of colors", () => {
    // Four pixels: two reds and two blues that differ slightly.
    const data = new Uint8ClampedArray([250, 0, 0, 255, 240, 10, 0, 255, 0, 0, 250, 255, 10, 0, 240, 255]);
    const output = reducePalette({ data, width: 4, height: 1 }, { colors: 2, dither: false });
    const unique = new Set(Array.from({ length: 4 }, (_, i) => output.data.slice(i * 4, i * 4 + 4).join(",")));
    expect(unique.size).toBe(2);
    expect(output.width).toBe(4);
    // Each pixel keeps its side of the palette: red stays red, blue stays blue.
    expect(output.data[0]).toBeGreaterThan(output.data[2]);
    expect(output.data[10]).toBeGreaterThan(output.data[8]);
  });

  it("reduces the palette after the resize and before the encoder", async () => {
    await processPixels(image(), {
      format: "png",
      quality: 80,
      resize: { width: 2, height: 2, method: "lanczos3", premultiply: true, linearRgb: true },
      palette: { colors: 2, dither: true },
    });
    expect(mocks.resize).toHaveBeenCalled();
    expect(mocks.encodeWithWasm).toHaveBeenCalledWith("png", expect.objectContaining({ width: 2, height: 2 }), 80);
  });
});
