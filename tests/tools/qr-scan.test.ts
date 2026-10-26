import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { getQrMatrix } from "@/utils/qr";

// Renders a QR matrix to RGBA pixels with a 4-module quiet zone, as a scanner would see it.
function renderMatrix(matrix: boolean[][], scale = 4, quietZone = 4) {
  const width = (matrix.length + quietZone * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const index = (((y + quietZone) * scale + dy) * width + (x + quietZone) * scale + dx) * 4;
          pixels.fill(0, index, index + 3);
        }
      }
    }),
  );
  return { pixels, width };
}

describe("getQrMatrix", () => {
  it.each([
    "hello",
    "https://example.com/path?query=1&other=two",
    "Unicode: éè 你好 🚀",
    "x".repeat(1000),
  ])("produces a code that a scanner decodes back to the input: %#", (text) => {
    const { pixels, width } = renderMatrix(getQrMatrix(text));
    expect(jsQR(pixels, width, width)?.data).toBe(text);
  });

  it("uses the standard QR sizes", () => {
    expect(getQrMatrix("hello").length).toBe(21);
    expect((getQrMatrix("x".repeat(1000)).length - 17) % 4).toBe(0);
  });

  it("rejects text that does not fit in a QR code", () => {
    expect(() => getQrMatrix("x".repeat(5000))).toThrow();
  });
});
