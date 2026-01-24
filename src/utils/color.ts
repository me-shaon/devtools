/**
 * Color Palette utility functions
 */

export interface Color {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  hsv: { h: number; s: number; v: number };
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

/**
 * Parse hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Convert RGB to hex
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360;
  s /= 100;
  l /= 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/**
 * Convert RGB to HSV
 */
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const v = max;
  const d = max - min;
  const s = max === 0 ? 0 : d / max;

  if (max !== min) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, v: v * 100 };
}

/**
 * Parse color string to Color object
 */
export function parseColor(color: string): Color | null {
  let hex = color;
  let rgb: { r: number; g: number; b: number } | null = null;

  // Handle hex
  if (color.startsWith('#')) {
    rgb = hexToRgb(color);
  }
  // Handle rgb()
  else if (color.startsWith('rgb')) {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      rgb = { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
      hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    }
  }

  if (!rgb) return null;

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

  return { hex, rgb, hsl, hsv };
}

/**
 * Generate complementary color
 */
export function getComplementaryColor(color: Color): Color {
  const { h, s, l } = color.hsl;
  const newH = (h + 180) % 360;
  const rgb = hslToRgb(newH, s, l);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

  return parseColor(hex)!;
}

/**
 * Generate analogous colors
 */
export function getAnalogousColors(color: Color, count = 3): Color[] {
  const { h, s, l } = color.hsl;
  const colors: Color[] = [];

  for (let i = 1; i <= count; i++) {
    const newH = (h + i * 30) % 360;
    const rgb = hslToRgb(newH, s, l);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    colors.push(parseColor(hex)!);
  }

  return colors;
}

/**
 * Generate triadic colors
 */
export function getTriadicColors(color: Color): Color[] {
  const { h, s, l } = color.hsl;
  const colors: Color[] = [];

  for (let i = 1; i <= 2; i++) {
    const newH = (h + i * 120) % 360;
    const rgb = hslToRgb(newH, s, l);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    colors.push(parseColor(hex)!);
  }

  return colors;
}

/**
 * Generate split complementary colors
 */
export function getSplitComplementaryColors(color: Color): Color[] {
  const { h, s, l } = color.hsl;
  const colors: Color[] = [];

  const hue1 = (h + 150) % 360;
  const hue2 = (h + 210) % 360;

  const rgb1 = hslToRgb(hue1, s, l);
  const rgb2 = hslToRgb(hue2, s, l);

  colors.push(parseColor(rgbToHex(rgb1.r, rgb1.g, rgb1.b))!);
  colors.push(parseColor(rgbToHex(rgb2.r, rgb2.g, rgb2.b))!);

  return colors;
}

/**
 * Generate color palette from base color
 */
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

/**
 * Generate shades of a color
 */
export function generateShades(color: Color, count: number): Color[] {
  const { h, s, l } = color.hsl;
  const shades: Color[] = [];

  for (let i = 0; i < count; i++) {
    // Generate lightness from 20% to 80%
    const newL = 20 + (i / (count - 1)) * 60;
    const rgb = hslToRgb(h, s, newL);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    shades.push(parseColor(hex)!);
  }

  return shades;
}

/**
 * Adjust color brightness
 */
export function adjustBrightness(color: Color, percent: number): Color {
  const { h, s, l } = color.hsl;
  const newL = Math.max(0, Math.min(100, l + percent));
  const rgb = hslToRgb(h, s, newL);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  return parseColor(hex)!;
}

/**
 * Adjust color saturation
 */
export function adjustSaturation(color: Color, percent: number): Color {
  const { h, s, l } = color.hsl;
  const newS = Math.max(0, Math.min(100, s + percent));
  const rgb = hslToRgb(h, newS, l);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  return parseColor(hex)!;
}

/**
 * Get color contrast ratio (for accessibility)
 */
export function getContrastRatio(color1: Color, color2: Color): number {
  const getLuminance = (color: Color) => {
    const { r, g, b } = color.rgb;
    const [rs, gs, bs] = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if color combination meets WCAG AA standard
 */
export function meetsWCAAALarge(color1: Color, color2: Color): boolean {
  return getContrastRatio(color1, color2) >= 3;
}

export function meetsWCAAANormal(color1: Color, color2: Color): boolean {
  return getContrastRatio(color1, color2) >= 4.5;
}
