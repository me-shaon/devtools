import {
  clamp01,
  hexToRgb,
  hslToRgb,
  hwbToRgb,
  oklabToRgb,
  oklchToRgb,
} from "./convert";
import { makeColor } from "./model";
import { NAMED_COLORS } from "./named-colors";
import type { Color, Rgb } from "./types";

/** Parse a number with an optional unit. Returns null for anything else. */
function parseNumberToken(token: string): { value: number; unit: string } | null {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|rad|grad|turn)?$/i.exec(token);
  return match ? { value: parseFloat(match[1]), unit: (match[2] ?? "").toLowerCase() } : null;
}

/** Read a hue in degrees from a number or an angle with a unit. */
function parseHue(token: string): number | null {
  const n = parseNumberToken(token);
  if (!n || n.unit === "%") return null;
  const factor: Record<string, number> = { "": 1, deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360 };
  return (((n.value * factor[n.unit]) % 360) + 360) % 360;
}

/** Read a value that is either a plain number or a percentage of `percentScale`. */
function parseScaled(token: string, percentScale: number): number | null {
  const n = parseNumberToken(token);
  if (!n || (n.unit && n.unit !== "%")) return null;
  return n.unit === "%" ? (n.value / 100) * percentScale : n.value;
}

/** Read a percentage, also accepting a bare number as modern CSS does. Returns 0 to 100. */
function parsePercent(token: string): number | null {
  const n = parseNumberToken(token);
  if (!n || (n.unit && n.unit !== "%")) return null;
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
  if (text.includes(",")) {
    const parts = text.split(",").map((p) => p.trim());
    if (parts.length < 3 || parts.length > 4 || parts.some((p) => !p)) return null;
    return { channels: parts.slice(0, 3), alpha: parts[3] };
  }
  const [main, alpha, extra] = text.split("/").map((p) => p.trim());
  if (extra !== undefined || alpha === "") return null;
  const channels = main.split(/\s+/);
  if (channels.length !== 3) return null;
  return { channels, alpha };
}

/**
 * Parse any sRGB CSS color: hex (3, 4, 6 or 8 digits), rgb(), rgba(), hsl(),
 * hsla(), hwb(), oklch(), oklab(), a named color, or transparent.
 * OKLCH and OKLAB colors outside sRGB are clipped to the nearest channel value.
 */
function parseCssColor(text: string): { rgb: Rgb; alpha: number } | null {
  const lower = text.toLowerCase();
  if (lower === "transparent") return { rgb: { r: 0, g: 0, b: 0 }, alpha: 0 };
  if (NAMED_COLORS[lower]) return { rgb: hexToRgb(NAMED_COLORS[lower])!, alpha: 1 };

  // A leading # is optional for 6 and 8 digits only, so "123" stays a number, not a color.
  const hexMatch = /^#?([a-f\d]{3,4}|[a-f\d]{6}|[a-f\d]{8})$/i.exec(text);
  if (hexMatch && (text.startsWith("#") || hexMatch[1].length >= 6)) {
    let digits = hexMatch[1];
    if (digits.length <= 4) digits = digits.split("").map((c) => c + c).join("");
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

  if (name === "rgb" || name === "rgba") {
    const values = [a, b, c].map((t) => parseScaled(t, 255));
    if (values.some((v) => v === null || v < 0 || v > 255)) return null;
    const [r, g, bl] = values.map((v) => Math.round(v!));
    return { rgb: { r, g, b: bl }, alpha };
  }

  if (name === "hsl" || name === "hsla") {
    const h = parseHue(a);
    const s = parsePercent(b);
    const l = parsePercent(c);
    if (h === null || s === null || l === null || s < 0 || s > 100 || l < 0 || l > 100) return null;
    return { rgb: hslToRgb(h, s, l), alpha };
  }

  if (name === "hwb") {
    const h = parseHue(a);
    const w = parsePercent(b);
    const bk = parsePercent(c);
    if (h === null || w === null || bk === null || w < 0 || bk < 0) return null;
    return { rgb: hwbToRgb(h, w, bk), alpha };
  }

  if (name === "oklch") {
    const l = parseScaled(a, 1);
    const ch = parseScaled(b, 0.4);
    const h = parseHue(c);
    if (l === null || ch === null || h === null || ch < 0) return null;
    return { rgb: oklchToRgb(clamp01(l), ch, h), alpha };
  }

  if (name === "oklab") {
    const l = parseScaled(a, 1);
    const la = parseScaled(b, 0.4);
    const lb = parseScaled(c, 0.4);
    if (l === null || la === null || lb === null) return null;
    return { rgb: oklabToRgb(clamp01(l), la, lb), alpha };
  }

  return null;
}

/** Parse color string to Color object. */
export function parseColor(input: string): Color | null {
  const parsed = parseCssColor(input.trim());
  if (!parsed) return null;
  return makeColor(parsed.rgb, parsed.alpha);
}

/** Most colors the comparison tools accept in one list. */
export const MAX_COMPARE_COLORS = 32;

export interface ColorList {
  colors: { input: string; color: Color }[];
  invalid: string[];
  /** Number of valid colors dropped because the list exceeded the cap. */
  truncated: number;
}

/**
 * Split a list of CSS colors. Commas, semicolons, spaces, and new lines separate colors,
 * but not inside parentheses, so "rgb(0 0 0), red" gives two colors.
 *
 * Valid colors are capped at `maxColors`; the extras are counted in `truncated` and every
 * invalid token is still reported, so callers can tell cut-off input from bad input.
 */
export function parseColorList(text: string, maxColors = MAX_COMPARE_COLORS): ColorList {
  const tokens: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && /[\s,;]/.test(ch)) {
      if (current) tokens.push(current);
      current = "";
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
