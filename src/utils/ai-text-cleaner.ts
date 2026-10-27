/**
 * AI Text Cleaner: remove the hidden characters, typographic punctuation,
 * Markdown markers, and citation markers that text copied from AI chats and
 * documents often carries. Every pass is linear in the input length.
 */

export type EmDashStyle = "spaced" | "double";

export interface CleanOptions {
  /** Zero-width characters, BOM, soft hyphens, bidi controls, stray variation selectors, and tag characters. */
  invisible: boolean;
  /** No-break, thin, hair, figure, ideographic, en, and em spaces become a normal space. */
  spaces: boolean;
  /** Curly quotes and apostrophes become straight ones. */
  quotes: boolean;
  /** Em and en dashes become ASCII hyphens. */
  dashes: boolean;
  /** `—` becomes ` - ` (spaced) or `--` (double). */
  emDashStyle: EmDashStyle;
  /** `…` becomes `...`. */
  ellipsis: boolean;
  /** Bold, italic, headings, inline code, and links. Fenced code blocks are left as written. */
  markdown: boolean;
  /** With `markdown`, also remove list bullets and numbers. */
  markdownLists: boolean;
  /** Trim trailing whitespace on each line and collapse 3 or more blank lines to 2. */
  whitespace: boolean;
  /** `[1]`, `【4†source】`, and `:contentReference[oaicite:0]{index=0}` markers. */
  citations: boolean;
}

export const DEFAULT_CLEAN_OPTIONS: CleanOptions = {
  invisible: true,
  spaces: true,
  quotes: true,
  dashes: false,
  emDashStyle: "spaced",
  ellipsis: true,
  markdown: false,
  markdownLists: false,
  whitespace: true,
  citations: true,
};

export type ChangeKind = "invisible" | "spaces" | "quotes" | "dashes" | "ellipsis" | "markdown" | "citations" | "whitespace";

export interface CleanChange {
  kind: ChangeKind;
  count: number;
  /** For example "12 invisible characters removed". */
  label: string;
}

export interface CleanResult {
  output: string;
  changes: CleanChange[];
  /** Sum of all change counts. */
  total: number;
}

const plural = (count: number, one: string, many: string) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

const CHANGE_LABELS: Record<ChangeKind, (n: number) => string> = {
  invisible: (n) => `${plural(n, "invisible character", "invisible characters")} removed`,
  spaces: (n) => `${plural(n, "unusual space", "unusual spaces")} normalized`,
  quotes: (n) => `${plural(n, "quote", "quotes")} straightened`,
  dashes: (n) => `${plural(n, "dash", "dashes")} replaced`,
  ellipsis: (n) => `${plural(n, "ellipsis", "ellipses")} expanded`,
  markdown: (n) => `${plural(n, "Markdown marker", "Markdown markers")} removed`,
  citations: (n) => `${plural(n, "citation marker", "citation markers")} removed`,
  whitespace: (n) => `${plural(n, "line", "lines")} trimmed or collapsed`,
};

/* ------------------------------------------------------------------ */
/* Invisible characters                                                */
/* ------------------------------------------------------------------ */

const ZWJ = 0x200d;
const ZWNJ = 0x200c;
const BLACK_FLAG = 0x1f3f4;

const EXT_PICT = /^\p{Extended_Pictographic}$/u;
const EMOJI = /^\p{Emoji}$/u;
const NON_LATIN_LETTER = /^[\p{L}\p{M}]$/u;
const LATIN_OR_COMMON = /^[\p{Script=Latin}\p{Script=Common}]$/u;

/** Characters always removed by the invisible pass, apart from the emoji and script exceptions below. */
function isInvisible(cp: number): boolean {
  return (
    cp === 0x00ad || // soft hyphen
    cp === 0x034f || // combining grapheme joiner
    cp === 0x061c || // Arabic letter mark
    cp === 0x180e || // Mongolian vowel separator
    (cp >= 0x200b && cp <= 0x200f) || // ZWSP, ZWNJ, ZWJ, LRM, RLM
    (cp >= 0x202a && cp <= 0x202e) || // bidi embeddings and overrides
    (cp >= 0x2060 && cp <= 0x2064) || // word joiner, invisible operators
    (cp >= 0x2066 && cp <= 0x2069) || // bidi isolates
    cp === 0xfeff || // BOM
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
    (cp >= 0xe0100 && cp <= 0xe01ef) || // variation selectors supplement
    (cp >= 0xe0000 && cp <= 0xe007f) // tag characters
  );
}

