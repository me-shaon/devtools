import { describe, expect, it } from "vitest";
import { encode } from "gpt-tokenizer/encoding/o200k_base";
import {
  ESTIMATE_FAMILIES,
  costFor,
  countO200k,
  decodePieces,
  estimateTokens,
  exportPriceTable,
  formatUsd,
  getTextStats,
  importPriceTable,
  ruleOfThumbTokens,
  splitForCounting,
  tokensForBasis,
  visibleWhitespace,
  type PriceRow,
} from "@/utils/token-counter";

const opts = { disallowedSpecial: new Set<string>() };

const SAMPLE = [
  "The quick brown fox jumps over the lazy dog.",
  "function add(a, b) {\n  return a + b;\n}\n",
  "日本語のテキストと한국어 텍스트",
  "emoji 👨‍👩‍👧 and café",
  "special <|endoftext|> marker",
].join("\n");

describe("countO200k", () => {
  it.each(["hello world", "Hello, world!", "  indented\n\ttab", "日本語", "👨‍👩‍👧", SAMPLE])("matches gpt-tokenizer for %j", async (text) => {
    const result = await countO200k(text);
    expect(result.count).toBe(encode(text, opts).length);
  });

  it("gives the same total when large text is counted in chunks", async () => {
    const big = Array.from({ length: 400 }, (_, i) => `${SAMPLE} line ${i} with words, numbers 12345 and/or paths /usr/bin.`).join("\n");
    const chunks = splitForCounting(big, 512);
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.join("")).toBe(big);
    const result = await countO200k(big, { chunkSize: 512 });
    expect(result.count).toBe(encode(big, opts).length);
  });

  it("keeps a long run with no safe split point in one chunk", () => {
    const text = "x".repeat(2000);
    expect(splitForCounting(text, 100)).toEqual([text]);
  });

  it("returns token pieces that rebuild the text, capped at the limit", async () => {
    const text = "Tokens split text into pieces. 日本語 👍";
    const full = await countO200k(text, { pieceLimit: 1000 });
    expect(full.truncated).toBe(false);
    expect(full.pieces.map((p) => p.text).join("")).toBe(text);
    expect(full.pieces.reduce((sum, p) => sum + p.tokens, 0)).toBe(full.count);

    const capped = await countO200k("word ".repeat(100), { pieceLimit: 10 });
    expect(capped.truncated).toBe(true);
    expect(capped.pieces.reduce((sum, p) => sum + p.tokens, 0)).toBeLessThanOrEqual(10);
  });

  it("stops when the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(countO200k("hello", { signal: controller.signal })).rejects.toThrow("Counting stopped");
  });

  it("joins partial-character tokens into one piece", () => {
    const fake = { decode: (ids: number[]) => (ids.length === 1 && ids[0] === 1 ? "�" : ids.join("+")) };
    expect(decodePieces(fake, [1, 2, 3])).toEqual([{ text: "1+2", tokens: 2 }, { text: "3", tokens: 1 }]);
  });
});

describe("getTextStats", () => {
  it("counts characters, words, lines and bytes", () => {
    expect(getTextStats("")).toMatchObject({ characters: 0, words: 0, lines: 0, bytes: 0 });
    expect(getTextStats("one two\r\nthree\nfour")).toMatchObject({ characters: 19, words: 4, lines: 3, bytes: 19 });
    const s = getTextStats("é日👍");
    expect(s).toMatchObject({ characters: 3, bytes: 2 + 3 + 4, cjk: 1, otherNonAscii: 2 });
    expect(s.bytes).toBe(new TextEncoder().encode("é日👍").length);
  });
});

