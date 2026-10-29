import { describe, it, expect } from "vitest";
import { gradientCss } from "@/utils/gradient";
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
