/**
 * Line Tools utilities: sort, dedupe, trim, and shuffle the lines of a text.
 *
 * Line endings: the input is split on LF, CRLF, and CR. The output is joined
 * with CRLF when the input has any CRLF, otherwise with LF. A trailing line
 * break in the input is kept as a trailing line break in the output.
 */

export type LineSort = "none" | "asc" | "desc" | "natural" | "length" | "shuffle";

export interface LineToolOptions {
  sort?: LineSort;
  reverse?: boolean;
  dedupe?: boolean;
  /** Compare case-insensitively when deduping and sorting. */
  ignoreCase?: boolean;
  trim?: boolean;
  removeEmpty?: boolean;
  /** Returns a uniform integer in [0, max). Defaults to crypto.getRandomValues. */
  randomInt?: (max: number) => number;
}

export interface LineToolResult {
  output: string;
  inputLines: number;
  outputLines: number;
  duplicatesRemoved: number;
  emptyRemoved: number;
  eol: "\n" | "\r\n";
}

export interface SplitLines {
  lines: string[];
  eol: "\n" | "\r\n";
  trailingNewline: boolean;
}

/** Split text into lines and record its line ending and trailing line break. */
export function splitLines(text: string): SplitLines {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (text === "") return { lines: [], eol, trailingNewline: false };
  const lines = text.split(/\r\n|\r|\n/);
  const trailingNewline = lines.length > 1 && lines[lines.length - 1] === "";
  if (trailingNewline) lines.pop();
  return { lines, eol, trailingNewline };
}

/** A uniform random integer in [0, max) from the Web Crypto API, without modulo bias. */
export function cryptoRandomInt(max: number): number {
  if (max <= 1) return 0;
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % max;
}

/** Fisher-Yates shuffle into a new array. */
export function shuffleLines(lines: string[], randomInt: (max: number) => number = cryptoRandomInt): string[] {
  const out = lines.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function sortLines(lines: string[], sort: LineSort, ignoreCase: boolean, randomInt: (max: number) => number): string[] {
  switch (sort) {
    case "asc":
    case "desc": {
      const collator = new Intl.Collator(undefined, { sensitivity: ignoreCase ? "base" : "variant" });
      const sorted = lines.slice().sort(collator.compare);
      return sort === "desc" ? sorted.reverse() : sorted;
    }
    case "natural": {
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: ignoreCase ? "base" : "variant" });
      return lines.slice().sort(collator.compare);
    }
    case "length":
      // Array.prototype.sort is stable, so equal lengths keep their order.
      return lines.slice().sort((a, b) => a.length - b.length);
    case "shuffle":
      return shuffleLines(lines, randomInt);
    default:
      return lines;
  }
}

/**
 * Apply the options in a fixed order: trim, remove empty lines, dedupe,
 * sort, then reverse. Each step is O(n) except the sort, which is O(n log n).
 */
export function processLines(text: string, options: LineToolOptions = {}): LineToolResult {
  const {
    sort = "none",
    reverse = false,
    dedupe = false,
    ignoreCase = false,
    trim = false,
    removeEmpty = false,
    randomInt = cryptoRandomInt,
  } = options;
  const split = splitLines(text);
  let lines = split.lines;
  const inputLines = lines.length;

  if (trim) lines = lines.map((line) => line.trim());

  let emptyRemoved = 0;
  if (removeEmpty) {
    const kept = lines.filter((line) => line.trim() !== "");
    emptyRemoved = lines.length - kept.length;
    lines = kept;
  }

  let duplicatesRemoved = 0;
  if (dedupe) {
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const line of lines) {
      const key = ignoreCase ? line.toLowerCase() : line;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(line);
    }
    duplicatesRemoved = lines.length - kept.length;
    lines = kept;
  }

  lines = sortLines(lines, sort, ignoreCase, randomInt);
  if (reverse) lines = lines.slice().reverse();

  let output = lines.join(split.eol);
  if (split.trailingNewline && lines.length > 0) output += split.eol;

  return {
    output,
    inputLines,
    outputLines: lines.length,
    duplicatesRemoved,
    emptyRemoved,
    eol: split.eol,
  };
}