const isEmojiModifier = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff;

function isExtPict(cp: number): boolean {
  return cp > 0xff && EXT_PICT.test(String.fromCodePoint(cp));
}

/** Letters and marks in scripts such as Persian, Hindi, or Malayalam, where ZWJ and ZWNJ change how words render. */
function isJoiningScriptLetter(cp: number | undefined): boolean {
  if (cp === undefined || cp < 0x370) return false;
  const ch = String.fromCodePoint(cp);
  return NON_LATIN_LETTER.test(ch) && !LATIN_OR_COMMON.test(ch);
}

// The class lists single code points. Variation selectors are matched alone, not combined with a base.
// eslint-disable-next-line no-misleading-character-class
const HAS_INVISIBLE = /[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufe00-\ufe0f\ufeff\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/u;

function removeInvisible(text: string): { text: string; count: number } {
  if (!HAS_INVISIBLE.test(text)) return { text, count: 0 };
  const cps = Array.from(text, (ch) => ch.codePointAt(0) ?? 0);
  const out: number[] = [];
  let count = 0;
  // True while the last kept code point belongs to an emoji (base, modifier, VS16, keycap, tag).
  let inEmoji = false;
  // True while inside a flag tag sequence such as England's flag.
  let inTagSequence = false;

  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    if (!isInvisible(cp)) {
      out.push(cp);
      inTagSequence = cp === BLACK_FLAG;
      inEmoji = isExtPict(cp) || isEmojiModifier(cp) || cp === 0x20e3 || (inEmoji && cp >= 0x1f1e6 && cp <= 0x1f1ff);
      continue;
    }
    const previous = out[out.length - 1];
    let keep = false;
    if (cp === ZWJ) {
      keep = (inEmoji && i + 1 < cps.length && isExtPict(cps[i + 1])) || (isJoiningScriptLetter(previous) && isJoiningScriptLetter(cps[i + 1]));
    } else if (cp === ZWNJ) {
      keep = isJoiningScriptLetter(previous) && isJoiningScriptLetter(cps[i + 1]);
    } else if (cp >= 0xfe00 && cp <= 0xfe0f) {
      // VS15 and VS16 pick text or emoji style for a character that has both.
      keep = (cp === 0xfe0e || cp === 0xfe0f) && previous !== undefined && EMOJI.test(String.fromCodePoint(previous));
    } else if (cp >= 0xe0020 && cp <= 0xe007f) {
      keep = inTagSequence;
      if (cp === 0xe007f) inTagSequence = false;
    }
    if (keep) {
      out.push(cp);
      if (cp === ZWJ) inEmoji = false;
      else inEmoji = inEmoji || cp === 0xfe0f || (cp >= 0xe0020 && cp <= 0xe007f);
    } else {
      count++;
    }
  }
  if (!count) return { text, count };
  let result = "";
  // Build in chunks so very long inputs do not overflow the argument limit.
  for (let i = 0; i < out.length; i += 8192) result += String.fromCodePoint(...out.slice(i, i + 8192));
  return { text: result, count };
}

/* ------------------------------------------------------------------ */
/* Character replacements                                              */
/* ------------------------------------------------------------------ */

function replaceCounting(text: string, regex: RegExp, replacement: string): { text: string; count: number } {
  let count = 0;
  const result = text.replace(regex, () => {
    count++;
    return replacement;
  });
  return { text: result, count };
}

/** Replace each em dash with a hyphen that has one space on each side, except at a line edge. */
function spaceEmDashes(text: string): { text: string; count: number } {
  let count = 0;
  const result = text.replace(EM_DASHES, (match: string, offset: number, whole: string) => {
    count++;
    const before = offset === 0 || whole[offset - 1] === "\n" ? "" : " ";
    const next = whole[offset + match.length];
    const after = next === undefined || next === "\n" || next === "\r" ? "" : " ";
    return `${before}-${after}`;
  });
  return { text: result, count };
}

const UNUSUAL_SPACES = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;
const LINE_SEPARATORS = /[\u2028\u2029]/g;
const SINGLE_QUOTES = /[\u2018\u2019\u201a\u201b\u2032\u02bc\uff07]/g;
const DOUBLE_QUOTES = /[\u201c\u201d\u201e\u201f\u2033\uff02]/g;
// The lookbehind starts a match only at the beginning of a run of spaces, so long runs stay linear.
const EM_DASHES = /(?<![ \t])[ \t]*[\u2014\u2015][ \t]*/g;
const EN_DASHES = /[\u2010-\u2013\u2212]/g;

