import { describe, it, expect } from "vitest";
import { gradientCss, colorAtPosition } from "@/utils/gradient";
describe("gradient", () => {
  it("sorts stops stably, preserves alpha and emits valid CSS", () =>
    expect(
      gradientCss("linear", 450, [
        { id: 1, color: "#ffffff80", position: 100 },
        { id: 2, color: "#000", position: 0 },
      ]),
    ).toBe("linear-gradient(90deg, #000000 0%, #FFFFFF80 100%)"));
  it("allows hard stops and radial gradients", () =>
    expect(
      gradientCss("radial", 0, [
        { id: 0, color: "red", position: 50 },
        { id: 1, color: "blue", position: 50 },
      ]),
    ).toContain("radial-gradient(circle at center,"));
  it("rejects invalid colors and positions", () =>
    expect(() =>
      gradientCss("linear", 0, [
        { id: 0, color: "invalid", position: 0 },
        { id: 1, color: "blue", position: 100 },
      ]),
    ).toThrow());
});

describe("colorAtPosition", () => {
  const stops = [
    { id: 0, color: "#000000", position: 0 },
    { id: 1, color: "#ffffff", position: 100 },
  ];
  it("mixes between two stops in sRGB", () => {
    expect(colorAtPosition(stops, 50)).toBe("#808080");
    expect(colorAtPosition(stops, 25)).toBe("#404040");
  });
  it("clamps to the nearest stop outside the range", () => {
    expect(colorAtPosition(stops, -10)).toBe("#000000");
    expect(colorAtPosition(stops, 200)).toBe("#ffffff");
  });
  it("sorts unsorted stops and ignores invalid colors", () => {
    const mixed = [
      { id: 1, color: "#ffffff", position: 100 },
      { id: 0, color: "not-a-color", position: 50 },
      { id: 2, color: "#000000", position: 0 },
    ];
    expect(colorAtPosition(mixed, 50)).toBe("#808080");
  });
  it("mixes alpha between translucent stops", () => {
    expect(
      colorAtPosition(
        [
          { id: 0, color: "#ff000000", position: 0 },
          { id: 1, color: "#ff0000", position: 100 },
        ],
        50,
      ),
    ).toBe("#ff000080");
  });
  it("falls back to gray when no stop parses", () => {
    expect(colorAtPosition([{ id: 0, color: "nope", position: 0 }], 40)).toBe("#808080");
    expect(colorAtPosition([], 40)).toBe("#808080");
  });
});
