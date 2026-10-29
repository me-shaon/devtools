import { useEffect, useRef, useState } from "react";
import { hslToRgb, makeColor, parseColor, withAlpha, type Color } from "@/utils/color";

/** Longest color text accepted per surface. Longer input fails without being parsed. */
export const MAX_COLOR_INPUT_LENGTH = 128;

const DEFAULT_COLOR = "#3b82f6";

export interface RgbDraft {
  r: string;
  g: string;
  b: string;
}

export interface HslDraft {
  h: string;
  s: string;
  l: string;
}

export interface ColorDrafts {
  hex: string;
  rgb: RgbDraft;
  hsl: HslDraft;
  /** Alpha as a percentage from 0 to 100. */
  alpha: string;
}

export type ColorSurface = "hex" | "rgb" | "hsl" | "alpha";
export type ColorInvalid = Record<ColorSurface, boolean>;

export interface ColorStudioOptions {
  initialColor?: string;
  /** Called when a color is committed: externally applied, or a valid draft is committed. */
  onCommit?: (color: Color) => void;
}

const formatAlphaPercent = (alpha: number) => String(Math.round(alpha * 1000) / 10);

/** The HEX draft carries alpha as an 8th and 7th digit whenever the color is translucent. */
function hexDraftFor(color: Color): string {
  if (color.alpha >= 1) return color.hex;
  const byte = Math.round(color.alpha * 255);
  return byte >= 255 ? color.hex : color.hex + byte.toString(16).padStart(2, "0");
}

function draftsFor(color: Color): ColorDrafts {
  return {
    hex: hexDraftFor(color),
    rgb: { r: String(color.rgb.r), g: String(color.rgb.g), b: String(color.rgb.b) },
    hsl: {
      h: String(Math.round(color.hsl.h)),
      s: String(Math.round(color.hsl.s)),
      l: String(Math.round(color.hsl.l)),
    },
    alpha: formatAlphaPercent(color.alpha),
  };
}

function parseRgbDraft(draft: RgbDraft): { r: number; g: number; b: number } | null {
  const values = [draft.r, draft.g, draft.b].map((value) => {
    const text = value.trim();
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    return n >= 0 && n <= 255 ? n : null;
  });
  return values.some((v) => v === null) ? null : { r: values[0]!, g: values[1]!, b: values[2]! };
}

function parseHslDraft(draft: HslDraft): { h: number; s: number; l: number } | null {
  const parse = (value: string, max: number) => {
    const text = value.trim();
    if (!/^\d+(\.\d+)?$/.test(text)) return null;
    const n = Number(text);
    return n >= 0 && n <= max ? n : null;
  };
  const h = parse(draft.h, 360);
  const s = parse(draft.s, 100);
  const l = parse(draft.l, 100);
  return h === null || s === null || l === null ? null : { h, s, l };
}

function parseAlphaDraft(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return n >= 0 && n <= 100 ? n / 100 : null;
}

interface StudioState {
  color: Color;
  drafts: ColorDrafts;
  invalid: ColorInvalid;
}

const NO_INVALID: ColorInvalid = { hex: false, rgb: false, hsl: false, alpha: false };

function initialState(initialColor: string): StudioState {
  const color = parseColor(initialColor) ?? parseColor(DEFAULT_COLOR)!;
  return { color, drafts: draftsFor(color), invalid: { ...NO_INVALID } };
}

/**
 * Owns the single working color and one text draft per editable surface. A valid draft updates
 * the canonical color at once; an invalid draft only marks that surface. Drafts of surfaces the
 * user is not editing are resynchronized, while the active text is left exactly as typed.
 */
export function useColorStudio(options: ColorStudioOptions = {}) {
  const [state, setState] = useState<StudioState>(() => initialState(options.initialColor ?? DEFAULT_COLOR));
  const onCommitRef = useRef(options.onCommit);
  useEffect(() => {
    onCommitRef.current = options.onCommit;
  }, [options.onCommit]);

  const setHexDraft = (value: string) =>
    setState((prev) => {
      const drafts = { ...prev.drafts, hex: value };
      if (value.length > MAX_COLOR_INPUT_LENGTH) {
        return { ...prev, drafts, invalid: { ...prev.invalid, hex: true } };
      }
      const parsed = parseColor(value);
      if (!parsed) return { ...prev, drafts, invalid: { ...prev.invalid, hex: true } };
      return { color: parsed, drafts: { ...draftsFor(parsed), hex: value }, invalid: { ...prev.invalid, hex: false } };
    });

  const setRgbDraft = (channel: keyof RgbDraft, value: string) =>
    setState((prev) => {
      const rgb = { ...prev.drafts.rgb, [channel]: value };
      const drafts = { ...prev.drafts, rgb };
      const parsed = parseRgbDraft(rgb);
      if (!parsed) return { ...prev, drafts, invalid: { ...prev.invalid, rgb: true } };
      const color = makeColor(parsed, prev.color.alpha);
      return { color, drafts: { ...draftsFor(color), rgb }, invalid: { ...prev.invalid, rgb: false } };
    });

  const setHslDraft = (channel: keyof HslDraft, value: string) =>
    setState((prev) => {
      const hsl = { ...prev.drafts.hsl, [channel]: value };
      const drafts = { ...prev.drafts, hsl };
      const parsed = parseHslDraft(hsl);
      if (!parsed) return { ...prev, drafts, invalid: { ...prev.invalid, hsl: true } };
      const color = makeColor(hslToRgb(parsed.h, parsed.s, parsed.l), prev.color.alpha);
      return { color, drafts: { ...draftsFor(color), hsl }, invalid: { ...prev.invalid, hsl: false } };
    });

  const applyAlpha = (alpha: number, draft: string) =>
    setState((prev) => {
      const color = withAlpha(prev.color, alpha);
      return { color, drafts: { ...draftsFor(color), alpha: draft }, invalid: { ...prev.invalid, alpha: false } };
    });

  const setAlphaDraft = (value: string) => {
    const alpha = parseAlphaDraft(value);
    if (alpha === null) {
      setState((prev) => ({ ...prev, drafts: { ...prev.drafts, alpha: value }, invalid: { ...prev.invalid, alpha: true } }));
      return;
    }
    applyAlpha(alpha, value);
  };

  /** Set alpha from a slider or another numeric control, without recording a commit. */
  const setAlphaPercent = (percent: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    applyAlpha(clamped / 100, String(clamped));
  };

  /** Normalize valid drafts and record the working color; invalid text stays for correction. */
  const commit = () => {
    if (Object.values(state.invalid).some(Boolean)) return;
    setState((prev) => ({ ...prev, drafts: draftsFor(prev.color) }));
    onCommitRef.current?.(state.color);
  };

  /** Apply a color from the picker, a swatch, a recent entry, or a suggestion. */
  const applyColor = (color: Color) => {
    setState({ color, drafts: draftsFor(color), invalid: { ...NO_INVALID } });
    onCommitRef.current?.(color);
  };

  return {
    color: state.color,
    drafts: state.drafts,
    invalid: state.invalid,
    setHexDraft,
    setRgbDraft,
    setHslDraft,
    setAlphaDraft,
    setAlphaPercent,
    commit,
    applyColor,
  };
}

export type ColorStudio = ReturnType<typeof useColorStudio>;
