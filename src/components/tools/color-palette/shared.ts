import type { Color } from "@/utils/color";

/** Default list: typical error, success, info, and warning colors. Red and green collide for deutans. */
export const DEFAULT_COMPARE = "#d32f2f, #388e3c, #1976d2, #f9a825";

/** A checkerboard under the color, so transparency is visible. */
export const swatchStyle = (css: string) => ({
  background: `linear-gradient(${css}, ${css}), repeating-conic-gradient(#d4d4d4 0 25%, #ffffff 0 50%) 0 0 / 16px 16px`,
});

/** Round down, so 4.499 never shows as a passing 4.50. */
export const formatRatio = (ratio: number) => `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;

export const swatchKey = (color: Color) => `${color.hex}:${color.alpha}`;
