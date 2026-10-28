/**
 * String Inspector utilities: text statistics and a per-code-point breakdown
 * that flags invisible, control, and bidirectional characters.
 */

type Granularity = "grapheme" | "word" | "sentence";

interface Segment {
  segment: string;
  isWordLike?: boolean;
}

interface Segmenter {
  segment(input: string): Iterable<Segment>;
}

type SegmenterConstructor = new (locale?: string, options?: { granularity: Granularity }) => Segmenter;

// Intl.Segmenter is ES2022. The app targets ES2020 typings, so read it loosely.
const SegmenterCtor = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;

const segmenters = new Map<Granularity, Segmenter>();

function getSegmenter(granularity: Granularity): Segmenter | null {
  if (!SegmenterCtor) return null;
  let segmenter = segmenters.get(granularity);
  if (!segmenter) {
    segmenter = new SegmenterCtor(undefined, { granularity });
    segmenters.set(granularity, segmenter);
  }
  return segmenter;
}

/** Split text into user-perceived characters (grapheme clusters). */
export function splitGraphemes(text: string): string[] {
  const segmenter = getSegmenter("grapheme");
  if (!segmenter) return Array.from(text);
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

export type LineEnding = "none" | "LF" | "CRLF" | "CR" | "mixed";

export interface StringStats {
  /** Grapheme clusters, the characters a reader sees. */
  graphemes: number;
  /** UTF-16 code units, what JavaScript `length` reports. */
  codeUnits: number;
  codePoints: number;
  words: number;
  lines: number;
  sentences: number;
  /** UTF-8 byte length. */
  bytes: number;
  whitespace: number;
  /** Length of the longest line, in grapheme clusters. */
  longestLine: number;
  /** 1-based number of the longest line, or 0 for empty text. */
  longestLineNumber: number;
  lineEnding: LineEnding;
}

const WHITESPACE = /^\p{White_Space}$/u;

function isWhitespace(codePoint: number): boolean {
  if (codePoint === 0x20 || (codePoint >= 0x09 && codePoint <= 0x0d)) return true;
  if (codePoint < 0x85) return false;
  return WHITESPACE.test(String.fromCodePoint(codePoint));
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

function isLineBreak(segment: string): boolean {
  return segment === "\n" || segment === "\r\n" || segment === "\r";
}

/** Compute live statistics for a string in linear time. */
export function getStringStats(text: string): StringStats {
  let codePoints = 0;
  let bytes = 0;
  let whitespace = 0;
  let lf = 0;
  let crlf = 0;
  let cr = 0;

  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    let codePoint = unit;
    if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = (unit - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    codePoints++;
    bytes += utf8Length(codePoint);
    if (codePoint === 0x0a) lf++;
    else if (codePoint === 0x0d) {
      if (text.charCodeAt(i + 1) === 0x0a) {
        crlf++;
        lf--; // The LF that follows is counted as part of this CRLF.
      } else cr++;
    }
    if (isWhitespace(codePoint)) whitespace++;
  }

  let graphemes = 0;
  let longestLine = 0;
  let longestLineNumber = 0;
  if (text) {
    let line = 1;
    let current = 0;
    const finishLine = () => {
      if (current > longestLine || longestLineNumber === 0) {
        longestLine = current;
        longestLineNumber = line;
      }
    };
    const segmenter = getSegmenter("grapheme");
    // Without Intl.Segmenter, fall back to code points and join CRLF by hand.
    const segments: Iterable<string | Segment> = segmenter ? segmenter.segment(text) : text;
    let previous = "";
    for (const item of segments) {
      const segment = typeof item === "string" ? item : item.segment;
      if (segment === "\n" && previous === "\r" && !segmenter) {
        previous = segment;
        continue;
      }
      graphemes++;
      if (isLineBreak(segment)) {
        finishLine();
        line++;
        current = 0;
      } else {
        current++;
      }
      previous = segment;
    }
    finishLine();
  }

  const breaks = lf + crlf + cr;
  const kinds = [lf, crlf, cr].filter((n) => n > 0).length;
  const lineEnding: LineEnding = breaks === 0 ? "none" : kinds > 1 ? "mixed" : crlf ? "CRLF" : cr ? "CR" : "LF";

  return {
    graphemes,
    codeUnits: text.length,
    codePoints,
    words: countWords(text),
    lines: text ? breaks + 1 : 0,
    sentences: countSentences(text),
    bytes,
    whitespace,
    longestLine,
    longestLineNumber,
    lineEnding,
  };
}

function countWords(text: string): number {
  if (!text.trim()) return 0;
  const segmenter = getSegmenter("word");
  if (!segmenter) return text.trim().split(/\s+/u).length;
  let words = 0;
  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike) words++;
  }
  return words;
}

