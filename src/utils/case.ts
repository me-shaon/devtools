/**
 * Case converter utility functions
 */

export type CaseType =
  | "camelCase"
  | "PascalCase"
  | "snake_case"
  | "UPPER_SNAKE_CASE"
  | "kebab-case"
  | "Train-Case"
  | "dot.case"
  | "Title Case"
  | "Sentence case"
  | "lowercase"
  | "UPPERCASE";

/** Every case, in the order the tool shows them. */
export const CASE_TYPES: CaseType[] = [
  "camelCase",
  "PascalCase",
  "snake_case",
  "UPPER_SNAKE_CASE",
  "kebab-case",
  "Train-Case",
  "dot.case",
  "Title Case",
  "Sentence case",
  "lowercase",
  "UPPERCASE",
];

export interface CaseOptions {
  /** Keep words written in capitals (ID, URL, HTTP) in capitals where a case capitalizes words. */
  keepAcronyms?: boolean;
}

// One word inside a run of letters and digits. In order: a plural acronym ("IDs"),
// an acronym that is not the start of a capitalized word ("HTTP" in "HTTPServer"),
// a lowercase or capitalized word, a number with an optional suffix ("3d"), and
// letters with no case (CJK). Digits stay with the word before them ("base64").
const WORD = /\p{Lu}{2,}\p{N}*s(?!\p{Ll})|\p{Lu}+\p{N}*(?!\p{Ll})|\p{Lu}?\p{Ll}+\p{N}*|\p{N}+\p{Ll}*|[\p{Lo}\p{Lt}\p{Lm}]+\p{N}*/gu;
const SEPARATOR = /[^\p{L}\p{N}]+/u;

/** Split an identifier or phrase into words, keeping the original spelling of each word. */
export function splitWords(str: string): string[] {
  return str.split(SEPARATOR).flatMap((chunk) => chunk.match(WORD) ?? []);
}

interface Word {
  original: string;
  lower: string;
  acronym: boolean;
}

// A word counts as an acronym only when it is written in capitals and the input
// also has lowercase letters. In "USER_ID" every word is capitals, so none is an acronym.
const toWords = (str: string, options: CaseOptions): Word[] => {
  const hasLower = /\p{Ll}/u.test(str);
  return splitWords(str).map((word) => ({
    original: word,
    lower: word.toLowerCase(),
    acronym: Boolean(options.keepAcronyms) && hasLower && /\p{Lu}/u.test(word) && !/\p{Lu}\p{Ll}/u.test(word.replace(/s$/, "")),
  }));
};

// The original spelling for an acronym ("ID", "IDs"), otherwise a capital first letter.
const capitalize = ({ original, lower, acronym }: Word): string =>
  acronym ? original : lower.charAt(0).toUpperCase() + lower.slice(1);

/**
 * Convert string to camelCase
 */
export function toCamelCase(str: string, options: CaseOptions = {}): string {
  return toWords(str, options)
    .map((word, i) => (i === 0 ? word.lower : capitalize(word)))
    .join("");
}

/**
 * Convert string to PascalCase
 */
export function toPascalCase(str: string, options: CaseOptions = {}): string {
  return toWords(str, options).map(capitalize).join("");
}

/**
 * Convert string to snake_case
 */
export function toSnakeCase(str: string): string {
  return toWords(str, {}).map((w) => w.lower).join("_");
}

/**
 * Convert string to kebab-case
 */
export function toKebabCase(str: string): string {
  return toWords(str, {}).map((w) => w.lower).join("-");
}

/**
 * Convert string to UPPER_SNAKE_CASE
 */
export function toUpperSnakeCase(str: string): string {
  return toSnakeCase(str).toUpperCase();
}

/**
 * Convert string to Train-Case, the style of HTTP header names
 */
export function toTrainCase(str: string, options: CaseOptions = {}): string {
  return toWords(str, options).map(capitalize).join("-");
}

/**
 * Convert string to dot.case
 */
export function toDotCase(str: string): string {
  return toWords(str, {}).map((w) => w.lower).join(".");
}

/**
 * Convert string to Sentence case
 */
