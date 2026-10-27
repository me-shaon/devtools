import { describe, expect, it } from "vitest";
import {
  calculateSimilarity,
  compareTexts,
  getChangeStarts,
  getCharDiff,
  getLineDiff,
  getUnifiedDiff,
  getWordDiff,
} from "@/utils/text-compare";

describe("aligned line diff", () => {
  it("keeps later lines unchanged after an inserted line", () => {
    const diff = getLineDiff("a\nb\nc", "x\na\nb\nc");
    expect(diff.map((d) => d.type)).toEqual(["added", "unchanged", "unchanged", "unchanged"]);
    expect(diff[1]).toMatchObject({ lineNumber: 1, oldLineNumber: 0, content: "a" });
  });

  it("pairs removed and added lines as modified and keeps both line numbers", () => {
    const diff = getLineDiff("a\nb\nc", "a\nB\nc\nd");
    expect(diff.map((d) => d.type)).toEqual(["unchanged", "modified", "unchanged", "added"]);
    expect(diff[1]).toMatchObject({ lineNumber: 1, oldLineNumber: 1, content: "B", oldContent: "b" });
    expect(diff[3]).toMatchObject({ lineNumber: 3, content: "d" });
  });

  it("reports a deleted line with its original line number", () => {
    const diff = getLineDiff("a\nb\nc", "a\nc");
    expect(diff.map((d) => d.type)).toEqual(["unchanged", "removed", "unchanged"]);
    expect(diff[1]).toMatchObject({ lineNumber: 1, content: "b" });
  });

  it("counts lines that moved as unchanged", () => {
    expect(compareTexts("a\nb", "x\na\nb").unchangedLines).toBe(2);
    expect(calculateSimilarity("a\nb\nc", "x\na\nb\nc")).toBe(75);
  });

  it("finds the start of each change group", () => {
    const diff = getLineDiff("a\nb\nc\nd\ne", "a\nB\nC\nd\nE");
    expect(getChangeStarts(diff)).toEqual([1, 4]);
    expect(getChangeStarts(getLineDiff("same", "same"))).toEqual([]);
  });
});

describe("unified diff hunks", () => {
  it("uses real line ranges for an insertion", () => {
    expect(getUnifiedDiff("a\nb\nc", "x\na\nb\nc")).toEqual([
      "--- original",
      "+++ modified",
      "@@ -1,3 +1,4 @@",
      "+x",
      " a",
      " b",
      " c",
    ]);
  });

  it("splits distant changes into separate hunks", () => {
    const original = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10";
    const modified = "one\n2\n3\n4\n5\n6\n7\n8\n9\nten";
    expect(getUnifiedDiff(original, modified, 1)).toEqual([
      "--- original",
      "+++ modified",
      "@@ -1,2 +1,2 @@",
      "-1",
      "+one",
      " 2",
      "@@ -9,2 +9,2 @@",
      " 9",
      "-10",
      "+ten",
    ]);
  });
});

describe("word diff", () => {
  it("marks changed words and keeps shared words", () => {
    expect(getWordDiff("the quick fox", "the slow fox")).toEqual([
      { type: "unchanged", value: "the " },
      { type: "removed", value: "quick" },
      { type: "added", value: "slow" },
      { type: "unchanged", value: " fox" },
    ]);
  });

  it("treats punctuation as its own token", () => {
    expect(getWordDiff("foo(a, b)", "foo(a, c)")).toEqual([
      { type: "unchanged", value: "foo(a, " },
      { type: "removed", value: "b" },
      { type: "added", value: "c" },
      { type: "unchanged", value: ")" },
    ]);
  });

  it("follows the ignore case and ignore whitespace options", () => {
    expect(getWordDiff("Hello world", "hello World", { ignoreCase: true })).toEqual([
      { type: "unchanged", value: "hello World" },
    ]);
    expect(getWordDiff("a  b", "a b", { ignoreWhitespace: true })).toEqual([{ type: "unchanged", value: "a b" }]);
  });
});

describe("character diff alignment", () => {
  it("aligns characters after an insertion", () => {
    expect(getCharDiff("abc", "xabc").map((d) => d.type)).toEqual(["added", "unchanged", "unchanged", "unchanged"]);
  });
});
