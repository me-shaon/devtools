/** The flags the tester offers as toggles, in the order JavaScript prints them. */
export const REGEX_FLAGS = ["g", "i", "m", "s", "u"] as const;
export type RegexFlag = (typeof REGEX_FLAGS)[number];

/** The tester stops collecting matches after this many. */
export const MATCH_LIMIT = 1000;
/** The tester stops collecting matches after this many milliseconds. */
export const MATCH_BUDGET_MS = 1000;

export interface RegexGroup {
  /** The group number, starting at 1. */
  number: number;
  /** The group name, for a named group such as `(?<year>…)`. */
  name?: string;
  /** The captured text. Undefined when the group did not take part in the match. */
  value: string | undefined;
}

export interface RegexMatch {
  /** Start offset in the test text, in UTF-16 code units. */
  index: number;
  /** End offset (exclusive). Equal to `index` for an empty match. */
  end: number;
  value: string;
  groups: RegexGroup[];
}

export interface RegexRequest {
  pattern: string;
  flags: string;
  text: string;
  /** When set, the result also holds the text with each match replaced. */
  replacement?: string;
  limit?: number;
  budgetMs?: number;
}

export type RegexResult =
  | {
      ok: true;
      matches: RegexMatch[];
      /** Why the match list stops early, if it does. */
      truncated: false | "limit" | "time";
      replaced?: string;
    }
  | { ok: false; error: string };

/** Puts the flags in a stable order and drops unknown or repeated flags. */
export function normalizeFlags(flags: string): string {
  return REGEX_FLAGS.filter((flag) => flags.includes(flag)).join("");
}

/** Adds the flag when it is missing and removes it when it is present. */
export function toggleFlag(flags: string, flag: RegexFlag): string {
  return normalizeFlags(flags.includes(flag) ? flags.replace(flag, "") : flags + flag);
}

/** Builds the RegExp, or returns a short error message for an invalid pattern. */
export function compileRegex(pattern: string, flags: string): { ok: true; regex: RegExp } | { ok: false; error: string } {
  try {
    return { ok: true, regex: new RegExp(pattern, flags) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Engines prefix the message with the whole pattern, which the user can already see.
    const reason = message.replace(/^Invalid regular expression: \/[\s\S]*\/[a-z]*: /, "");
    return { ok: false, error: `Invalid pattern: ${reason}` };
  }
}

/**
 * Lists the name of each capturing group in order, with undefined for an unnamed group.
 * It skips escaped parentheses, character classes, and non-capturing groups.
 */
export function captureGroupNames(pattern: string): (string | undefined)[] {
  const names: (string | undefined)[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "\\") {
      i++;
    } else if (inClass) {
      if (char === "]") inClass = false;
    } else if (char === "[") {
      inClass = true;
    } else if (char === "(") {
      if (pattern[i + 1] !== "?") {
        names.push(undefined);
      } else {
        const named = /^\?<([^>=!][^>]*)>/.exec(pattern.slice(i + 1));
        if (named) names.push(named[1]);
      }
    }
  }
  return names;
}

/** Moves past one character, or one code point when the regex reads code points. */
const advance = (text: string, index: number, unicode: boolean) => {
  if (unicode && index < text.length) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) return index + 2;
  }
  return index + 1;
};

const toMatch = (match: RegExpExecArray, names: (string | undefined)[]): RegexMatch => ({
  index: match.index,
  end: match.index + match[0].length,
  value: match[0],
  groups: match.slice(1).map((value, i) => ({ number: i + 1, name: names[i], value })),
});

/**
 * Runs the pattern against the text. It collects at most `limit` matches, stops after
 * `budgetMs`, and steps past empty matches so it never loops forever.
 */
export function runRegex({ pattern, flags, text, replacement, limit = MATCH_LIMIT, budgetMs = MATCH_BUDGET_MS }: RegexRequest): RegexResult {
  const compiled = compileRegex(pattern, flags);
  if ("error" in compiled) return { ok: false, error: compiled.error };
  const { regex } = compiled;
  const names = captureGroupNames(pattern);
  const matches: RegexMatch[] = [];
  let truncated: false | "limit" | "time" = false;

  if (!regex.global) {
    const match = regex.exec(text);
    if (match) matches.push(toMatch(match, names));
  } else {
    const unicode = regex.unicode;
    const started = performance.now();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (matches.length === limit) {
        truncated = "limit";
        break;
      }
      matches.push(toMatch(match, names));
      if (match[0] === "") regex.lastIndex = advance(text, regex.lastIndex, unicode);
      if (performance.now() - started > budgetMs) {
        truncated = "time";
        break;
      }
    }
  }

  if (replacement === undefined) return { ok: true, matches, truncated };
  regex.lastIndex = 0;
  return { ok: true, matches, truncated, replaced: text.replace(regex, replacement) };
}

/**
 * Reads a pasted regex literal such as `/\d+/gi`. Returns null when the text is not a
 * literal, so the paste goes in as written. Flags the tester has no toggle for are dropped.
 */
export function parseRegexLiteral(text: string): { pattern: string; flags: string } | null {
  const literal = /^\/([\s\S]+)\/([a-z]*)$/.exec(text.trim());
  if (!literal || /[^dgimsuvy]/.test(literal[2])) return null;
  const flags = normalizeFlags(literal[2]);
  return compileRegex(literal[1], flags).ok ? { pattern: literal[1], flags } : null;
}

export interface HighlightSegment {
  text: string;
  /** The match number (0-based) this segment belongs to, if any. */
  match?: number;
}

/** Splits the text into plain and matched segments, in order, for highlighting. */
export function highlightSegments(text: string, matches: RegexMatch[]): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  matches.forEach((match, i) => {
    const start = Math.min(Math.max(match.index, cursor), text.length);
    const end = Math.min(Math.max(match.end, start), text.length);
    if (start > cursor) segments.push({ text: text.slice(cursor, start) });
    segments.push({ text: text.slice(start, end), match: i });
    cursor = end;
  });
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
