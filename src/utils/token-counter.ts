/**
 * Token counting for the Token Counter tool.
 *
 * Exact counts use the OpenAI `o200k_base` encoding (GPT-4o and newer). The
 * encoding and its ~2.4 MB rank table load on first use through a dynamic
 * import, so they stay in their own chunk. Counts for other model families are
 * estimates derived from the o200k count.
 */

type O200k = typeof import("gpt-tokenizer/encoding/o200k_base");

let encodingPromise: Promise<O200k> | null = null;

/** Loads the o200k_base encoding once. Only this encoding is imported. */
export const loadO200k = (): Promise<O200k> => {
  if (!encodingPromise) {
    encodingPromise = import("gpt-tokenizer/encoding/o200k_base").catch((error) => {
      encodingPromise = null;
      throw error;
    });
  }
  return encodingPromise;
};

/** Special token strings such as `<|endoftext|>` count as plain text, the way a chat API treats user input. */
const ENCODE_OPTIONS = { disallowedSpecial: new Set<string>() };

/* ------------------------------------------------------------------ */
/* Text statistics                                                     */
/* ------------------------------------------------------------------ */

export interface TextStats {
  /** Unicode code points. */
  characters: number;
  words: number;
  lines: number;
  bytes: number;
  /** Code points in CJK scripts (Han, Hiragana, Katakana, Hangul). */
  cjk: number;
  /** Code points above U+007F that are not CJK. */
  otherNonAscii: number;
}