function countSentences(text: string): number {
  if (!text.trim()) return 0;
  const segmenter = getSegmenter("sentence");
  if (!segmenter) return text.split(/[.!?]+(?:\s+|$)/u).filter((s) => s.trim()).length;
  let sentences = 0;
  for (const segment of segmenter.segment(text)) {
    if (segment.segment.trim()) sentences++;
  }
  return sentences;
}

export type CharCategory =
  | "letter"
  | "mark"
  | "digit"
  | "number"
  | "punctuation"
  | "symbol"
  | "emoji"
  | "whitespace"
  | "control"
  | "format"
  | "surrogate"
  | "private use"
  | "unassigned";

/** Why a character deserves attention. */
export type CharFlag = "invisible" | "control" | "bidi";

interface KnownChar {
  abbr: string;
  label: string;
  flag?: CharFlag;
}

/**
 * Names for characters that are hard to see. Full Unicode names are not
 * bundled, so only these characters get a name.
 */
const KNOWN_CHARS: Record<number, KnownChar> = {
  0x00: { abbr: "NUL", label: "Null", flag: "control" },
  0x09: { abbr: "TAB", label: "Tab" },
  0x0a: { abbr: "LF", label: "Line feed" },
  0x0b: { abbr: "VT", label: "Vertical tab", flag: "control" },
  0x0c: { abbr: "FF", label: "Form feed", flag: "control" },
  0x0d: { abbr: "CR", label: "Carriage return" },
  0x1b: { abbr: "ESC", label: "Escape", flag: "control" },
  0x20: { abbr: "SP", label: "Space" },
  0x7f: { abbr: "DEL", label: "Delete", flag: "control" },
  0x85: { abbr: "NEL", label: "Next line", flag: "control" },
  0xa0: { abbr: "NBSP", label: "No-break space", flag: "invisible" },
  0xad: { abbr: "SHY", label: "Soft hyphen", flag: "invisible" },
  0x34f: { abbr: "CGJ", label: "Combining grapheme joiner", flag: "invisible" },
  0x61c: { abbr: "ALM", label: "Arabic letter mark", flag: "bidi" },
  0x115f: { abbr: "HCF", label: "Hangul choseong filler", flag: "invisible" },
  0x1160: { abbr: "HJF", label: "Hangul jungseong filler", flag: "invisible" },
  0x180e: { abbr: "MVS", label: "Mongolian vowel separator", flag: "invisible" },
  0x2000: { abbr: "NQSP", label: "En quad", flag: "invisible" },
  0x2001: { abbr: "MQSP", label: "Em quad", flag: "invisible" },
  0x2002: { abbr: "ENSP", label: "En space", flag: "invisible" },
  0x2003: { abbr: "EMSP", label: "Em space", flag: "invisible" },
  0x2004: { abbr: "3/MSP", label: "Three-per-em space", flag: "invisible" },
  0x2005: { abbr: "4/MSP", label: "Four-per-em space", flag: "invisible" },
  0x2006: { abbr: "6/MSP", label: "Six-per-em space", flag: "invisible" },
  0x2007: { abbr: "FSP", label: "Figure space", flag: "invisible" },
  0x2008: { abbr: "PSP", label: "Punctuation space", flag: "invisible" },
  0x2009: { abbr: "THSP", label: "Thin space", flag: "invisible" },
  0x200a: { abbr: "HSP", label: "Hair space", flag: "invisible" },
  0x200b: { abbr: "ZWSP", label: "Zero-width space", flag: "invisible" },
  0x200c: { abbr: "ZWNJ", label: "Zero-width non-joiner", flag: "invisible" },
  0x200d: { abbr: "ZWJ", label: "Zero-width joiner", flag: "invisible" },
  0x200e: { abbr: "LRM", label: "Left-to-right mark", flag: "bidi" },
  0x200f: { abbr: "RLM", label: "Right-to-left mark", flag: "bidi" },
  0x2028: { abbr: "LSEP", label: "Line separator", flag: "invisible" },
  0x2029: { abbr: "PSEP", label: "Paragraph separator", flag: "invisible" },
  0x202a: { abbr: "LRE", label: "Left-to-right embedding", flag: "bidi" },
  0x202b: { abbr: "RLE", label: "Right-to-left embedding", flag: "bidi" },
  0x202c: { abbr: "PDF", label: "Pop directional formatting", flag: "bidi" },
  0x202d: { abbr: "LRO", label: "Left-to-right override", flag: "bidi" },
  0x202e: { abbr: "RLO", label: "Right-to-left override", flag: "bidi" },
  0x202f: { abbr: "NNBSP", label: "Narrow no-break space", flag: "invisible" },
  0x205f: { abbr: "MMSP", label: "Medium mathematical space", flag: "invisible" },
  0x2060: { abbr: "WJ", label: "Word joiner", flag: "invisible" },
  0x2061: { abbr: "FA", label: "Function application", flag: "invisible" },
  0x2062: { abbr: "IT", label: "Invisible times", flag: "invisible" },
  0x2063: { abbr: "IS", label: "Invisible separator", flag: "invisible" },
  0x2064: { abbr: "IP", label: "Invisible plus", flag: "invisible" },
  0x2066: { abbr: "LRI", label: "Left-to-right isolate", flag: "bidi" },
  0x2067: { abbr: "RLI", label: "Right-to-left isolate", flag: "bidi" },
  0x2068: { abbr: "FSI", label: "First strong isolate", flag: "bidi" },
  0x2069: { abbr: "PDI", label: "Pop directional isolate", flag: "bidi" },
  0x3000: { abbr: "IDSP", label: "Ideographic space", flag: "invisible" },
  0x3164: { abbr: "HF", label: "Hangul filler", flag: "invisible" },
  0xfeff: { abbr: "BOM", label: "Byte order mark (zero-width no-break space)", flag: "invisible" },
  0xffa0: { abbr: "HWHF", label: "Halfwidth Hangul filler", flag: "invisible" },
  0xfffc: { abbr: "OBJ", label: "Object replacement character", flag: "invisible" },
  0xfffd: { abbr: "FFFD", label: "Replacement character" },
};

