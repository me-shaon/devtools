import { rgbToHwb, rgbToOklch, toByte } from "./convert";
import { colorName } from "./named-colors";
import type { Color } from "./types";

/** Round to at most `digits` decimals and drop trailing zeros. */
const fmt = (v: number, digits: number) => String(Number(v.toFixed(digits)));

/**
 * Format a color as copyable strings: HEX, RGB, HSL, HWB, OKLCH, HSV, and the CSS name when one matches.
 * Formats that support alpha include it when the color is not opaque.
 */
export function formatColor(color: Color): { label: string; value: string }[] {
  const { rgb, hsl, hsv, alpha } = color;
  const translucent = alpha < 1;
  const a = fmt(alpha, 2);
  const hwb = rgbToHwb(rgb.r, rgb.g, rgb.b);
  const ok = rgbToOklch(rgb.r, rgb.g, rgb.b);
  const hex = (color.hex + (translucent ? toByte(alpha).toString(16).padStart(2, "0") : "")).toUpperCase();
  const h = Math.round(hsl.h);
  const s = Math.round(hsl.s);
  const l = Math.round(hsl.l);
  const slashAlpha = translucent ? ` / ${a}` : "";

  const values = [
    { label: "HEX", value: hex },
    {
      label: "RGB",
      value: translucent ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})` : `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    },
    { label: "HSL", value: translucent ? `hsla(${h}, ${s}%, ${l}%, ${a})` : `hsl(${h}, ${s}%, ${l}%)` },
    {
      label: "HWB",
      value: `hwb(${Math.round(hwb.h)} ${Math.round(hwb.w)}% ${Math.round(hwb.b)}%${slashAlpha})`,
    },
    {
      label: "OKLCH",
      value: `oklch(${fmt(ok.l * 100, 1)}% ${fmt(ok.c, 3)} ${fmt(ok.h, 1)}${slashAlpha})`,
    },
    { label: "HSV", value: `hsv(${Math.round(hsv.h)}, ${Math.round(hsv.s)}%, ${Math.round(hsv.v)}%)` },
  ];
  const name = colorName(color);
  if (name) values.push({ label: "Name", value: name });
  return values;
}