const isCjk = (cp: number) =>
  (cp >= 0x3040 && cp <= 0x30ff) || // Hiragana, Katakana
  (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Extension A
  (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
  (cp >= 0xac00 && cp <= 0xd7af) || // Hangul syllables
  (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
  (cp >= 0x20000 && cp <= 0x3134f); // CJK Extensions B to G

const isSpace = (cp: number) => cp === 0x20 || (cp >= 0x09 && cp <= 0x0d) || cp === 0xa0 || cp === 0x3000 || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x2028 || cp === 0x2029 || cp === 0x1680 || cp === 0x202f || cp === 0x205f || cp === 0xfeff || cp === 0x85;

/** Counts characters, words, lines and UTF-8 bytes in one pass. */
export const getTextStats = (text: string): TextStats => {
  let characters = 0;
  let words = 0;
  let lines = text ? 1 : 0;
  let bytes = 0;
  let cjk = 0;
  let otherNonAscii = 0;
  let inWord = false;

  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    characters++;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;

    if (cp === 0x0a) lines++;
    else if (cp === 0x0d) {
      // CRLF counts once; a lone CR also ends a line.
      if (text.charCodeAt(i + 1) !== 0x0a) lines++;
    }

    if (isSpace(cp)) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      words++;
    }

    if (cp > 0x7f) {
      if (isCjk(cp)) cjk++;
      else otherNonAscii++;
    }
  }

  return { characters, words, lines, bytes, cjk, otherNonAscii };
};

/* ------------------------------------------------------------------ */
/* Exact o200k counting, in chunks                                     */
/* ------------------------------------------------------------------ */

export const CHUNK_SIZE = 32_768;

const isLetterOrDigit = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
const isLetter = (ch: string) => /\p{L}/u.test(ch);

/**
 * Finds a split point at or after `from` where the o200k pre-tokenizer always
 * ends a piece, so that counting the chunks separately gives the same total as
 * counting the whole text. Safe points are:
 * - right after a line break that is followed by a non-space character other than "/";
 * - right before a single space that sits between a letter or digit and a letter.
 * Returns -1 when no safe point exists before the end of the text.
 */
export const findSafeSplit = (text: string, from: number): number => {
  for (let i = Math.max(1, from); i < text.length; i++) {
    const prev = text[i - 1];
    const ch = text[i];
    // A "/" after a line break can join the punctuation piece before it, so it is not safe.
    if ((prev === "\n" || prev === "\r") && ch !== "/" && !/\s/.test(ch)) return i;
    if (ch === " " && i + 1 < text.length && isLetterOrDigit(prev) && isLetter(text[i + 1])) return i;
  }
  return -1;
};

/** Splits text into chunks of about `size` characters at safe split points. */
export const splitForCounting = (text: string, size = CHUNK_SIZE): string[] => {
  const chunks: string[] = [];
  let start = 0;
  while (text.length - start > size) {
    const split = findSafeSplit(text, start + size);
    if (split < 0) break;
    chunks.push(text.slice(start, split));
    start = split;
  }
  chunks.push(text.slice(start));
  return chunks;
};

export interface TokenPiece {
  /** Decoded text of the piece. */
  text: string;
  /** Number of tokens in the piece. More than 1 when a character spans several byte-level tokens. */
  tokens: number;
}

export interface O200kResult {
  count: number;
  /** The first tokens as decoded pieces, for the token view. */
  pieces: TokenPiece[];
  /** True when the text has more tokens than `pieces` shows. */
  truncated: boolean;
}

export const TOKEN_VIEW_LIMIT = 2_000;

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Turns token ids into readable pieces. A token that holds only part of a
 * multi-byte character decodes to U+FFFD on its own, so it joins the next
 * tokens until the piece decodes cleanly.
 */
export const decodePieces = (encoding: Pick<O200k, "decode">, ids: number[]): TokenPiece[] => {
  const pieces: TokenPiece[] = [];
  let group: number[] = [];
  for (const id of ids) {
    group.push(id);
    const text = encoding.decode(group);
    if (text.includes("�") && group.length < 4) continue;
    pieces.push({ text, tokens: group.length });
    group = [];
  }
  if (group.length) pieces.push({ text: encoding.decode(group), tokens: group.length });
  return pieces;
};

/**
 * Counts o200k tokens. Large text is counted in chunks with a pause between
 * them, so typing stays responsive. Pass a signal to stop a stale count.
 */
export const countO200k = async (
  text: string,
  options: { signal?: AbortSignal; pieceLimit?: number; chunkSize?: number } = {},
): Promise<O200kResult> => {
  const { signal, pieceLimit = 0, chunkSize = CHUNK_SIZE } = options;
  const encoding = await loadO200k();
  const chunks = splitForCounting(text, chunkSize);
  let count = 0;
  const pieceIds: number[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new DOMException("Counting stopped", "AbortError");
    const ids = encoding.encode(chunks[i], ENCODE_OPTIONS);
    count += ids.length;
    if (pieceIds.length < pieceLimit) pieceIds.push(...ids.slice(0, pieceLimit - pieceIds.length + 4));
    if (i < chunks.length - 1) await yieldToBrowser();
  }
  if (signal?.aborted) throw new DOMException("Counting stopped", "AbortError");

  let pieces: TokenPiece[] = [];
  if (pieceLimit > 0) {
    pieces = decodePieces(encoding, pieceIds);
    let shown = 0;
    let keep = 0;
    while (keep < pieces.length && shown + pieces[keep].tokens <= pieceLimit) {
      shown += pieces[keep].tokens;
      keep++;
    }
    pieces = pieces.slice(0, keep);
    return { count, pieces, truncated: shown < count };
  }
  return { count, pieces, truncated: false };
};

/**
 * Makes whitespace visible in the token view: · for a space, → for a tab, and
 * ↵ for a line break. The line break itself stays after the ↵ so lines still wrap.
 */
export const visibleWhitespace = (text: string): string =>
  text.replace(/ /g, "·").replace(/\t/g, "→").replace(/\r\n|\r|\n/g, "↵\n");

/* ------------------------------------------------------------------ */
/* Estimates                                                           */
/* ------------------------------------------------------------------ */

export type TokenBasis = "openai" | "claude" | "gemini" | "llama" | "rule";

export interface EstimateFamily {
  id: Exclude<TokenBasis, "openai">;
  label: string;
  /** Multiplier on the o200k count. Not used by the rule of thumb. */
  factor: number;
  low: number;
  high: number;
  method: string;
}

/**
 * Per-family multipliers on the o200k count. These are rough averages for
 * English prose and code. Text in other languages can fall outside the range.
 */
export const ESTIMATE_FAMILIES: EstimateFamily[] = [
  { id: "claude", label: "Claude", factor: 1.2, low: 1.0, high: 1.35, method: "o200k count × 1.2" },
  { id: "gemini", label: "Gemini", factor: 1.0, low: 0.9, high: 1.15, method: "o200k count × 1.0" },
  { id: "llama", label: "Llama 3 and later", factor: 1.1, low: 1.0, high: 1.25, method: "o200k count × 1.1" },
  { id: "rule", label: "Rule of thumb", factor: 1, low: 0.75, high: 1.5, method: "ASCII characters ÷ 4, CJK characters × 1, other characters ÷ 2" },
];

export const BASIS_LABELS: Record<TokenBasis, string> = {
  openai: "OpenAI o200k (exact)",
  claude: "Claude (estimate)",
  gemini: "Gemini (estimate)",
  llama: "Llama (estimate)",
  rule: "Rule of thumb (estimate)",
};

/** The characters-based rule of thumb: about 4 ASCII characters per token, 1 token per CJK character, 2 characters per token otherwise. */
export const ruleOfThumbTokens = (stats: Pick<TextStats, "characters" | "cjk" | "otherNonAscii">): number => {
  if (stats.characters === 0) return 0;
  const ascii = stats.characters - stats.cjk - stats.otherNonAscii;
  return Math.max(1, Math.ceil(ascii / 4 + stats.cjk + stats.otherNonAscii / 2));
};

export interface TokenEstimate {
  value: number;
  low: number;
  high: number;
}

/** Estimates a family's token count from the o200k count (or the text stats for the rule of thumb). */
export const estimateTokens = (family: EstimateFamily, o200kCount: number, stats: TextStats): TokenEstimate => {
  if (family.id === "rule") {
    const value = ruleOfThumbTokens(stats);
    return { value, low: Math.floor(value * family.low), high: Math.ceil(value * family.high) };
  }
  return {
    value: Math.round(o200kCount * family.factor),
    low: Math.floor(o200kCount * family.low),
    high: Math.ceil(o200kCount * family.high),
  };
};

/** The token count to use for a cost row, exact for OpenAI and estimated otherwise. */
export const tokensForBasis = (basis: TokenBasis, o200kCount: number, stats: TextStats): number => {
  if (basis === "openai") return o200kCount;
  const family = ESTIMATE_FAMILIES.find((f) => f.id === basis);
  return family ? estimateTokens(family, o200kCount, stats).value : o200kCount;
};

/* ------------------------------------------------------------------ */
/* Cost                                                                */
/* ------------------------------------------------------------------ */

export interface PriceRow {
  id: string;
  name: string;
  /** US dollars per 1M input tokens. */
  input: number;
  /** US dollars per 1M output tokens. */
  output: number;
  /** Which token count the row uses. */
  basis: TokenBasis;
}

export interface Cost {
  input: number;
  output: number;
  total: number;
}

export const costFor = (row: Pick<PriceRow, "input" | "output">, inputTokens: number, outputTokens: number): Cost => {
  const input = (inputTokens / 1_000_000) * row.input;
  const output = (outputTokens / 1_000_000) * row.output;
  return { input, output, total: input + output };
};

/**
 * Formats US dollars with sensible precision: two decimals from $1 up, and two
 * significant digits below $1 (for example $0.000123 becomes "$0.00012").
 */
export const formatUsd = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  if (value >= 1) return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (value < 0.000001) return "< $0.000001";
  const rounded = Number(value.toPrecision(2));
  if (rounded >= 1) return "$1.00";
  const decimals = Math.max(2, 1 - Math.floor(Math.log10(rounded)));
  return `$${rounded.toFixed(decimals)}`;
};