function knownChar(codePoint: number): KnownChar | undefined {
  const known = KNOWN_CHARS[codePoint];
  if (known) return known;
  if (codePoint >= 0xfe00 && codePoint <= 0xfe0f) {
    return { abbr: `VS${codePoint - 0xfe00 + 1}`, label: `Variation selector ${codePoint - 0xfe00 + 1}` };
  }
  if (codePoint >= 0xe0000 && codePoint <= 0xe007f) {
    return { abbr: "TAG", label: "Tag character", flag: "invisible" };
  }
  if (codePoint < 0x20 || (codePoint >= 0x80 && codePoint <= 0x9f)) {
    return { abbr: `^${codePoint.toString(16).toUpperCase().padStart(2, "0")}`, label: "Control character", flag: "control" };
  }
  return undefined;
}

const CATEGORY_TESTS: [CharCategory, RegExp][] = [
  ["control", /^\p{Cc}$/u],
  ["whitespace", /^\p{White_Space}$/u],
  ["format", /^\p{Cf}$/u],
  ["emoji", /^\p{Extended_Pictographic}$/u],
  ["letter", /^\p{L}$/u],
  ["mark", /^\p{M}$/u],
  ["digit", /^\p{Nd}$/u],
  ["number", /^\p{N}$/u],
  ["punctuation", /^\p{P}$/u],
  ["symbol", /^\p{S}$/u],
  ["private use", /^\p{Co}$/u],
  ["surrogate", /^\p{Cs}$/u],
];

