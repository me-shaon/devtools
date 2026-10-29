import { toCssColor } from "./model";
import { parseColor } from "./parse";
import type { Color } from "./types";

export const MAX_RECENT_COLORS = 8;
export const RECENT_COLORS_KEY = "devtools-color-recent-v1";

const sameColor = (a: Color, b: Color) => a.hex === b.hex && a.alpha === b.alpha;

/** Put a color at the front, remove duplicates, and keep the list capped. */
export function addRecentColor(colors: Color[], color: Color): Color[] {
  return [color, ...colors.filter((entry) => !sameColor(entry, color))].slice(0, MAX_RECENT_COLORS);
}

/**
 * Parse the persisted history. Missing, malformed, or unexpected data yields an empty
 * list; individual invalid entries are skipped.
 */
export function parseRecentColors(raw: string | null): Color[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const colors: Color[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "string") continue;
    const color = parseColor(entry);
    if (!color) continue;
    if (colors.some((existing) => sameColor(existing, color))) continue;
    colors.push(color);
    if (colors.length === MAX_RECENT_COLORS) break;
  }
  return colors;
}

/** Serialize the capped, duplicate-free history as CSS color strings. */
export function serializeRecentColors(colors: Color[]): string {
  const unique: Color[] = [];
  for (const color of colors) {
    if (unique.some((existing) => sameColor(existing, color))) continue;
    unique.push(color);
    if (unique.length === MAX_RECENT_COLORS) break;
  }
  return JSON.stringify(unique.map(toCssColor));
}
