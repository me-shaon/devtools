import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  init: vi.fn(async () => {}),
  resize: vi.fn((_data: Uint8Array, _w: number, _h: number, ow: number, oh: number) => new Uint8ClampedArray(ow * oh * 4)),
  encodeWithWasm: vi.fn(async () => new Uint8Array([9, 9])),
}));

vi.mock("@jsquash/resize/lib/resize/pkg/squoosh_resize.js", () => ({ default: mocks.init, resize: mocks.resize }));
vi.mock("@/utils/wasm-encoders", () => ({ encodeWithWasm: mocks.encodeWithWasm }));

import { processPixels, resizePixels } from "@/utils/image-process";

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
});