/* ------------------------------------------------------------------ */
/* Price table import and export                                       */
/* ------------------------------------------------------------------ */

export const PRICE_TABLE_LIMIT = 200;
export const MODEL_NAME_LIMIT = 100;
const BASES: TokenBasis[] = ["openai", "claude", "gemini", "llama", "rule"];

export const newRowId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Exports the table as shareable JSON. Row ids are left out. */
export const exportPriceTable = (rows: PriceRow[]): string =>
  JSON.stringify(
    { version: 1, unit: "USD per 1M tokens", models: rows.map(({ name, input, output, basis }) => ({ name, input, output, basis })) },
    null,
    2,
  );

export type ImportResult = { ok: true; rows: PriceRow[] } | { ok: false; error: string };

const isPrice = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000;

/** Validates pasted JSON: either `{ "models": [...] }` or a bare array of `{ name, input, output, basis? }`. */
export const importPriceTable = (json: string): ImportResult => {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: "The text is not valid JSON." };
  }
  const list = Array.isArray(data) ? data : data && typeof data === "object" ? (data as { models?: unknown }).models : undefined;
  if (!Array.isArray(list)) return { ok: false, error: "Expected a \"models\" array." };
  if (list.length > PRICE_TABLE_LIMIT) return { ok: false, error: `The table can hold up to ${PRICE_TABLE_LIMIT} models.` };

  const rows: PriceRow[] = [];
  for (let i = 0; i < list.length; i++) {
    const entry = list[i] as Record<string, unknown> | null;
    const where = `Model ${i + 1}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return { ok: false, error: `${where} is not an object.` };
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name) return { ok: false, error: `${where} needs a name.` };
    if (name.length > MODEL_NAME_LIMIT) return { ok: false, error: `${where} has a name longer than ${MODEL_NAME_LIMIT} characters.` };
    if (!isPrice(entry.input)) return { ok: false, error: `${where} needs an input price of 0 or more.` };
    if (!isPrice(entry.output)) return { ok: false, error: `${where} needs an output price of 0 or more.` };
    const basis = entry.basis === undefined ? "openai" : entry.basis;
    if (!BASES.includes(basis as TokenBasis)) return { ok: false, error: `${where} has an unknown basis. Use one of: ${BASES.join(", ")}.` };
    rows.push({ id: newRowId(), name, input: entry.input, output: entry.output, basis: basis as TokenBasis });
  }
  return { ok: true, rows };
};

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

export const PRICE_STORAGE_KEY = "devtools-token-counter-prices";

export const loadPriceRows = (): PriceRow[] => {
  try {
    const raw = localStorage.getItem(PRICE_STORAGE_KEY);
    if (!raw) return [];
    const result = importPriceTable(raw);
    return result.ok ? result.rows : [];
  } catch {
    return [];
  }
};

export const savePriceRows = (rows: PriceRow[]) => {
  try {
    localStorage.setItem(PRICE_STORAGE_KEY, exportPriceTable(rows));
  } catch {
    /* The table still works for this session. */
  }
};

/* ------------------------------------------------------------------ */
/* Context window                                                      */
/* ------------------------------------------------------------------ */

export const CONTEXT_PRESETS = [
  { label: "8K", value: 8_192 },
  { label: "32K", value: 32_768 },
  { label: "128K", value: 128_000 },
  { label: "200K", value: 200_000 },
  { label: "1M", value: 1_000_000 },
];

export const contextUsage = (tokens: number, context: number) => {
  const percent = context > 0 ? (tokens / context) * 100 : 0;
  return { percent, remaining: context - tokens, over: tokens > context };
};
