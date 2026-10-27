/**
 * Line Tools utilities: filter, sort, dedupe, trim, and shuffle the lines of a
 * text, and compare two lists of lines.
 *
 * Line endings: the input is split on LF, CRLF, and CR. The output is joined
 * with CRLF when the input has any CRLF, otherwise with LF. A trailing line
 * break in the input is kept as a trailing line break in the output.
 */

export type LineSort = "none" | "asc" | "desc" | "natural" | "length" | "shuffle";

export interface LineFilter {
  /** Text to find in each line, or a regex. An empty pattern turns the filter off. */
  pattern: string;
  regex?: boolean;
  /** Keep the matching lines (the default) or remove them. */
  mode?: "keep" | "remove";
}

export interface LineToolOptions {
  filter?: LineFilter;
  sort?: LineSort;
  reverse?: boolean;
  dedupe?: boolean;
  /** Compare case-insensitively when filtering, deduping, and sorting. */
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
  /** Lines that matched the filter. Undefined when no filter is set. */
  filterMatched?: number;
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
 * Build a line test from a filter.
 * @throws Error with the engine message when the regex is invalid
 */
export function lineMatcher(filter: LineFilter, ignoreCase = false): (line: string) => boolean {
  if (filter.regex) {
    // No g or y flag: those make test() keep state between lines.
    const re = new RegExp(filter.pattern, ignoreCase ? "i" : "");
    return (line) => re.test(line);
  }
  if (!ignoreCase) return (line) => line.includes(filter.pattern);
  const needle = filter.pattern.toLowerCase();
  return (line) => line.toLowerCase().includes(needle);
}

/**
 * Apply the options in a fixed order: trim, remove empty lines, filter,
 * dedupe, sort, then reverse. Each step is O(n) except the sort, which is
 * O(n log n).
 * @throws Error when the filter regex is invalid
 */
export function processLines(text: string, options: LineToolOptions = {}): LineToolResult {
  const {
    filter,
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

  let filterMatched: number | undefined;
  if (filter?.pattern) {
    const matches = lineMatcher(filter, ignoreCase);
    const keep = filter.mode !== "remove";
    const kept = lines.filter((line) => matches(line) === keep);
    filterMatched = keep ? kept.length : lines.length - kept.length;
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
    filterMatched,
    eol: split.eol,
  };
}

export interface CompareOptions {
  ignoreCase?: boolean;
  /** Trim each line before comparing. On by default. */
  trim?: boolean;
  /** Skip lines that are empty or only whitespace. On by default. */
  ignoreBlank?: boolean;
}

export interface CompareResult {
  onlyA: string[];
  onlyB: string[];
  both: string[];
  /** Every distinct item: A's items in order, then the items only in B. */
  union: string[];
  /** Distinct items in each list. */
  uniqueA: number;
  uniqueB: number;
  eol: "\n" | "\r\n";
}

/**
 * Compare two lists as sets of lines. Each result keeps the first spelling of
 * an item and the order of first appearance. Runs in O(n) with hash maps.
 */
export function compareLists(a: string, b: string, options: CompareOptions = {}): CompareResult {
  const { ignoreCase = false, trim = true, ignoreBlank = true } = options;
  const toItems = (text: string) => {
    const split = splitLines(text);
    const items = new Map<string, string>();
    for (const line of split.lines) {
      const item = trim ? line.trim() : line;
      if (ignoreBlank && item.trim() === "") continue;
      const key = ignoreCase ? item.toLowerCase() : item;
      if (!items.has(key)) items.set(key, item);
    }
    return { items, eol: split.eol };
  };
  const listA = toItems(a);
  const listB = toItems(b);

  const onlyA: string[] = [];
  const both: string[] = [];
  for (const [key, item] of listA.items) {
    if (listB.items.has(key)) both.push(item);
    else onlyA.push(item);
  }
  const onlyB: string[] = [];
  for (const [key, item] of listB.items) {
    if (!listA.items.has(key)) onlyB.push(item);
  }

  return {
    onlyA,
    onlyB,
    both,
    union: [...listA.items.values(), ...onlyB],
    uniqueA: listA.items.size,
    uniqueB: listB.items.size,
    eol: listA.eol === "\r\n" || listB.eol === "\r\n" ? "\r\n" : "\n",
  };
}
