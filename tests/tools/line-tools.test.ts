import { describe, expect, it } from "vitest";
import { processLines, shuffleLines, splitLines } from "@/utils/line-tools";

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
