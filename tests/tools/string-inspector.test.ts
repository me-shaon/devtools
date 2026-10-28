import { describe, expect, it } from "vitest";
import {
  findNormalizationVariants,
  formatCodePoint,
  getCharCategory,
  getNormalizedForms,
  getStringStats,
  inspectCharacters,
  splitGraphemes,
  stripFlaggedCharacters,
  utf8Hex,
} from "@/utils/string-inspector";

const FAMILY = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";

describe("getStringStats", () => {
  it("returns zeros for empty text", () => {
    const stats = getStringStats("");
    expect(stats).toMatchObject({ graphemes: 0, codeUnits: 0, bytes: 0, words: 0, lines: 0, sentences: 0, longestLine: 0, lineEnding: "none" });
  });

  it("counts a ZWJ emoji sequence as one character", () => {
    const stats = getStringStats(FAMILY);
    expect(stats.graphemes).toBe(1);
    expect(stats.codePoints).toBe(5);
    expect(stats.codeUnits).toBe(8);
    expect(stats.bytes).toBe(18);
    expect(splitGraphemes(`a${FAMILY}b`)).toEqual(["a", FAMILY, "b"]);
  });

  it("counts combining marks with their base letter", () => {
    expect(getStringStats("e\u0301").graphemes).toBe(1);
  });

  it("counts words, sentences, and whitespace", () => {
    const stats = getStringStats("Hello world. How are you?");
    expect(stats.words).toBe(5);
    expect(stats.sentences).toBe(2);
    expect(stats.whitespace).toBe(4);
  });

  it("treats CRLF as one line break and finds the longest line", () => {
    const stats = getStringStats("ab\r\nabcd\r\nc");
    expect(stats.lines).toBe(3);
    expect(stats.lineEnding).toBe("CRLF");
    expect(stats.longestLine).toBe(4);
    expect(stats.longestLineNumber).toBe(2);
    expect(stats.graphemes).toBe(9);
  });

  it("reports mixed line endings", () => {
    expect(getStringStats("a\nb\r\nc").lineEnding).toBe("mixed");
    expect(getStringStats("a\rb").lineEnding).toBe("CR");
    expect(getStringStats("a\nb\n").lines).toBe(3);
  });

  it("does not count the BOM as whitespace", () => {
    expect(getStringStats("\uFEFFa b").whitespace).toBe(1);
  });

  it("handles 100k lines quickly", () => {
    const text = Array.from({ length: 100_000 }, (_, i) => `line ${i}`).join("\n");
    const started = performance.now();
    const stats = getStringStats(text);
    expect(stats.lines).toBe(100_000);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});

describe("inspectCharacters", () => {
  it("lists distinct code points in order with counts", () => {
    const result = inspectCharacters("abca");
    expect(result.chars.map((c) => c.char)).toEqual(["a", "b", "c"]);
    expect(result.chars[0].count).toBe(2);
    expect(result.distinct).toBe(3);
    expect(result.flaggedCount).toBe(0);
  });

  it("flags zero-width, BOM, NBSP, and bidi characters with positions", () => {
    const result = inspectCharacters("\uFEFFid\u200B\nx\u00A0\u202Ey");
    const byAbbr = Object.fromEntries(result.flagged.map((c) => [c.abbr, c]));
    expect(Object.keys(byAbbr).sort()).toEqual(["BOM", "NBSP", "RLO", "ZWSP"]);
    expect(byAbbr.ZWSP.flag).toBe("invisible");
    expect(byAbbr.ZWSP).toMatchObject({ firstLine: 1, firstColumn: 4, hex: "U+200B", utf8: "E2 80 8B" });
    expect(byAbbr.RLO.flag).toBe("bidi");
    expect(byAbbr.NBSP.firstLine).toBe(2);
    expect(result.flaggedCount).toBe(4);
  });

  it("flags control characters but not tabs or line breaks", () => {
    const result = inspectCharacters("a\tb\r\nc\u0000\u001B");
    expect(result.flagged.map((c) => c.abbr)).toEqual(["NUL", "ESC"]);
    expect(result.chars.find((c) => c.char === "\t")?.display).toBe("TAB");
  });

  it("caps the list but still counts flagged characters past the cap", () => {
    const text = Array.from({ length: 600 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join("") + "\u200B";
    const result = inspectCharacters(text, 500);
    expect(result.chars).toHaveLength(500);
    expect(result.truncated).toBe(true);
    expect(result.flagged).toHaveLength(1);
  });

  it("removes flagged characters and keeps tabs and line breaks", () => {
    expect(stripFlaggedCharacters("a\u200Bb\tc\r\nd\uFEFF\u202E")).toBe("ab\tc\r\nd");
  });
});

describe("character helpers", () => {
  it("categorizes code points", () => {
    expect(getCharCategory("a")).toBe("letter");
    expect(getCharCategory("7")).toBe("digit");
    expect(getCharCategory(" ")).toBe("whitespace");
    expect(getCharCategory("\u0007")).toBe("control");
    expect(getCharCategory("\u{1F600}")).toBe("emoji");
    expect(getCharCategory("\u200B")).toBe("format");
    expect(getCharCategory("\u0301")).toBe("mark");
    expect(getCharCategory("!")).toBe("punctuation");
  });

  it("formats code points and UTF-8 bytes", () => {
    expect(formatCodePoint(0x41)).toBe("U+0041");
    expect(formatCodePoint(0x1f600)).toBe("U+1F600");
    expect(utf8Hex("\u{1F600}")).toBe("F0 9F 98 80");
    expect(utf8Hex("é")).toBe("C3 A9");
  });
});

describe("getNormalizedForms", () => {
  it("reports ASCII text as normalized in every form", () => {
    const forms = getNormalizedForms("hello");
    expect(forms.map((f) => f.form)).toEqual(["NFC", "NFD", "NFKC", "NFKD"]);
    expect(forms.every((f) => f.same && f.value === "hello" && f.bytes === 5)).toBe(true);
  });

  it("shows the lengths of composed and decomposed forms", () => {
    const [nfc, nfd, nfkc, nfkd] = getNormalizedForms("caf\u00E9");
    expect(nfc).toMatchObject({ same: true, value: "caf\u00E9", codePoints: 4, codeUnits: 4, bytes: 5 });
    expect(nfd.value).not.toBe(nfc.value);
    expect(nfd).toMatchObject({ same: false, value: "cafe\u0301", codePoints: 5, codeUnits: 5, bytes: 6 });
    expect(nfkc.same).toBe(true);
    expect(nfkd.same).toBe(false);
  });

  it("maps compatibility characters only in NFKC and NFKD", () => {
    const [nfc, , nfkc] = getNormalizedForms("\uFB01le \u2460");
    expect(nfc.same).toBe(true);
    expect(nfkc).toMatchObject({ same: false, value: "file 1" });
  });
});

describe("findNormalizationVariants", () => {
  it("finds a character written in two ways", () => {
    expect(findNormalizationVariants("caf\u00E9 cafe\u0301")).toEqual({
      variants: [{ nfc: "\u00E9", spellings: [["U+00E9"], ["U+0065", "U+0301"]] }],
      checked: 10,
      truncated: false,
    });
  });

  it("returns nothing when each character has one spelling", () => {
    expect(findNormalizationVariants("cafe\u0301 cafe\u0301").variants).toEqual([]);
    expect(findNormalizationVariants("plain ascii").variants).toEqual([]);
  });

  it("checks only the start of text past the limit", () => {
    const text = `\u00E9${"x".repeat(20)}e\u0301`;
    expect(findNormalizationVariants(text, 10)).toEqual({ variants: [], checked: 10, truncated: true });
    expect(findNormalizationVariants(text, 100)).toMatchObject({ truncated: false, checked: 23 });
    expect(findNormalizationVariants(text, 100).variants).toHaveLength(1);
  });

  it("does not cut a surrogate pair at the limit", () => {
    expect(findNormalizationVariants("ab\u{1F600}cd", 3)).toMatchObject({ checked: 2, truncated: true });
  });
});
