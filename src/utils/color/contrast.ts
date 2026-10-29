import { hslToRgb } from "./convert";
import { compositeOver, makeColor, withAlpha } from "./model";
import type { Color } from "./types";

/** Get color contrast ratio (for accessibility). */
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

/** WCAG 2.x thresholds. AA: 4.5 normal, 3 large. AAA: 7 normal, 4.5 large. */
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

export type ContrastTarget = "aa-normal" | "aa-large" | "aaa-normal" | "aaa-large";

export const WCAG_TARGETS: { id: ContrastTarget; label: string; ratio: number }[] = [
  { id: "aa-normal", label: "AA normal text (4.5:1)", ratio: 4.5 },
  { id: "aa-large", label: "AA large text (3:1)", ratio: 3 },
  { id: "aaa-normal", label: "AAA normal text (7:1)", ratio: 7 },
  { id: "aaa-large", label: "AAA large text (4.5:1)", ratio: 4.5 },
];

export function targetRatio(target: ContrastTarget): number {
  return WCAG_TARGETS.find((entry) => entry.id === target)?.ratio ?? 4.5;
}

export interface ContrastCheck {
  target: ContrastTarget;
  required: number;
  pass: boolean;
}

export interface ContrastAnalysis {
  ratio: number;
  foreground: Color;
  background: Color;
  transparencyDisclosed: boolean;
  checks: ContrastCheck[];
}

/**
 * Check a pair the way the UI previews it: the background is treated as opaque because the
 * page behind it is unknown, and a translucent foreground is composited over that background.
 */
export function analyzeContrast(fg: Color, bg: Color): ContrastAnalysis {
  const background = withAlpha(bg, 1);
  const foreground = fg.alpha < 1 ? compositeOver(fg, background) : fg;
  const ratio = getContrastRatio(foreground, background);
  return {
    ratio,
    foreground,
    background,
    transparencyDisclosed: fg.alpha < 1 || bg.alpha < 1,
    checks: WCAG_TARGETS.map(({ id, ratio: required }) => ({ target: id, required, pass: ratio >= required })),
  };
}

export type ContrastSuggestion =
  | { status: "pass" }
  | { status: "suggested"; side: "foreground" | "background"; color: Color; ratio: number }
  | { status: "impossible" };

const lightnessCandidates = (color: Color) => {
  const base = Math.round(color.hsl.l);
  return Array.from({ length: 100 }, (_, index) => {
    const delta = index + 1;
    return [base - delta, base + delta].filter((lightness) => lightness >= 0 && lightness <= 100);
  }).flat();
};

const atLightness = (color: Color, lightness: number) => {
  const { h, s } = color.hsl;
  return makeColor(hslToRgb(h, s, lightness), color.alpha);
};

const closestPassing = (color: Color, other: Color, required: number, side: "foreground" | "background") => {
  const base = Math.round(color.hsl.l);
  let best: { color: Color; ratio: number; distance: number } | null = null;

  for (const lightness of lightnessCandidates(color)) {
    const candidate = atLightness(color, lightness);
    const analysis = side === "foreground" ? analyzeContrast(candidate, other) : analyzeContrast(other, candidate);
    if (analysis.ratio < required) continue;
    const distance = Math.abs(lightness - base);
    if (distance < (best?.distance ?? Number.POSITIVE_INFINITY) || (best && distance === best.distance && analysis.ratio > best.ratio)) {
      best = { color: candidate, ratio: analysis.ratio, distance };
    }
  }

  return best;
};

/**
 * Find the closest foreground or background lightness that meets the target.
 * Returns an explicit impossible result when no lightness change can satisfy it.
 */
export function suggestContrastColor(fg: Color, bg: Color, target: ContrastTarget): ContrastSuggestion {
  const required = targetRatio(target);
  if (analyzeContrast(fg, bg).ratio >= required) return { status: "pass" };

  const foreground = closestPassing(fg, bg, required, "foreground");
  const background = closestPassing(bg, fg, required, "background");

  if (!foreground && !background) return { status: "impossible" };
  if (!foreground) return { status: "suggested", side: "background", color: background!.color, ratio: background!.ratio };
  if (!background) return { status: "suggested", side: "foreground", color: foreground.color, ratio: foreground.ratio };

  const preferForeground =
    foreground.distance < background.distance ||
    (foreground.distance === background.distance && foreground.ratio >= background.ratio);
  const chosen = preferForeground ? foreground : background;
  return {
    status: "suggested",
    side: preferForeground ? "foreground" : "background",
    color: chosen.color,
    ratio: chosen.ratio,
  };
}
