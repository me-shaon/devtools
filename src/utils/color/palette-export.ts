import { toCssColor } from "./model";
import type { Color } from "./types";

/** One custom property per swatch, in palette order. */
export function paletteToCss(colors: Color[]): string {
  const declarations = colors.map((color, index) => `  --color-${index + 1}: ${toCssColor(color)};`);
  return `:root {\n${declarations.join("\n")}\n}`;
}

/** One JSON entry per swatch with its token name and CSS value, in palette order. */
export function paletteToJson(colors: Color[]): string {
  const entries = colors.map((color, index) => ({ name: `--color-${index + 1}`, value: toCssColor(color) }));
  return JSON.stringify(entries, null, 2);
}
