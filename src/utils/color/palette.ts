import { hslToRgb, normalizeHex } from "./convert";
import { makeColor } from "./model";
import { parseColor } from "./parse";
import type { Color, ColorPalette } from "./types";

export type PaletteMode = "tints" | "complementary" | "analogous" | "triadic" | "split-complementary" | "monochromatic";

export const PALETTE_MODES: PaletteMode[] = [
  "tints",
  "complementary",
  "analogous",
  "triadic",
  "split-complementary",
  "monochromatic",
];

const MAX_PALETTE_SWATCHES = 11;
const TINT_STEP = 10;
const TINT_STEPS = 5;
const MONOCHROMATIC_LIGHTNESS = [90, 75, 60, 45, 30, 15];

/** Generate complementary color. */
export function getComplementaryColor(color: Color): Color {
  const { h, s, l } = color.hsl;
  const newH = (h + 180) % 360;
  return makeColor(hslToRgb(newH, s, l), color.alpha);
}

/** Generate analogous colors. */
export function getAnalogousColors(color: Color, count = 3): Color[] {
  const { h, s, l } = color.hsl;
  const colors: Color[] = [];

  for (let i = 1; i <= count; i++) {
    const newH = (h + i * 30) % 360;
    colors.push(makeColor(hslToRgb(newH, s, l), color.alpha));
  }

  return colors;
}

/** Generate triadic colors. */
export function getTriadicColors(color: Color): Color[] {
  const { h, s, l } = color.hsl;
  const colors: Color[] = [];

  for (let i = 1; i <= 2; i++) {
    const newH = (h + i * 120) % 360;
    colors.push(makeColor(hslToRgb(newH, s, l), color.alpha));
  }

  return colors;
}

/** Generate split complementary colors. */
export function getSplitComplementaryColors(color: Color): Color[] {
  const { h, s, l } = color.hsl;

  return [makeColor(hslToRgb((h + 150) % 360, s, l), color.alpha), makeColor(hslToRgb((h + 210) % 360, s, l), color.alpha)];
}

/** Generate color palette from base color. */
export function generateColorPalette(baseColor: string): ColorPalette | null {
  const color = parseColor(baseColor);
  if (!color) return null;

  return {
    primary: color,
    palette: generateShades(color, 5),
    complementary: getComplementaryColor(color),
    analogous: getAnalogousColors(color, 2),
    triadic: getTriadicColors(color),
    splitComplementary: getSplitComplementaryColors(color),
  };
}

/** Generate shades of a color. */
export function generateShades(color: Color, count: number): Color[] {
  const { h, s } = color.hsl;
  const shades: Color[] = [];

  for (let i = 0; i < count; i++) {
    // Generate lightness from 20% to 80%
    const newL = 20 + (i / (count - 1)) * 60;
    shades.push(makeColor(hslToRgb(h, s, newL), color.alpha));
  }

  return shades;
}

/**
 * A base color followed by lighter and darker shades in 10% lightness steps.
 * Lightness clamps at 0 and 100, so steps that repeat a color (for example,
 * every tint of white) are skipped instead of producing duplicate swatches.
 * Returns null when the input is not a 3- or 6-digit hex color.
 */
export function generateShadePalette(input: string, count = 5): Color[] | null {
  const hex = normalizeHex(input);
  const base = hex ? parseColor(hex) : null;
  if (!base) return null;

  const h = Math.round(base.hsl.h);
  const s = Math.round(base.hsl.s);
  const l = Math.round(base.hsl.l);
  const seen = new Set([base.hex]);
  const palette = [base];

  const addShade = (lightness: number) => {
    const color = makeColor(hslToRgb(h, s, Math.max(0, Math.min(100, lightness))), base.alpha);
    if (seen.has(color.hex)) return;
    seen.add(color.hex);
    palette.push(color);
  };

  for (let i = 1; i <= count; i++) addShade(l + i * 10);
  for (let i = 1; i <= count; i++) addShade(l - i * 10);
  return palette;
}

/** Adjust color brightness. */
export function adjustBrightness(color: Color, percent: number): Color {
  const { h, s, l } = color.hsl;
  return makeColor(hslToRgb(h, s, Math.max(0, Math.min(100, l + percent))), color.alpha);
}

/** Adjust color saturation. */
export function adjustSaturation(color: Color, percent: number): Color {
  const { h, s, l } = color.hsl;
  return makeColor(hslToRgb(h, Math.max(0, Math.min(100, s + percent)), l), color.alpha);
}

const atLightness = (color: Color, lightness: number) => {
  const { h, s } = color.hsl;
  return makeColor(hslToRgb(Math.round(h), Math.round(s), Math.max(0, Math.min(100, lightness))), color.alpha);
};

const atHue = (color: Color, hue: number) => {
  const { s, l } = color.hsl;
  return makeColor(hslToRgb(((hue % 360) + 360) % 360, s, l), color.alpha);
};

const uniqueColors = (colors: Color[]) => {
  const seen = new Set<string>();
  return colors.filter((color) => {
    const key = `${color.hex}:${color.alpha}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Build a palette for the working color. The working color is always first, duplicate
 * values are removed, and the result never exceeds the display cap.
 */
export function buildPalette(color: Color, mode: PaletteMode): Color[] {
  const { h, l } = color.hsl;
  const base = [color];
  let colors: Color[];

  switch (mode) {
    case "complementary":
      colors = [...base, atHue(color, h + 180)];
      break;
    case "analogous":
      colors = [...base, atHue(color, h + 30), atHue(color, h - 30), atHue(color, h + 60), atHue(color, h - 60)];
      break;
    case "triadic":
      colors = [...base, atHue(color, h + 120), atHue(color, h + 240)];
      break;
    case "split-complementary":
      colors = [...base, atHue(color, h + 150), atHue(color, h + 210)];
      break;
    case "monochromatic":
      colors = [...base, ...MONOCHROMATIC_LIGHTNESS.map((lightness) => atLightness(color, lightness))];
      break;
    case "tints":
    default: {
      const roundedLightness = Math.round(l);
      colors = [
        ...base,
        ...Array.from({ length: TINT_STEPS }, (_, i) => atLightness(color, roundedLightness + (i + 1) * TINT_STEP)),
        ...Array.from({ length: TINT_STEPS }, (_, i) => atLightness(color, roundedLightness - (i + 1) * TINT_STEP)),
      ];
      break;
    }
  }

  return uniqueColors(colors).slice(0, MAX_PALETTE_SWATCHES);
}
