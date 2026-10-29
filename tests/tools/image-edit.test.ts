import { describe, it, expect } from "vitest";
import { imageEditSize, cropFromPoints } from "@/utils/image-edit";
describe("image edits", () => {
  const edits = {
    crop: { x: 0, y: 0, width: 200, height: 100 },
    width: 100,
    height: 50,
    rotation: 90,
    flipX: false,
    flipY: false,
  };
  it("swaps dimensions on quarter turns", () =>
    expect(imageEditSize(200, 100, edits)).toEqual({ width: 50, height: 100 }));
  it("rejects outside crops and giant canvases", () => {
    expect(() => imageEditSize(100, 100, edits)).toThrow(/Crop/);
    expect(() =>
      imageEditSize(200, 100, { ...edits, width: 16000, height: 16000 }),
    ).toThrow(/megapixels/);
  });
  it("maps reverse drag coordinates to bounded pixels", () =>
    expect(
      cropFromPoints({ x: 0.8, y: 0.8 }, { x: 0.2, y: 0.2 }, 100, 100),
    ).toEqual({ x: 20, y: 20, width: 60, height: 60 }));
});
