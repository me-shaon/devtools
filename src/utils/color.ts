/**
 * Color Palette utility functions
 */

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
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
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
export function parseColor(input: string): Color | null {
  const parsed = parseCssColor(input.trim());
  if (!parsed) return null;
  return makeColor(parsed.rgb, parsed.alpha);
}

type Rgb = { r: number; g: number; b: number };

function makeColor(rgb: Rgb, alpha = 1): Color {
  return {
    hex: rgbToHex(rgb.r, rgb.g, rgb.b),
    rgb,
    hsl: rgbToHsl(rgb.r, rgb.g, rgb.b),
    hsv: rgbToHsv(rgb.r, rgb.g, rgb.b),
    alpha,
  };
}

/** The CSS named colors, packed as "name:rrggbb" pairs. */
const NAMED_COLORS: Record<string, string> = Object.fromEntries(
  (
    'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 ' +
    'black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 ' +
    'chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff ' +
    'darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 ' +
    'darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 ' +
    'darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f ' +
    'darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 ' +
    'dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ' +
    'ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 ' +
    'honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa ' +
    'lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff ' +
    'lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 ' +
    'lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 ' +
    'lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 ' +
    'mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 ' +
    'mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 ' +
    'midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 ' +
    'oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa ' +
    'palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f ' +
    'pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f ' +
    'royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee ' +
    'sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa ' +
    'springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 ' +
    'violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32'
  )
    .split(' ')
    .map((pair) => pair.split(':') as [string, string]),
);

/** The first CSS name for each hex value, so aqua wins over cyan and gray over grey. */
const NAMES_BY_HEX = new Map<string, string>();
for (const [name, hex] of Object.entries(NAMED_COLORS)) {
  if (!NAMES_BY_HEX.has(hex)) NAMES_BY_HEX.set(hex, name);
}

/** Return the CSS color name for an opaque color, or null when no name matches exactly. */
export function colorName(color: Color): string | null {
  if (color.alpha < 1) return null;
  return NAMES_BY_HEX.get(color.hex.slice(1).toLowerCase()) ?? null;
}

/** Parse a number with an optional unit. Returns null for anything else. */
function parseNumberToken(token: string): { value: number; unit: string } | null {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|rad|grad|turn)?$/i.exec(token);
  return match ? { value: parseFloat(match[1]), unit: (match[2] ?? '').toLowerCase() } : null;
}

/** Read a hue in degrees from a number or an angle with a unit. */
function parseHue(token: string): number | null {
  const n = parseNumberToken(token);
  if (!n || n.unit === '%') return null;
  const factor: Record<string, number> = { '': 1, deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360 };
  return (((n.value * factor[n.unit]) % 360) + 360) % 360;
}

/** Read a value that is either a plain number or a percentage of `percentScale`. */
function parseScaled(token: string, percentScale: number): number | null {
  const n = parseNumberToken(token);
  if (!n || (n.unit && n.unit !== '%')) return null;
  return n.unit === '%' ? (n.value / 100) * percentScale : n.value;
}

/** Read a percentage, also accepting a bare number as modern CSS does. Returns 0 to 100. */
function parsePercent(token: string): number | null {
  const n = parseNumberToken(token);
  if (!n || (n.unit && n.unit !== '%')) return null;
  return n.value;
}

function parseAlpha(token: string | undefined): number | null {
  if (token === undefined) return 1;
  const value = parseScaled(token, 1);
  return value === null ? null : Math.max(0, Math.min(1, value));
}

/**
 * Split the arguments of a CSS color function. Accepts the legacy comma form
 * ("59, 130, 246, 0.5") and the modern space form ("59 130 246 / 50%").
 */
