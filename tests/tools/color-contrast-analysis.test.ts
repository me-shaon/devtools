import { describe, expect, it } from "vitest";
import {
  analyzeContrast,
  getContrastRatio,
  parseColor,
  suggestContrastColor,
  targetRatio,
} from "@/utils/color";

const color = (input: string) => parseColor(input)!;

describe("analyzeContrast", () => {
  it("reports 21:1 for black on white and passes every WCAG level", () => {
    const result = analyzeContrast(color("#000000"), color("#ffffff"));
    expect(result.ratio).toBe(21);
    expect(result.transparencyDisclosed).toBe(false);
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((check) => check.pass)).toBe(true);
  });

  it("reports a failing pair without hiding partial passes", () => {
    const result = analyzeContrast(color("#777777"), color("#ffffff"));
    expect(result.ratio).toBeCloseTo(4.478, 2);
    expect(result.checks.find((check) => check.target === "aa-normal")?.pass).toBe(false);
    expect(result.checks.find((check) => check.target === "aa-large")?.pass).toBe(true);
    expect(result.checks.find((check) => check.target === "aaa-normal")?.pass).toBe(false);
  });

  it("composites a translucent foreground and discloses it", () => {
    const result = analyzeContrast(color("rgba(0, 0, 0, 0.5)"), color("#ffffff"));
    expect(result.transparencyDisclosed).toBe(true);
    expect(result.foreground.alpha).toBe(1);
    expect(result.foreground.hex).toBe("#808080");
    expect(result.ratio).toBeGreaterThan(3);
    expect(result.ratio).toBeLessThan(4.5);
  });

  it("treats a translucent background as opaque and discloses it", () => {
    const result = analyzeContrast(color("#000000"), color("rgba(255, 255, 255, 0.5)"));
    expect(result.transparencyDisclosed).toBe(true);
    expect(result.background.alpha).toBe(1);
    expect(result.ratio).toBe(21);
  });

  it("agrees with the low-level contrast ratio", () => {
    const fg = color("#d32f2f");
    const bg = color("#ffffff");
    expect(analyzeContrast(fg, bg).ratio).toBe(getContrastRatio(fg, bg));
  });
});

describe("suggestContrastColor", () => {
  it("returns pass for a pair that already meets the target", () => {
    expect(suggestContrastColor(color("#000000"), color("#ffffff"), "aaa-normal")).toEqual({ status: "pass" });
  });

  it("suggests the closest foreground that meets AA normal", () => {
    const fg = color("#777777");
    const suggestion = suggestContrastColor(fg, color("#ffffff"), "aa-normal");
    expect(suggestion.status).toBe("suggested");
    if (suggestion.status !== "suggested") return;
    expect(suggestion.side).toBe("foreground");
    expect(suggestion.ratio).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(suggestion.color.hsl.l - fg.hsl.l)).toBeLessThanOrEqual(2);
    expect(analyzeContrast(suggestion.color, color("#ffffff")).ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("suggests a foreground that meets AAA normal", () => {
    const suggestion = suggestContrastColor(color("#777777"), color("#ffffff"), "aaa-normal");
    expect(suggestion.status).toBe("suggested");
    if (suggestion.status !== "suggested") return;
    expect(suggestion.ratio).toBeGreaterThanOrEqual(7);
    expect(analyzeContrast(suggestion.color, color("#ffffff")).ratio).toBeGreaterThanOrEqual(7);
  });

  it("changes the background when the foreground cannot reach the target", () => {
    const suggestion = suggestContrastColor(color("#000000"), color("#777777"), "aaa-normal");
    expect(suggestion.status).toBe("suggested");
    if (suggestion.status !== "suggested") return;
    expect(suggestion.side).toBe("background");
    expect(suggestion.ratio).toBeGreaterThanOrEqual(7);
  });

  it("reports an impossible target instead of a fake candidate", () => {
    expect(suggestContrastColor(color("rgba(0, 0, 0, 0)"), color("#ffffff"), "aa-normal")).toEqual({
      status: "impossible",
    });
  });

  it("exposes the target ratios", () => {
    expect(targetRatio("aa-normal")).toBe(4.5);
    expect(targetRatio("aa-large")).toBe(3);
    expect(targetRatio("aaa-normal")).toBe(7);
    expect(targetRatio("aaa-large")).toBe(4.5);
  });
});
