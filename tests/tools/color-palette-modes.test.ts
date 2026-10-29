import { describe, expect, it } from "vitest";
import { PALETTE_MODES, buildPalette, parseColor, type PaletteMode } from "@/utils/color";

const base = parseColor("#3b82f6")!;

const hues = (colors: { hsl: { h: number } }[]) => colors.map((color) => Math.round(color.hsl.h));

describe("buildPalette", () => {
  it("starts with the working color for every mode", () => {
    for (const mode of PALETTE_MODES) {
      expect(buildPalette(base, mode)[0]).toEqual(base);
    }
  });

  it("keeps the working color alpha on every swatch", () => {
    const translucent = parseColor("rgba(255, 0, 0, 0.5)")!;
    for (const mode of PALETTE_MODES) {
      expect(buildPalette(translucent, mode).every((color) => color.alpha === 0.5)).toBe(true);
    }
  });

  it("is deterministic", () => {
    for (const mode of PALETTE_MODES) {
      const first = buildPalette(base, mode).map((color) => color.hex);
      const second = buildPalette(base, mode).map((color) => color.hex);
      expect(second).toEqual(first);
    }
  });

  it("returns at most eleven distinct swatches", () => {
    for (const mode of PALETTE_MODES) {
      const palette = buildPalette(base, mode);
      const keys = palette.map((color) => `${color.hex}:${color.alpha}`);
      expect(palette.length).toBeLessThanOrEqual(11);
      expect(new Set(keys).size).toBe(palette.length);
    }
  });

  it("builds lighter and darker tints in order", () => {
    const palette = buildPalette(base, "tints");
    expect(palette).toHaveLength(10);
    expect(palette.map((color) => Math.round(color.hsl.l))).toEqual([60, 70, 80, 90, 100, 50, 40, 30, 20, 10]);
  });

  it("builds the complementary, triadic, and split-complementary hues", () => {
    expect(hues(buildPalette(base, "complementary"))).toEqual([217, 37]);
    expect(hues(buildPalette(base, "triadic"))).toEqual([217, 337, 97]);
    expect(hues(buildPalette(base, "split-complementary"))).toEqual([217, 7, 67]);
  });

  it("builds analogous hues on both sides of the working color", () => {
    expect(hues(buildPalette(base, "analogous"))).toEqual([217, 247, 187, 277, 157]);
  });

  it("builds a monochromatic lightness ladder", () => {
    const palette = buildPalette(base, "monochromatic");
    expect(palette.length).toBeLessThanOrEqual(7);
    for (const color of palette) {
      expect(Math.round(color.hsl.h)).toBe(217);
      expect(Math.round(color.hsl.s)).toBeGreaterThanOrEqual(89);
      expect(Math.round(color.hsl.s)).toBeLessThanOrEqual(93);
    }
  });

  it("handles black, white, and transparent without duplicates", () => {
    for (const input of ["#000000", "#ffffff", "transparent"]) {
      const color = parseColor(input)!;
      for (const mode of PALETTE_MODES) {
        const palette = buildPalette(color, mode);
        const keys = palette.map((item) => `${item.hex}:${item.alpha}`);
        expect(palette[0]).toEqual(color);
        expect(new Set(keys).size).toBe(palette.length);
      }
    }
  });

  it("accepts every declared mode", () => {
    const modes: PaletteMode[] = PALETTE_MODES;
    expect(modes).toHaveLength(6);
  });
});