/* ------------------------------------------------------------------ */
/* Line-based passes: citations, Markdown, whitespace                  */
/* ------------------------------------------------------------------ */

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const INLINE_CODE_SPLIT = /(``[^`\n]+?``|`[^`\n]+`)/;

/** Apply `fn` to the parts of a line outside inline code spans. */
function outsideCode(line: string, fn: (part: string) => string): string {
  if (!line.includes("`")) return fn(line);
  return line
    .split(INLINE_CODE_SPLIT)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}

/** Run `fn` over every line outside fenced code blocks. */
function mapProseLines(text: string, fn: (line: string) => string): string {
  const lines = text.split("\n");
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const marker = FENCE.exec(lines[i]);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    lines[i] = fn(lines[i]);
  }
  return lines.join("\n");
}

// Numeric citations such as [1], [2, 3], and chains such as [1][2].
const NUMERIC_CITATION = /(?<![ \t])([ \t]*)((?:\[\d{1,3}(?:[ \t]?[,\u2013-][ \t]?\d{1,3}){0,10}\]){1,10})/g;
const CITATION_PATTERNS: RegExp[] = [
  /(?<![ \t])([ \t]*):?contentReference\[oaicite:\d{1,4}\](?:\{index=\d{1,4}\})?/g,
  /(?<![ \t])([ \t]*)\[oaicite:\d{1,4}\](?:\{index=\d{1,4}\})?/g,
  /(?<![ \t])([ \t]*)\u3010[^\u3010\u3011\n]{0,80}\u2020[^\u3010\u3011\n]{0,80}\u3011/g,
  /(?<![ \t])([ \t]*)\ue200[^\ue201\n]{0,200}\ue201/g,
];

const isWordChar = (ch: string | undefined) => ch !== undefined && /[\w$)\]]/.test(ch);

function removeCitationsInPart(part: string, counter: { n: number }): string {
  // Drop the space before a marker when a space, punctuation, or the line end follows, so "Paris [1]." becomes "Paris.".
  const keepSpace = (space: string, after: string | undefined) => (after === undefined || /[\s.,;:!?)\]]/.test(after) ? "" : space);
  let result = part;
  for (const pattern of CITATION_PATTERNS) {
    result = result.replace(pattern, (match: string, space: string, offset: number, whole: string) => {
      counter.n++;
      return keepSpace(space, whole[offset + match.length]);
    });
  }
  return result.replace(NUMERIC_CITATION, (match: string, space: string, marker: string, offset: number, whole: string) => {
    const before = whole[offset - 1];
    const after = whole[offset + match.length];
    if (!space && isWordChar(before)) {
      // Attached to a word, as in "capital[1].", but not code such as arr[1] = x or arr[1].length.
      if (before && /[\d_$)\]]/.test(before)) return match;
      if (after !== undefined && !/[\s,.!?:]/.test(after)) return match;
      if (after === "." && /\w/.test(whole[offset + match.length + 1] ?? "")) return match;
    }
    if (whole[offset + match.length] === "(" || whole[offset + match.length] === ":") return match;
    counter.n += (marker.match(/\[/g) ?? []).length;
    return keepSpace(space, after);
  });
}

function removeCitations(text: string): { text: string; count: number } {
  const counter = { n: 0 };
  const result = mapProseLines(text, (line) => outsideCode(line, (part) => removeCitationsInPart(part, counter)));
  return { text: result, count: counter.n };
}

