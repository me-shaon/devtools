/** Shared color domain types. */

export interface Color {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  hsv: { h: number; s: number; v: number };
  /** Opacity from 0 to 1. */
  alpha: number;
  name?: string;
}

export interface ColorPalette {
  primary: Color;
  palette: Color[];
  complementary?: Color;
  analogous?: Color[];
  triadic?: Color[];
  splitComplementary?: Color[];
}

export type Rgb = { r: number; g: number; b: number };