export function toSentenceCase(str: string, options: CaseOptions = {}): string {
  return toWords(str, options)
    .map((word, i) => (i === 0 || word.acronym ? capitalize(word) : word.lower))
    .join(" ");
}

/**
 * Convert string to Title Case
 */
export function toTitleCase(str: string, options: CaseOptions = {}): string {
  return toWords(str, options).map(capitalize).join(" ");
}

/**
 * Convert string to all lowercase
 */
export function toLowerCase(str: string): string {
  return str.toLowerCase();
}

/**
 * Convert string to all UPPERCASE
 */
export function toUpperCase(str: string): string {
  return str.toUpperCase();
}

/**
 * Convert string to specified case type
 */
export function convertCase(str: string, caseType: CaseType, options: CaseOptions = {}): string {
  switch (caseType) {
    case "camelCase":
      return toCamelCase(str, options);
    case "PascalCase":
      return toPascalCase(str, options);
    case "snake_case":
      return toSnakeCase(str);
    case "UPPER_SNAKE_CASE":
      return toUpperSnakeCase(str);
    case "kebab-case":
      return toKebabCase(str);
    case "Train-Case":
      return toTrainCase(str, options);
    case "dot.case":
      return toDotCase(str);
    case "Title Case":
      return toTitleCase(str, options);
    case "Sentence case":
      return toSentenceCase(str, options);
    case "lowercase":
      return toLowerCase(str);
    case "UPPERCASE":
      return toUpperCase(str);
  }
}

/**
 * Convert each line on its own, so a list of names converts in one pass.
 * Lines are trimmed. Blank lines stay blank.
 */
export function convertLines(text: string, caseType: CaseType, options: CaseOptions = {}): string {
  return text
    .split(/\r?\n/)
    .map((line) => convertCase(line.trim(), caseType, options))
    .join("\n");
}

/**
 * Convert string to all case types
 */
export function convertToAllCases(str: string, options: CaseOptions = {}): Record<CaseType, string> {
  return Object.fromEntries(CASE_TYPES.map((type) => [type, convertLines(str, type, options)])) as Record<CaseType, string>;
}

/* ------------------------------------------------------------------ Slug */

export type SlugSeparator = "-" | "_";

export interface SlugOptions {
  separator?: SlugSeparator;
  /** Keep the letter case of the input instead of lowercasing it. */
  keepCase?: boolean;
  /** Cut the slug at a word boundary so it is at most this long. 0 or less means no limit. */
  maxLength?: number;
}

// Letters that NFKD does not split into a base letter and a mark.
const SLUG_LETTERS: Record<string, string> = {
  ß: "ss", ẞ: "SS", æ: "ae", Æ: "AE", ø: "o", Ø: "O", đ: "d", Đ: "D", ð: "d", Ð: "D",
  ł: "l", Ł: "L", þ: "th", Þ: "TH", œ: "oe", Œ: "OE", ı: "i",
};
const SLUG_LETTER = new RegExp(`[${Object.keys(SLUG_LETTERS).join("")}]`, "g");

/**
 * Convert text to a URL slug. Accents are removed, other symbols become the
 * separator, and apostrophes are dropped so "don't" becomes "dont". Letters
 * with no ASCII form, such as CJK, are removed.
 */
export function toSlug(str: string, options: SlugOptions = {}): string {
  const { separator = "-", keepCase = false, maxLength = 0 } = options;
  let ascii = str
    .replace(SLUG_LETTER, (c) => SLUG_LETTERS[c])
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, "");
  if (!keepCase) ascii = ascii.toLowerCase();
  const words = ascii.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (maxLength <= 0) return words.join(separator);

  // Add whole words while they fit. A first word that is too long is cut.
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}${separator}${word}` : word;
    if (next.length > maxLength) return slug || word.slice(0, maxLength);
    slug = next;
  }
  return slug;
}

/** Convert each line to a slug on its own. Blank lines stay blank. */
export function slugLines(text: string, options: SlugOptions = {}): string {
  return text
    .split(/\r?\n/)
    .map((line) => toSlug(line, options))
    .join("\n");
}