function splitArgs(body: string): { channels: string[]; alpha?: string } | null {
  const text = body.trim();
  if (text.includes(',')) {
    const parts = text.split(',').map((p) => p.trim());
    if (parts.length < 3 || parts.length > 4 || parts.some((p) => !p)) return null;
    return { channels: parts.slice(0, 3), alpha: parts[3] };
  }
  const [main, alpha, extra] = text.split('/').map((p) => p.trim());
  if (extra !== undefined || alpha === '') return null;
  const channels = main.split(/\s+/);
  if (channels.length !== 3) return null;
  return { channels, alpha };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const toByte = (v: number) => Math.round(clamp01(v) * 255);

/**
 * Parse any sRGB CSS color: hex (3, 4, 6 or 8 digits), rgb(), rgba(), hsl(),
 * hsla(), hwb(), oklch(), oklab(), a named color, or transparent.
 * OKLCH and OKLAB colors outside sRGB are clipped to the nearest channel value.
 */
function parseCssColor(text: string): { rgb: Rgb; alpha: number } | null {
  const lower = text.toLowerCase();
  if (lower === 'transparent') return { rgb: { r: 0, g: 0, b: 0 }, alpha: 0 };
  if (NAMED_COLORS[lower]) return { rgb: hexToRgb(NAMED_COLORS[lower])!, alpha: 1 };

  // A leading # is optional for 6 and 8 digits only, so "123" stays a number, not a color.
  const hexMatch = /^#?([a-f\d]{3,4}|[a-f\d]{6}|[a-f\d]{8})$/i.exec(text);
  if (hexMatch && (text.startsWith('#') || hexMatch[1].length >= 6)) {
    let digits = hexMatch[1];
    if (digits.length <= 4) digits = digits.split('').map((c) => c + c).join('');
    const rgb = hexToRgb(digits.slice(0, 6))!;
    const alpha = digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1;
    return { rgb, alpha };
  }

  const fn = /^([a-z]+)\((.*)\)$/i.exec(text);
  if (!fn) return null;
  const name = fn[1].toLowerCase();
  const args = splitArgs(fn[2]);
  if (!args) return null;
  const alpha = parseAlpha(args.alpha);
  if (alpha === null) return null;
  const [a, b, c] = args.channels;

  if (name === 'rgb' || name === 'rgba') {
    const values = [a, b, c].map((t) => parseScaled(t, 255));
    if (values.some((v) => v === null || v < 0 || v > 255)) return null;
    const [r, g, bl] = values.map((v) => Math.round(v!));
    return { rgb: { r, g, b: bl }, alpha };
  }

  if (name === 'hsl' || name === 'hsla') {
    const h = parseHue(a);
    const s = parsePercent(b);
    const l = parsePercent(c);
    if (h === null || s === null || l === null || s < 0 || s > 100 || l < 0 || l > 100) return null;
    return { rgb: hslToRgb(h, s, l), alpha };
  }

  if (name === 'hwb') {
    const h = parseHue(a);
    const w = parsePercent(b);
    const bk = parsePercent(c);
    if (h === null || w === null || bk === null || w < 0 || bk < 0) return null;
    return { rgb: hwbToRgb(h, w, bk), alpha };
  }

  if (name === 'oklch') {
    const l = parseScaled(a, 1);
    const ch = parseScaled(b, 0.4);
    const h = parseHue(c);
    if (l === null || ch === null || h === null || ch < 0) return null;
    return { rgb: oklchToRgb(clamp01(l), ch, h), alpha };
  }

  if (name === 'oklab') {
    const l = parseScaled(a, 1);
    const la = parseScaled(b, 0.4);
    const lb = parseScaled(c, 0.4);
    if (l === null || la === null || lb === null) return null;
    return { rgb: oklabToRgb(clamp01(l), la, lb), alpha };
  }

  return null;
}

/**
 * Convert HWB to RGB. Whiteness and blackness are percentages.
 * When they add up to 100% or more, the result is a gray.
 */
export function hwbToRgb(h: number, w: number, b: number): Rgb {
  const white = w / 100;
  const black = b / 100;
  if (white + black >= 1) {
    const gray = toByte(white / (white + black));
    return { r: gray, g: gray, b: gray };
  }
  const base = hslToRgb(h, 100, 50);
  const scale = 1 - white - black;
  const channel = (v: number) => toByte((v / 255) * scale + white);
  return { r: channel(base.r), g: channel(base.g), b: channel(base.b) };
}

/** Convert RGB to HWB. Whiteness and blackness are percentages. */
export function rgbToHwb(r: number, g: number, b: number): { h: number; w: number; b: number } {
  const { h } = rgbToHsv(r, g, b);
  return { h, w: (Math.min(r, g, b) / 255) * 100, b: (1 - Math.max(r, g, b) / 255) * 100 };
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** Convert sRGB to OKLAB (L from 0 to 1). Uses the matrices from Björn Ottosson. */
export function rgbToOklab(r: number, g: number, b: number): { l: number; a: number; b: number } {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Convert OKLAB to sRGB, clipping channels outside the sRGB gamut. */
export function oklabToRgb(L: number, a: number, b: number): Rgb {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return {
    r: toByte(fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: toByte(fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: toByte(fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  };
}

/** Convert sRGB to OKLCH (L from 0 to 1, hue in degrees). */
export function rgbToOklch(r: number, g: number, b: number): { l: number; c: number; h: number } {
  const lab = rgbToOklab(r, g, b);
  const c = Math.hypot(lab.a, lab.b);
  const h = c < 1e-4 ? 0 : ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return { l: lab.l, c, h };
}

/** Convert OKLCH to sRGB, clipping channels outside the sRGB gamut. */
export function oklchToRgb(l: number, c: number, h: number): Rgb {
  const rad = (h * Math.PI) / 180;
  return oklabToRgb(l, c * Math.cos(rad), c * Math.sin(rad));
}

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
  const hex = (color.hex + (translucent ? toByte(alpha).toString(16).padStart(2, '0') : '')).toUpperCase();
  const h = Math.round(hsl.h);
  const s = Math.round(hsl.s);
  const l = Math.round(hsl.l);
  const slashAlpha = translucent ? ` / ${a}` : '';

  const values = [
    { label: 'HEX', value: hex },
    {
      label: 'RGB',
      value: translucent ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})` : `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    },
    { label: 'HSL', value: translucent ? `hsla(${h}, ${s}%, ${l}%, ${a})` : `hsl(${h}, ${s}%, ${l}%)` },
    {
      label: 'HWB',
      value: `hwb(${Math.round(hwb.h)} ${Math.round(hwb.w)}% ${Math.round(hwb.b)}%${slashAlpha})`,
    },
    {
      label: 'OKLCH',
      value: `oklch(${fmt(ok.l * 100, 1)}% ${fmt(ok.c, 3)} ${fmt(ok.h, 1)}${slashAlpha})`,
    },
    { label: 'HSV', value: `hsv(${Math.round(hsv.h)}, ${Math.round(hsv.s)}%, ${Math.round(hsv.v)}%)` },
  ];
  const name = colorName(color);
  if (name) values.push({ label: 'Name', value: name });
  return values;
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
 * WCAG 2.x thresholds. AA: 4.5 normal, 3 large. AAA: 7 normal, 4.5 large.
 */
export function meetsWcagAANormal(color1: Color, color2: Color): boolean {
  return getContrastRatio(color1, color2) >= 4.5;
}

export function meetsWcagAALarge(color1: Color, color2: Color): boolean {
  return getContrastRatio(color1, color2) >= 3;
}

export function meetsWcagAAANormal(color1: Color, color2: Color): boolean {
  return getContrastRatio(color1, color2) >= 7;
}

export function meetsWcagAAALarge(color1: Color, color2: Color): boolean {
  return getContrastRatio(color1, color2) >= 4.5;
}

/** @deprecated misspelled alias: this checks the AA large text threshold. */
export const meetsWCAAALarge = meetsWcagAALarge;

/** @deprecated misspelled alias: this checks the AA normal text threshold. */
export const meetsWCAAANormal = meetsWcagAANormal;
