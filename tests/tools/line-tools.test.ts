import { describe, expect, it } from "vitest";
import { compareLists, processLines, shuffleLines, splitLines } from "@/utils/line-tools";

describe("splitLines", () => {
  it("splits on every line ending and records the trailing break", () => {
    expect(splitLines("a\r\nb\nc\rd\n")).toEqual({ lines: ["a", "b", "c", "d"], eol: "\r\n", trailingNewline: true });
    expect(splitLines("")).toEqual({ lines: [], eol: "\n", trailingNewline: false });
  });
});

describe("processLines", () => {
  it("returns the text unchanged with no options", () => {
    expect(processLines("b\na\n").output).toBe("b\na\n");
  });

  it("sorts A to Z and Z to A", () => {
    expect(processLines("pear\napple\nBanana", { sort: "asc" }).output).toBe("apple\nBanana\npear");
    expect(processLines("pear\napple\nBanana", { sort: "desc" }).output).toBe("pear\nBanana\napple");
  });

  it("sorts numbers naturally", () => {
    expect(processLines("file10\nfile2\nfile1", { sort: "natural" }).output).toBe("file1\nfile2\nfile10");
    expect(processLines("file10\nfile2\nfile1", { sort: "asc" }).output).toBe("file1\nfile10\nfile2");
  });

  it("sorts by length and keeps the order of equal lengths", () => {
    expect(processLines("ccc\nb\naa\nd", { sort: "length" }).output).toBe("b\nd\naa\nccc");
  });

  it("reverses lines", () => {
    expect(processLines("1\n2\n3", { reverse: true }).output).toBe("3\n2\n1");
  });

  it("dedupes and counts removed duplicates", () => {
    const result = processLines("a\nb\na\nA", { dedupe: true });
    expect(result.output).toBe("a\nb\nA");
    expect(result.duplicatesRemoved).toBe(1);
    const insensitive = processLines("a\nb\na\nA", { dedupe: true, ignoreCase: true });
    expect(insensitive.output).toBe("a\nb");
    expect(insensitive.duplicatesRemoved).toBe(2);
    expect(insensitive.inputLines).toBe(4);
    expect(insensitive.outputLines).toBe(2);
  });

  it("trims before dedupe and removes empty lines", () => {
    const result = processLines("  a \na\n\n   \nb", { trim: true, dedupe: true, removeEmpty: true });
    expect(result.output).toBe("a\nb");
    expect(result.emptyRemoved).toBe(2);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it("keeps CRLF line endings and the trailing break", () => {
    expect(processLines("b\r\na\r\n", { sort: "asc" }).output).toBe("a\r\nb\r\n");
  });

  it("normalizes lone CR to LF when there is no CRLF", () => {
    expect(processLines("b\ra", { sort: "asc" }).output).toBe("a\nb");
  });

  it("shuffles with the given random source", () => {
    const lines = ["1", "2", "3", "4"];
    // randomInt always 0 moves each item to the front in turn.
    expect(shuffleLines(lines, () => 0)).toEqual(["2", "3", "4", "1"]);
    expect(lines).toEqual(["1", "2", "3", "4"]);
    const shuffled = processLines("1\n2\n3\n4\n5", { sort: "shuffle" }).output.split("\n");
    expect(shuffled.slice().sort()).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("handles 100k lines quickly", () => {
    const text = Array.from({ length: 100_000 }, (_, i) => `item ${i % 5000}`).join("\n");
    const started = performance.now();
    const result = processLines(text, { sort: "natural", dedupe: true });
    expect(result.outputLines).toBe(5000);
    expect(result.duplicatesRemoved).toBe(95_000);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});

describe("processLines filter", () => {
  const text = "api-users\nweb-admin\napi-orders\nAPI-auth\n";

  it("keeps lines that contain the text and counts the matches", () => {
    const result = processLines(text, { filter: { pattern: "api" } });
    expect(result.output).toBe("api-users\napi-orders\n");
    expect(result.filterMatched).toBe(2);
  });

  it("removes matching lines and ignores case with the shared option", () => {
    const result = processLines(text, { filter: { pattern: "api", mode: "remove" }, ignoreCase: true });
    expect(result.output).toBe("web-admin\n");
    expect(result.filterMatched).toBe(3);
  });

  it("matches a regex", () => {
    expect(processLines(text, { filter: { pattern: "^api-(users|auth)$", regex: true }, ignoreCase: true }).output)
      .toBe("api-users\nAPI-auth\n");
  });

  it("filters after trim and before dedupe and sort", () => {
    const result = processLines(" b1 \na1\nb1\nc1", { trim: true, filter: { pattern: "1$", regex: true }, dedupe: true, sort: "asc" });
    expect(result.output).toBe("a1\nb1\nc1");
    expect(result.filterMatched).toBe(4);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it("does nothing with an empty pattern", () => {
    const result = processLines("a\nb", { filter: { pattern: "", mode: "remove" } });
    expect(result.output).toBe("a\nb");
    expect(result.filterMatched).toBeUndefined();
  });

  it("throws a readable error for an invalid regex", () => {
    expect(() => processLines("a", { filter: { pattern: "(", regex: true } })).toThrow(/Invalid regular expression/);
  });
});

describe("compareLists", () => {
  it("splits two lists into only in A, only in B, in both, and the union", () => {
    const result = compareLists("a\nb\nc\nb", "c\nd\na\n");
    expect(result.onlyA).toEqual(["b"]);
    expect(result.onlyB).toEqual(["d"]);
    expect(result.both).toEqual(["a", "c"]);
    expect(result.union).toEqual(["a", "b", "c", "d"]);
    expect(result.uniqueA).toBe(3);
    expect(result.uniqueB).toBe(3);
  });

  it("trims and ignores blank lines by default", () => {
    const result = compareLists(" a \n\n  \nb", "a\n");
    expect(result.both).toEqual(["a"]);
    expect(result.onlyA).toEqual(["b"]);
    const raw = compareLists(" a \n\nb", "a", { trim: false, ignoreBlank: false });
    expect(raw.onlyA).toEqual([" a ", "", "b"]);
  });

  it("ignores case on request and keeps the spelling from A", () => {
    expect(compareLists("Alice@x.io", "alice@X.io").both).toEqual([]);
    const result = compareLists("Alice@x.io\nbob", "alice@X.io\nBOB\ncarol", { ignoreCase: true });
    expect(result.both).toEqual(["Alice@x.io", "bob"]);
    expect(result.onlyB).toEqual(["carol"]);
  });

  it("uses CRLF when either list has CRLF", () => {
    expect(compareLists("a\r\nb", "b").eol).toBe("\r\n");
    expect(compareLists("a", "b").eol).toBe("\n");
  });

  it("compares 100k items quickly", () => {
    const a = Array.from({ length: 100_000 }, (_, i) => `id-${i}`).join("\n");
    const b = Array.from({ length: 100_000 }, (_, i) => `id-${i + 50_000}`).join("\n");
    const started = performance.now();
    const result = compareLists(a, b);
    expect(result.both.length).toBe(50_000);
    expect(result.union.length).toBe(150_000);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});
