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

/** Build a Color from channel values, e.g. fixed surfaces like pure black or white. */
export function makeColor(rgb: Rgb, alpha = 1): Color {
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
 * A color followed by lighter and darker shades in 10% lightness steps.
 * Lightness clamps at 0 and 100, so steps that repeat a color (for example,
 * every tint of white) are skipped instead of producing duplicate swatches.
 * The palette is opaque: the alpha value of the color is not used.
 */
export function generateShadePalette(color: Color, count = 5): Color[] {
  const base = makeColor(color.rgb);

  const h = Math.round(base.hsl.h);
  const s = Math.round(base.hsl.s);
  const l = Math.round(base.hsl.l);
  const seen = new Set([base.hex]);
  const palette = [base];

  const addShade = (lightness: number) => {
    const rgb = hslToRgb(h, s, Math.max(0, Math.min(100, lightness)));
    const color = parseColor(rgbToHex(rgb.r, rgb.g, rgb.b));
    if (!color || seen.has(color.hex)) return;
    seen.add(color.hex);
    palette.push(color);
  };

  for (let i = 1; i <= count; i++) addShade(l + i * 10);
  for (let i = 1; i <= count; i++) addShade(l - i * 10);
  return palette;
}

export type PaletteMode = 'tints' | 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'monochromatic';

export const PALETTE_MODES: { id: PaletteMode; label: string }[] = [
  { id: 'tints', label: 'Tints and shades' },
  { id: 'complementary', label: 'Complementary' },
  { id: 'analogous', label: 'Analogous' },
  { id: 'triadic', label: 'Triadic' },
  { id: 'split-complementary', label: 'Split complementary' },
  { id: 'monochromatic', label: 'Monochromatic' },
];

const MONOCHROMATIC_LIGHTNESS = [90, 75, 60, 45, 30, 15];

/**
 * A palette for a color: the color first, then the swatches of the mode, without duplicates.
 * The palette is opaque: the alpha value of the color is not used.
 */
export function buildPalette(color: Color, mode: PaletteMode): Color[] {
  const base = makeColor(color.rgb);
  let colors: Color[];
  switch (mode) {
    case 'complementary':
      colors = [base, getComplementaryColor(base)];
      break;
    case 'analogous':
      colors = [base, ...getAnalogousColors(base, 2)];
      break;
    case 'triadic':
      colors = [base, ...getTriadicColors(base)];
      break;
    case 'split-complementary':
      colors = [base, ...getSplitComplementaryColors(base)];
      break;
    case 'monochromatic':
      colors = [base, ...MONOCHROMATIC_LIGHTNESS.map((l) => makeColor(hslToRgb(base.hsl.h, base.hsl.s, l)))];
      break;
    default:
      return generateShadePalette(base);
  }
  // A gray has no hue, so its harmonies repeat the color.
  const seen = new Set<string>();
  return colors.filter((c) => {
    if (seen.has(c.hex)) return false;
    seen.add(c.hex);
    return true;
  });
}

/** The palette as CSS custom properties, one per swatch in palette order. */
export function paletteToCss(colors: Color[]): string {
  return `:root {\n${colors.map((c, i) => `  --color-${i + 1}: ${c.hex};`).join('\n')}\n}`;
}

/** The palette as JSON, one entry per swatch with its custom property name. */
export function paletteToJson(colors: Color[]): string {
  return JSON.stringify(colors.map((c, i) => ({ name: `--color-${i + 1}`, value: c.hex })), null, 2);
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

export type ContrastTarget = 'aa-normal' | 'aa-large' | 'aaa-normal' | 'aaa-large';

export const WCAG_TARGETS: { id: ContrastTarget; label: string; ratio: number }[] = [
  { id: 'aa-normal', label: 'AA normal text', ratio: 4.5 },
  { id: 'aa-large', label: 'AA large text', ratio: 3 },
  { id: 'aaa-normal', label: 'AAA normal text', ratio: 7 },
  { id: 'aaa-large', label: 'AAA large text', ratio: 4.5 },
];

/** HEX with the alpha byte added when the color is not opaque. */
export function toHexWithAlpha(color: Color): string {
  const byte = Math.round(color.alpha * 255);
  return byte >= 255 ? color.hex : color.hex + byte.toString(16).padStart(2, '0');
}

export const RECENT_COLORS_STORAGE_KEY = 'devtools-color-recent-v1';
export const MAX_RECENT_COLORS = 8;

/** Put a color first in the recent list, remove its older entry, and keep the list short. */
export function addRecentColor(recents: string[], color: Color): string[] {
  const value = toHexWithAlpha(color);
  return [value, ...recents.filter((entry) => entry !== value)].slice(0, MAX_RECENT_COLORS);
}

/** Read the stored recent list. Entries that are not valid colors are skipped. */
export function parseRecentColors(raw: string | null): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const colors = parsed.filter((entry): entry is string => typeof entry === 'string' && parseColor(entry) !== null);
  return [...new Set(colors)].slice(0, MAX_RECENT_COLORS);
}

/** Contrast as a browser paints the pair: the background is opaque and a translucent foreground blends over it. */
function paintedContrast(fg: Color, bg: Color): number {
  const background = makeColor(bg.rgb);
  return getContrastRatio(fg.alpha < 1 ? compositeOver(fg, background) : fg, background);
}

/** The closest lightness of one side of the pair that reaches the ratio, with its distance in lightness. */
function closestPassing(fg: Color, bg: Color, required: number, side: 'foreground' | 'background') {
  const color = side === 'foreground' ? fg : bg;
  const { h, s, l } = color.hsl;
  for (let distance = 1; distance <= 100; distance++) {
    let best: { color: Color; ratio: number } | null = null;
    for (const lightness of [l - distance, l + distance]) {
      if (lightness < 0 || lightness > 100) continue;
      const candidate = makeColor(hslToRgb(h, s, lightness), color.alpha);
      const ratio = side === 'foreground' ? paintedContrast(candidate, bg) : paintedContrast(fg, candidate);
      if (ratio >= required && (!best || ratio > best.ratio)) best = { color: candidate, ratio };
    }
    if (best) return { ...best, distance };
  }
  return null;
}

/**
 * Suggest the smallest lightness change of the foreground or the background that makes the pair
 * reach the ratio. The foreground wins a tie. Returns null when no lightness change can reach it.
 */
export function suggestContrastColor(
  fg: Color,
  bg: Color,
  required: number,
): { side: 'foreground' | 'background'; color: Color; ratio: number } | null {
  const foreground = closestPassing(fg, bg, required, 'foreground');
  const background = closestPassing(fg, bg, required, 'background');
  if (foreground && (!background || foreground.distance <= background.distance)) {
    return { side: 'foreground', color: foreground.color, ratio: foreground.ratio };
  }
  return background ? { side: 'background', color: background.color, ratio: background.ratio } : null;
}

/** @deprecated misspelled alias: this checks the AA large text threshold. */
export const meetsWCAAALarge = meetsWcagAALarge;

/** @deprecated misspelled alias: this checks the AA normal text threshold. */
export const meetsWCAAANormal = meetsWcagAANormal;

/* ------------------------------------------------------------------------------------------------
 * Color vision deficiency (CVD) simulation
 *
 * Method: Machado, Oliveira, and Fernandes, "A Physiologically-based Model for Simulation of Color
 * Vision Deficiency", IEEE TVCG 15(6), 2009. The matrices below are the published table for
 * severities 0.1 to 1.0 in steps of 0.1. Severity 1.0 is the full dichromacy (protanopia,
 * deuteranopia, tritanopia). Values between two table rows are interpolated linearly.
 * The matrices apply to linear RGB, so each channel is linearized with the sRGB transfer
 * function first and encoded again after the matrix.
 * Achromatopsia (no cone color vision) maps each color to its linear luminance (Rec. 709 weights).
 * Below full severity (achromatomaly), the matrix moves from the identity toward that luminance map.
 * ---------------------------------------------------------------------------------------------- */

export type CvdType = 'protan' | 'deutan' | 'tritan' | 'achroma';

export const CVD_TYPES: CvdType[] = ['protan', 'deutan', 'tritan', 'achroma'];

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Machado 2009 matrices, row-major, for severity 0.1, 0.2, ..., 1.0. */
const MACHADO: Record<'protan' | 'deutan' | 'tritan', number[][]> = {
  protan: [
    [0.856167, 0.182038, -0.038205, 0.029342, 0.955115, 0.015544, -0.00288, -0.001563, 1.004443],
    [0.734766, 0.334872, -0.069637, 0.05184, 0.919198, 0.028963, -0.004928, -0.004209, 1.009137],
    [0.630323, 0.465641, -0.095964, 0.069181, 0.890046, 0.040773, -0.006308, -0.007724, 1.014032],
    [0.539009, 0.579343, -0.118352, 0.082546, 0.866121, 0.051332, -0.007136, -0.011959, 1.019095],
    [0.458064, 0.679578, -0.137642, 0.092785, 0.846313, 0.060902, -0.007494, -0.016807, 1.024301],
    [0.38545, 0.769005, -0.154455, 0.100526, 0.829802, 0.069673, -0.007442, -0.02219, 1.029632],
    [0.319627, 0.849633, -0.169261, 0.106241, 0.815969, 0.07779, -0.007025, -0.028051, 1.035076],
    [0.259411, 0.923008, -0.18242, 0.110296, 0.80434, 0.085364, -0.006276, -0.034346, 1.040622],
    [0.203876, 0.990338, -0.194214, 0.112975, 0.794542, 0.092483, -0.005222, -0.041043, 1.046265],
    [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.866435, 0.177704, -0.044139, 0.049567, 0.939063, 0.01137, -0.003453, 0.007233, 0.99622],
    [0.760729, 0.319078, -0.079807, 0.090568, 0.889315, 0.020117, -0.006027, 0.013325, 0.992702],
    [0.675425, 0.43385, -0.109275, 0.125303, 0.847755, 0.026942, -0.00795, 0.018572, 0.989378],
    [0.605511, 0.52856, -0.134071, 0.155318, 0.812366, 0.032316, -0.009376, 0.023176, 0.9862],
    [0.547494, 0.607765, -0.155259, 0.181692, 0.781742, 0.036566, -0.01041, 0.027275, 0.983136],
    [0.498864, 0.674741, -0.173604, 0.205199, 0.754872, 0.039929, -0.011131, 0.030969, 0.980162],
    [0.457771, 0.731899, -0.18967, 0.226409, 0.731012, 0.042579, -0.011595, 0.034333, 0.977261],
    [0.422823, 0.781057, -0.203881, 0.245752, 0.709602, 0.044646, -0.011843, 0.037423, 0.974421],
    [0.392952, 0.82361, -0.216562, 0.263559, 0.69021, 0.046232, -0.01191, 0.040281, 0.97163],
    [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [0.92667, 0.092514, -0.019184, 0.021191, 0.964503, 0.014306, 0.008437, 0.054813, 0.93675],
    [0.89572, 0.13333, -0.02905, 0.029997, 0.9454, 0.024603, 0.013027, 0.104707, 0.882266],
    [0.905871, 0.127791, -0.033662, 0.026856, 0.941251, 0.031893, 0.01341, 0.148296, 0.838294],
    [0.948035, 0.08949, -0.037526, 0.014364, 0.946792, 0.038844, 0.010853, 0.193991, 0.795156],
    [1.017277, 0.027029, -0.044306, -0.006113, 0.958479, 0.047634, 0.006379, 0.248708, 0.744913],
    [1.104996, -0.046633, -0.058363, -0.032137, 0.971635, 0.060503, 0.001336, 0.317922, 0.680742],
    [1.193214, -0.109812, -0.083402, -0.058496, 0.97941, 0.079086, -0.002346, 0.403492, 0.598854],
    [1.257728, -0.139648, -0.118081, -0.078003, 0.975409, 0.102594, -0.003316, 0.501214, 0.502102],
    [1.278864, -0.125333, -0.153531, -0.084748, 0.957674, 0.127074, -0.000989, 0.601151, 0.399838],
    [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  ],
};

/** Rec. 709 luminance weights for linear RGB, the same weights WCAG uses. */
const ACHROMA = [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722];

/**
 * The 3×3 linear RGB matrix (row-major) for a CVD type and a severity from 0 to 1.
 * Severity applies to every type.
 */
export function cvdMatrix(type: CvdType, severity = 1): number[] {
  if (type === 'achroma') return IDENTITY.map((v, i) => v + (ACHROMA[i] - v) * clamp01(severity));
  const s = clamp01(severity) * 10;
  const table = MACHADO[type];
  const low = Math.floor(s);
  if (low >= 10) return table[9];
  const lowMatrix = low === 0 ? IDENTITY : table[low - 1];
  const t = s - low;
  return lowMatrix.map((v, i) => v + (table[low][i] - v) * t);
}

const CVD_STEMS: Record<CvdType, string> = { protan: 'Prot', deutan: 'Deuter', tritan: 'Trit', achroma: '' };

/** A readable name: "Protanopia" at full severity, "Protanomaly" below it. */
export function cvdLabel(type: CvdType, severity = 1): string {
  if (type === 'achroma') return severity >= 1 ? 'Achromatopsia' : 'Achromatomaly';
  return `${CVD_STEMS[type]}${severity >= 1 ? 'anopia' : 'anomaly'}`;
}

/** Simulate how a color looks with a CVD. The alpha value stays the same. */
export function simulateCvd(color: Color, type: CvdType, severity = 1): Color {
  const m = cvdMatrix(type, severity);
  const r = toLinear(color.rgb.r);
  const g = toLinear(color.rgb.g);
  const b = toLinear(color.rgb.b);
  return makeColor(
    {
      r: toByte(fromLinear(clamp01(m[0] * r + m[1] * g + m[2] * b))),
      g: toByte(fromLinear(clamp01(m[3] * r + m[4] * g + m[5] * b))),
      b: toByte(fromLinear(clamp01(m[6] * r + m[7] * g + m[8] * b))),
    },
    color.alpha,
  );
}

/** Lookup tables for the pixel transform: byte to linear, and linear (4096 steps) to byte. */
let pixelTables: { toLin: Float32Array; toByte: Uint8ClampedArray } | null = null;
const LINEAR_STEPS = 4095;
function getPixelTables() {
  if (!pixelTables) {
    const toLin = new Float32Array(256);
    for (let i = 0; i < 256; i++) toLin[i] = toLinear(i);
    const out = new Uint8ClampedArray(LINEAR_STEPS + 1);
    for (let i = 0; i <= LINEAR_STEPS; i++) out[i] = toByte(fromLinear(i / LINEAR_STEPS));
    pixelTables = { toLin, toByte: out };
  }
  return pixelTables;
}

/**
 * Simulate a CVD on RGBA pixel data in place, from pixel `start` up to (not including) pixel `end`.
 * Callers can process an image in chunks to keep the UI responsive. Alpha stays the same.
 */
export function simulateCvdPixels(
  data: Uint8ClampedArray,
  type: CvdType,
  severity = 1,
  start = 0,
  end = data.length / 4,
): void {
  const m = cvdMatrix(type, severity);
  const { toLin, toByte: out } = getPixelTables();
  const enc = (v: number) => out[Math.round((v <= 0 ? 0 : v >= 1 ? 1 : v) * LINEAR_STEPS)];
  for (let p = start * 4, stop = end * 4; p < stop; p += 4) {
    const r = toLin[data[p]];
    const g = toLin[data[p + 1]];
    const b = toLin[data[p + 2]];
    data[p] = enc(m[0] * r + m[1] * g + m[2] * b);
    data[p + 1] = enc(m[3] * r + m[4] * g + m[5] * b);
    data[p + 2] = enc(m[6] * r + m[7] * g + m[8] * b);
  }
}

/**
 * Perceptual distance between two colors: the Euclidean distance in OKLAB (ΔE OK), times 100.
 * About 2 is the smallest difference most people notice with the colors side by side.
 */
export function colorDistance(a: Color, b: Color): number {
  const x = rgbToOklab(a.rgb.r, a.rgb.g, a.rgb.b);
  const y = rgbToOklab(b.rgb.r, b.rgb.g, b.rgb.b);
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b) * 100;
}

/**
 * Below this distance, two colors are hard to tell apart in small marks such as chart lines,
 * legend dots, or status icons. It is a few times the just noticeable difference of about 2.
 */
export const CONFUSION_THRESHOLD = 6;

/** Pairs of colors (by index) whose distance is below the threshold, closest first. */
export function findConfusablePairs(
  colors: Color[],
  threshold = CONFUSION_THRESHOLD,
): { a: number; b: number; distance: number }[] {
  const pairs: { a: number; b: number; distance: number }[] = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const distance = colorDistance(colors[i], colors[j]);
      if (distance < threshold) pairs.push({ a: i, b: j, distance });
    }
  }
  return pairs.sort((x, y) => x.distance - y.distance);
}

/** Most colors the comparison tools accept in one list. The pairwise check is O(n squared). */
export const MAX_COMPARE_COLORS = 32;

/**
 * Split a list of CSS colors. Commas, semicolons, spaces, and new lines separate colors,
 * but not inside parentheses, so "rgb(0 0 0), red" gives two colors.
 *
 * Valid colors are capped at `maxColors`; the extras are counted in `truncated` and every
 * invalid token is still reported, so callers can tell cut-off input from bad input.
 */
export function parseColorList(
  text: string,
  maxColors = MAX_COMPARE_COLORS,
): { colors: { input: string; color: Color }[]; invalid: string[]; truncated: number } {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /[\s,;]/.test(ch)) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  const colors: { input: string; color: Color }[] = [];
  const invalid: string[] = [];
  const cap = Math.max(1, maxColors);
  let truncated = 0;
  for (const token of tokens) {
    const color = parseColor(token);
    if (!color) {
      invalid.push(token);
    } else if (colors.length < cap) {
      colors.push({ input: token, color });
    } else {
      truncated++;
    }
  }
  return { colors, invalid, truncated };
}