const EMPHASIS: [RegExp, string][] = [
  [/\*\*\*(?=\S)([^*\n]+?)\*\*\*/g, "$1"],
  [/\*\*(?=\S)([^*\n]+?)\*\*/g, "$1"],
  [/(?<![\w_])__(?=\S)([^_\n]+?)__(?![\w_])/g, "$1"],
  [/~~(?=\S)([^~\n]+?)~~/g, "$1"],
  [/(?<![*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![*\w])/g, "$1"],
  [/(?<![\w_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\w_])/g, "$1"],
];
const LINK = /!?\[([^\]\n]*)\]\([^)\n]*\)/g;
const HEADING = /^([ \t]{0,3})#{1,6}[ \t]+/;
const HEADING_CLOSE = /[ \t]+#+[ \t]*$/;
const BLOCKQUOTE = /^([ \t]{0,3})(?:>[ \t]?)+/;
const LIST_MARKER = /^([ \t]*)(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/;

function removeMarkdown(text: string, lists: boolean): { text: string; count: number } {
  let count = 0;
  const count1 = (regex: RegExp, input: string, replacement: string) => {
    regex.lastIndex = 0;
    return input.replace(regex, (...args: unknown[]) => {
      count++;
      return replacement.replace("$1", String(args[1] ?? ""));
    });
  };
  const result = mapProseLines(text, (original) => {
    let line = original;
    if (HEADING.test(line)) {
      line = line.replace(HEADING, "$1").replace(HEADING_CLOSE, "");
      count++;
    }
    if (BLOCKQUOTE.test(line)) {
      line = line.replace(BLOCKQUOTE, "$1");
      count++;
    }
    if (lists && LIST_MARKER.test(line)) {
      line = line.replace(LIST_MARKER, "$1");
      count++;
    }
    line = outsideCode(line, (part) => {
      let out = count1(LINK, part, "$1");
      for (const [regex, replacement] of EMPHASIS) out = count1(regex, out, replacement);
      return out;
    });
    if (line.includes("`")) {
      line = line.replace(/(`{1,2})([^`\n]+?)\1/g, (_m: string, _ticks: string, code: string) => {
        count++;
        return code;
      });
    }
    return line;
  });
  return { text: result, count };
}

function cleanWhitespace(text: string): { text: string; count: number } {
  const lines = text.split("\n");
  const out: string[] = [];
  let count = 0;
  let blankRun = 0;
  for (const raw of lines) {
    const cr = raw.endsWith("\r");
    const body = cr ? raw.slice(0, -1) : raw;
    let end = body.length;
    while (end > 0 && (body.charCodeAt(end - 1) === 32 || body.charCodeAt(end - 1) === 9)) end--;
    const trimmed = end === body.length ? body : body.slice(0, end);
    if (trimmed !== body) count++;
    if (trimmed === "") {
      blankRun++;
      if (blankRun > 2) {
        if (trimmed === body) count++;
        continue;
      }
    } else {
      blankRun = 0;
    }
    out.push(cr ? `${trimmed}\r` : trimmed);
  }
  return { text: out.join("\n"), count };
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

/**
 * Clean text with the chosen options. The passes run in a fixed order:
 * invisible characters, spaces, citations, Markdown, quotes, dashes,
 * ellipses, then whitespace. Running it twice gives the same result.
 */
export function cleanText(input: string, options: Partial<CleanOptions> = {}): CleanResult {
  const o = { ...DEFAULT_CLEAN_OPTIONS, ...options };
  const counts = new Map<ChangeKind, number>();
  const add = (kind: ChangeKind, n: number) => n && counts.set(kind, (counts.get(kind) ?? 0) + n);
  let text = input;

  const apply = (kind: ChangeKind, step: { text: string; count: number }) => {
    text = step.text;
    add(kind, step.count);
  };

  if (o.invisible) apply("invisible", removeInvisible(text));
  if (o.spaces) {
    apply("spaces", replaceCounting(text, UNUSUAL_SPACES, " "));
    apply("spaces", replaceCounting(text, LINE_SEPARATORS, "\n"));
  }
  if (o.citations) apply("citations", removeCitations(text));
  if (o.markdown) apply("markdown", removeMarkdown(text, o.markdownLists));
  if (o.quotes) {
    apply("quotes", replaceCounting(text, SINGLE_QUOTES, "'"));
    apply("quotes", replaceCounting(text, DOUBLE_QUOTES, '"'));
  }
  if (o.dashes) {
    if (o.emDashStyle === "double") {
      apply("dashes", replaceCounting(text, /[\u2014\u2015]/g, "--"));
    } else {
      apply("dashes", spaceEmDashes(text));
    }
    apply("dashes", replaceCounting(text, EN_DASHES, "-"));
  }
  if (o.ellipsis) apply("ellipsis", replaceCounting(text, /\u2026/g, "..."));
  if (o.whitespace) apply("whitespace", cleanWhitespace(text));

  const order: ChangeKind[] = ["invisible", "spaces", "citations", "markdown", "quotes", "dashes", "ellipsis", "whitespace"];
  const changes = order
    .filter((kind) => counts.get(kind))
    .map((kind) => {
      const count = counts.get(kind) ?? 0;
      return { kind, count, label: CHANGE_LABELS[kind](count) };
    });
  return { output: text, changes, total: changes.reduce((sum, c) => sum + c.count, 0) };
}