/** A coarse category for one code point, from Unicode property escapes. */
export function getCharCategory(char: string): CharCategory {
  for (const [category, test] of CATEGORY_TESTS) {
    if (test.test(char)) return category;
  }
  return "unassigned";
}

/** UTF-8 bytes of one code point as uppercase hex pairs. Lone surrogates encode as U+FFFD. */
export function utf8Hex(char: string): string {
  return Array.from(new TextEncoder().encode(char), (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

/** Format a code point as U+XXXX. */
export function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

export interface CharInfo {
  codePoint: number;
  char: string;
  /** What to show as the glyph. Hard-to-see characters get a visible stand-in. */
  display: string;
  hex: string;
  category: CharCategory;
  utf8: string;
  count: number;
  /** Short name, for characters this module knows by name. */
  abbr?: string;
  label?: string;
  flag?: CharFlag;
  /** Where the character first appears, 1-based. */
  firstLine: number;
  firstColumn: number;
}

export interface CharInspection {
  /** Distinct code points, in order of first appearance, up to the limit. */
  chars: CharInfo[];
  distinct: number;
  truncated: boolean;
  /** Distinct characters that carry a flag, including any past the limit. */
  flagged: CharInfo[];
  /** Total occurrences of flagged characters. */
  flaggedCount: number;
}

function describeChar(char: string, codePoint: number, line: number, column: number): CharInfo {
  const category = getCharCategory(char);
  const known = knownChar(codePoint);
  let flag = known?.flag;
  if (!flag && category === "format") flag = "invisible";
  let display = char;
  if (known && (known.flag || category === "whitespace" || category === "control")) display = known.abbr;
  else if (category === "mark") display = `◌${char}`;
  else if (category === "format" || category === "surrogate") display = known?.abbr ?? "◌";
  return {
    codePoint,
    char,
    display,
    hex: formatCodePoint(codePoint),
    category,
    utf8: utf8Hex(char),
    count: 0,
    abbr: known?.abbr,
    label: known?.label ?? (category === "format" ? "Format character" : category === "surrogate" ? "Lone surrogate" : undefined),
    flag,
    firstLine: line,
    firstColumn: column,
  };
}

/** List each distinct code point with its category, UTF-8 bytes, and count. */
export function inspectCharacters(text: string, limit = 500): CharInspection {
  const seen = new Map<number, CharInfo>();
  const order: CharInfo[] = [];
  let line = 1;
  let column = 1;
  let previous = -1;

  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    let info = seen.get(codePoint);
    if (!info) {
      info = describeChar(char, codePoint, line, column);
      seen.set(codePoint, info);
      order.push(info);
    }
    info.count++;
    if (codePoint === 0x0a) {
      if (previous !== 0x0d) line++;
      column = 1;
    } else if (codePoint === 0x0d) {
      line++;
      column = 1;
    } else {
      column++;
    }
    previous = codePoint;
  }

  const flagged = order.filter((c) => c.flag);
  return {
    chars: order.slice(0, limit),
    distinct: order.length,
    truncated: order.length > limit,
    flagged,
    flaggedCount: flagged.reduce((sum, c) => sum + c.count, 0),
  };
}

/** Remove every flagged character (invisible, control, and bidi) from the text. Keeps tabs and line breaks. */
export function stripFlaggedCharacters(text: string): string {
  const out: string[] = [];
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    const known = knownChar(codePoint);
    if (known?.flag) continue;
    if (!known && /^\p{Cf}$/u.test(char)) continue;
    out.push(char);
  }
  return out.join("");
}

/* --------------------------------------------------------- Normalization */

export type NormalizationForm = "NFC" | "NFD" | "NFKC" | "NFKD";

export const NORMALIZATION_FORMS: NormalizationForm[] = ["NFC", "NFD", "NFKC", "NFKD"];

export interface NormalizedForm {
  form: NormalizationForm;
  value: string;
  /** True when the input is already in this form. */
  same: boolean;
  codePoints: number;
  codeUnits: number;
  bytes: number;
}

function measure(text: string): Pick<NormalizedForm, "codePoints" | "codeUnits" | "bytes"> {
  let codePoints = 0;
  let bytes = 0;
  for (const char of text) {
    codePoints++;
    bytes += utf8Length(char.codePointAt(0) ?? 0);
  }
  return { codePoints, codeUnits: text.length, bytes };
}

const isAscii = (text: string) => /^\p{ASCII}*$/u.test(text);

/** The text in each Unicode normalization form, with its lengths. */
export function getNormalizedForms(text: string): NormalizedForm[] {
  // ASCII text is the same in every form, so no form needs a pass.
  const ascii = isAscii(text);
  const input = measure(text);
  return NORMALIZATION_FORMS.map((form) => {
    const value = ascii ? text : text.normalize(form);
    const same = value === text;
    // Measure a form only when it differs from the input.
    return { form, value: same ? text : value, same, ...(same ? input : measure(value)) };
  });
}

export interface NormalizationVariant {
  /** The NFC form that every spelling shares. */
  nfc: string;
  /** Distinct spellings in the text, as U+XXXX code point lists, in order of first appearance. */
  spellings: string[][];
}

export interface NormalizationVariants {
  variants: NormalizationVariant[];
  /** UTF-16 code units of the text that were checked. */
  checked: number;
  /** True when the text was longer than the limit and only its start was checked. */
  truncated: boolean;
}

/** How much text the variant check reads, in UTF-16 code units. */
export const VARIANT_CHECK_LIMIT = 200_000;

/**
 * Find characters that the text writes in more than one way, such as `é` as
 * U+00E9 in one place and `e` + U+0301 in another. They look the same but
 * do not compare equal. Only the first `limit` code units are checked.
 */
export function findNormalizationVariants(text: string, limit = VARIANT_CHECK_LIMIT): NormalizationVariants {
  const truncated = text.length > limit;
  let end = truncated ? limit : text.length;
  // Do not cut a surrogate pair in half.
  if (truncated && end > 0 && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  const sample = truncated ? text.slice(0, end) : text;
  const variants: NormalizationVariant[] = [];
  const result = { variants, checked: sample.length, truncated };
  if (isAscii(sample)) return result;

  const groups = new Map<string, Set<string>>();
  const graphemes = splitGraphemes(sample);
  // The last grapheme of a cut sample can be missing its combining marks.
  if (truncated) graphemes.pop();
  for (const grapheme of graphemes) {
    if (isAscii(grapheme)) continue;
    const nfc = grapheme.normalize("NFC");
    let spellings = groups.get(nfc);
    if (!spellings) {
      spellings = new Set();
      groups.set(nfc, spellings);
    }
    spellings.add(grapheme);
  }
  for (const [nfc, spellings] of groups) {
    if (spellings.size < 2) continue;
    variants.push({
      nfc,
      spellings: Array.from(spellings, (s) => Array.from(s, (c) => formatCodePoint(c.codePointAt(0) ?? 0))),
    });
  }
  return result;
}
