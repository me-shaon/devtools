import { rgbToHex, rgbToHsl, rgbToHsv } from "./convert";
import type { Color, Rgb } from "./types";

export function makeColor(rgb: Rgb, alpha = 1): Color {
  return {
    hex: rgbToHex(rgb.r, rgb.g, rgb.b),
    rgb,
    hsl: rgbToHsl(rgb.r, rgb.g, rgb.b),
    hsv: rgbToHsv(rgb.r, rgb.g, rgb.b),
    alpha,
  };
}

/** Return the same color with a different opacity. */
export function withAlpha(color: Color, alpha: number): Color {
  return { ...color, alpha: Math.max(0, Math.min(1, alpha)) };
}

/** Blend a translucent color over an opaque background, as a browser paints it. */
export function compositeOver(color: Color, background: Color): Color {
  const mix = (fg: number, bg: number) => Math.round(fg * color.alpha + bg * (1 - color.alpha));
  return makeColor({
    r: mix(color.rgb.r, background.rgb.r),
    g: mix(color.rgb.g, background.rgb.g),
    b: mix(color.rgb.b, background.rgb.b),
  });
}

/** The CSS value used for previews and storage. */
export function toCssColor(color: Color): string {
  return color.alpha < 1
    ? `rgba(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b}, ${color.alpha})`
    : color.hex;
}