describe("estimates", () => {
  const stats = getTextStats("x".repeat(400));

  it("stays within the documented range for each family", () => {
    for (const family of ESTIMATE_FAMILIES) {
      const estimate = estimateTokens(family, 1000, stats);
      expect(estimate.low).toBeLessThanOrEqual(estimate.value);
      expect(estimate.high).toBeGreaterThanOrEqual(estimate.value);
      if (family.id !== "rule") {
        expect(estimate.value).toBe(Math.round(1000 * family.factor));
        expect(estimate.low).toBe(Math.floor(1000 * family.low));
        expect(estimate.high).toBe(Math.ceil(1000 * family.high));
      }
    }
  });

  it("uses characters ÷ 4 for ASCII and 1 token for each CJK character", () => {
    expect(ruleOfThumbTokens(getTextStats(""))).toBe(0);
    expect(ruleOfThumbTokens(getTextStats("abcdefgh"))).toBe(2);
    expect(ruleOfThumbTokens(getTextStats("日本語"))).toBe(3);
    expect(ruleOfThumbTokens(getTextStats("éé"))).toBe(1);
  });

  it("keeps the rule of thumb near the exact count for English prose", () => {
    const prose = "Token counts help you plan prompts and budgets for language models. ".repeat(20);
    const exact = encode(prose, opts).length;
    const estimate = ruleOfThumbTokens(getTextStats(prose));
    expect(estimate / exact).toBeGreaterThan(0.75);
    expect(estimate / exact).toBeLessThan(1.5);
  });

  it("picks the right count for a cost row", () => {
    expect(tokensForBasis("openai", 100, stats)).toBe(100);
    expect(tokensForBasis("claude", 100, stats)).toBe(120);
    expect(tokensForBasis("rule", 100, stats)).toBe(100);
  });
});

describe("cost", () => {
  it("multiplies tokens by the price per million", () => {
    const cost = costFor({ input: 2.5, output: 10 }, 1_000, 500);
    expect(cost.input).toBeCloseTo(0.0025);
    expect(cost.output).toBeCloseTo(0.005);
    expect(cost.total).toBeCloseTo(0.0075);
  });

  it.each([
    [0, "$0.00"],
    [0.000123, "$0.00012"],
    [0.0123, "$0.012"],
    [0.0999, "$0.10"],
    [0.5, "$0.50"],
    [0.996, "$1.00"],
    [1.234, "$1.23"],
    [12345.678, "$12,345.68"],
    [0.0000001, "< $0.000001"],
  ])("formats %d as %s", (value, text) => {
    expect(formatUsd(value)).toBe(text);
  });
});

describe("price table JSON", () => {
  const rows: PriceRow[] = [{ id: "a", name: "Model A", input: 1.25, output: 5, basis: "claude" }];

  it("round-trips through export and import", () => {
    const result = importPriceTable(exportPriceTable(rows));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows.map(({ name, input, output, basis }) => ({ name, input, output, basis }))).toEqual([
      { name: "Model A", input: 1.25, output: 5, basis: "claude" },
    ]);
  });

  it("accepts a bare array and defaults the basis", () => {
    const result = importPriceTable('[{"name":"m","input":0,"output":1}]');
    expect(result.ok && result.rows[0].basis).toBe("openai");
  });

  it.each([
    ["not json", "not valid JSON"],
    ['{"rows":[]}', "models"],
    ['{"models":[42]}', "Model 1 is not an object"],
    ['{"models":[{"name":"","input":1,"output":1}]}', "needs a name"],
    ['{"models":[{"name":"m","input":-1,"output":1}]}', "input price"],
    ['{"models":[{"name":"m","input":"1","output":1}]}', "input price"],
    ['{"models":[{"name":"m","input":1,"output":null}]}', "output price"],
    ['{"models":[{"name":"m","input":1,"output":1,"basis":"gpt9"}]}', "unknown basis"],
    [JSON.stringify({ models: [{ name: "x".repeat(101), input: 1, output: 1 }] }), "longer than"],
    [JSON.stringify({ models: Array.from({ length: 201 }, () => ({ name: "m", input: 1, output: 1 })) }), "up to 200"],
  ])("rejects %s", (json, message) => {
    const result = importPriceTable(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });
});

describe("visibleWhitespace", () => {
  it("marks spaces, tabs and line breaks", () => {
    expect(visibleWhitespace("a b\tc\r\nd")).toBe("a·b→c↵\nd");
  });
});
