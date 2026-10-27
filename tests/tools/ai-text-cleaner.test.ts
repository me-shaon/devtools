import { describe, expect, it } from "vitest";
import { cleanText, type CleanOptions } from "@/utils/ai-text-cleaner";

const NONE: CleanOptions = {
  invisible: false,
  spaces: false,
  quotes: false,
  dashes: false,
  emDashStyle: "spaced",
  ellipsis: false,
  markdown: false,
  markdownLists: false,
  whitespace: false,
  citations: false,
};

const only = (option: Partial<CleanOptions>) => ({ ...NONE, ...option });

describe("cleanText", () => {
  it("removes invisible characters", () => {
    const text = "a\u200bb\u200c\u200dc\u2060d\ufeffe\u00adf\u202eg\u2066h\u2069i\ufe0fj\u{e0041}k";
    const result = cleanText(text, only({ invisible: true }));
    expect(result.output).toBe("abcdefghijk");
    expect(result.changes).toEqual([{ kind: "invisible", count: 11, label: "11 invisible characters removed" }]);
  });

  it("keeps emoji ZWJ sequences, presentation selectors, keycaps, and tag flags", () => {
    const emoji = [
      "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}\u200d\u{1f466}", // family
      "\u{1f3f3}\ufe0f\u200d\u{1f308}", // rainbow flag
      "\u{1f469}\u{1f3fd}\u200d\u{1f4bb}", // technologist with skin tone
      "\u2764\ufe0f", // red heart
      "1\ufe0f\u20e3", // keycap
      "\u{1f3f4}\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}", // England flag
    ].join(" ");
    const result = cleanText(emoji, only({ invisible: true }));
    expect(result.output).toBe(emoji);
    expect(result.total).toBe(0);
  });

  it("removes a ZWJ that is not between emoji but keeps it inside Indic and Persian words", () => {
    expect(cleanText("a\u200d\u{1f600}", only({ invisible: true })).output).toBe("a\u{1f600}");
    expect(cleanText("\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645", only({ invisible: true })).output).toBe("\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645");
  });

  it("normalizes unusual spaces", () => {
    const result = cleanText("a\u00a0b\u202fc\u2009d\u200ae\u2007f\u3000g\u2002h\u2003i", only({ spaces: true }));
    expect(result.output).toBe("a b c d e f g h i");
    expect(result.changes[0].label).toBe("8 unusual spaces normalized");
  });

  it("straightens curly quotes", () => {
    const result = cleanText("\u201cIt\u2019s \u2018fine\u2019\u201d", only({ quotes: true }));
    expect(result.output).toBe("\"It's 'fine'\"");
    expect(result.changes[0].label).toBe("5 quotes straightened");
  });

  it("replaces dashes in both em dash styles", () => {
    expect(cleanText("one\u2014two \u2014 three, 1\u20132", only({ dashes: true })).output).toBe("one - two - three, 1-2");
    expect(cleanText("one\u2014two", only({ dashes: true, emDashStyle: "double" })).output).toBe("one--two");
    expect(cleanText("\u2014 Hello", only({ dashes: true })).output).toBe("- Hello");
  });

  it("expands ellipses", () => {
    expect(cleanText("Wait\u2026", only({ ellipsis: true })).output).toBe("Wait...");
  });

  it("removes Markdown formatting but leaves code blocks alone", () => {
    const text = [
      "## Heading ##",
      "Some **bold**, *italic*, __strong__, _em_ and ~~gone~~ text.",
      "A [link](https://example.com) and `code` and ![alt](img.png).",
      "> quoted",
      "- item one",
      "1. item two",
      "snake_case_name and 2 * 3 * 4",
      "```js",
      "const a = **b**;",
      "```",
    ].join("\n");
    const expected = [
      "Heading",
      "Some bold, italic, strong, em and gone text.",
      "A link and code and alt.",
      "quoted",
      "- item one",
      "1. item two",
      "snake_case_name and 2 * 3 * 4",
      "```js",
      "const a = **b**;",
      "```",
    ].join("\n");
    expect(cleanText(text, only({ markdown: true })).output).toBe(expected);
    const withLists = cleanText("- item one\n1. item two\n* [x] done", only({ markdown: true, markdownLists: true }));
    expect(withLists.output).toBe("item one\nitem two\ndone");
  });

  it("trims trailing whitespace and collapses blank lines", () => {
    const result = cleanText("a  \nb\t\n\n\n\n\nc\r\nd \r\n", only({ whitespace: true }));
    expect(result.output).toBe("a\nb\n\n\nc\r\nd\r\n");
    expect(result.changes[0].label).toBe("5 lines trimmed or collapsed");
  });

  it("removes citation markers", () => {
    const text = [
      "Paris is the capital [1].",
      "Perplexity style[1][2], works.",
      "Range [1, 2] and [3\u20135] here.",
      "ChatGPT \u30104:0\u2020source\u3011 file.",
      "Ref :contentReference[oaicite:0]{index=0} end",
    ].join("\n");
    const result = cleanText(text, only({ citations: true }));
    expect(result.output).toBe(["Paris is the capital.", "Perplexity style, works.", "Range and here.", "ChatGPT file.", "Ref end"].join("\n"));
    expect(result.changes[0].kind).toBe("citations");
  });

  it("leaves array indexes and Markdown links alone when removing citations", () => {
    const code = "x = arr[1];\nitems[0].name\n[1](https://example.com)\n`list[2]`";
    expect(cleanText(code, only({ citations: true })).output).toBe(code);
  });

  it("applies the default options", () => {
    const result = cleanText("\u201cHello\u201d\u200b world\u2026 [1]   \n");
    expect(result.output).toBe('"Hello" world...\n');
    expect(result.changes.map((c) => c.kind)).toEqual(["invisible", "citations", "quotes", "ellipsis", "whitespace"]);
  });

  it("is idempotent", () => {
    const text = [
      "## Title",
      "\u201cQuote\u201d \u2014 with **bold** and a citation [2].\u200b",
      "\u00a0Indented\u2026   ",
      "",
      "",
      "",
      "",
      "- list item `code` \u30101\u2020source\u3011",
      "family \u{1f468}\u200d\u{1f469}\u200d\u{1f467}",
    ].join("\n");
    const all: Partial<CleanOptions> = { dashes: true, markdown: true, markdownLists: true };
    const once = cleanText(text, all).output;
    expect(cleanText(once, all).output).toBe(once);
    expect(cleanText(once, all).total).toBe(0);
  });

  it("handles 1 MB of input quickly", () => {
    const chunk = "\u201cSome\u201d text\u200b with \u2014 dashes\u2026 **bold** [1]   \n" + " ".repeat(100) + "x\n";
    const text = chunk.repeat(Math.ceil(1_000_000 / chunk.length));
    const started = performance.now();
    cleanText(text, { dashes: true, markdown: true, markdownLists: true });
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
