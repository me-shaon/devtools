import { describe, expect, it } from "vitest";
import {
  captureGroupNames,
  compileRegex,
  highlightSegments,
  normalizeFlags,
  parseRegexLiteral,
  runRegex,
  toggleFlag,
} from "@/utils/regex";

const ok = (result: ReturnType<typeof runRegex>) => {
  if (!result.ok) throw new Error(result.error);
  return result;
};

describe("flags", () => {
  it("orders flags and drops unknown or repeated ones", () => {
    expect(normalizeFlags("mgig")).toBe("gim");
    expect(normalizeFlags("xyz")).toBe("");
  });

  it("toggles a flag on and off", () => {
    expect(toggleFlag("g", "i")).toBe("gi");
    expect(toggleFlag("gi", "g")).toBe("i");
  });
});

describe("compileRegex", () => {
  it("returns a short error for an invalid pattern", () => {
    const result = compileRegex("(a", "g");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/^Invalid pattern: /);
      expect(result.error).not.toContain("/(a/");
    }
  });
});

describe("captureGroupNames", () => {
  it("lists numbered and named groups in order", () => {
    expect(captureGroupNames("(\\d+)-(?<month>\\d+)-(?<day>\\d+)")).toEqual([undefined, "month", "day"]);
  });

  it("skips escapes, classes, non-capturing groups, and lookarounds", () => {
    expect(captureGroupNames("\\((?:a)[(](?=b)(?<=c)(?<!d)(e)")).toEqual([undefined]);
  });
});

describe("runRegex", () => {
  it("finds every match with its offsets when g is on", () => {
    const result = ok(runRegex({ pattern: "a+", flags: "g", text: "caa baa" }));
    expect(result.matches.map((m) => [m.value, m.index, m.end])).toEqual([
      ["aa", 1, 3],
      ["aa", 5, 7],
    ]);
    expect(result.truncated).toBe(false);
  });

  it("finds only the first match when g is off", () => {
    const result = ok(runRegex({ pattern: "a", flags: "", text: "aaa" }));
    expect(result.matches).toHaveLength(1);
  });

  it("reports numbered and named groups, and groups that did not take part", () => {
    const result = ok(runRegex({ pattern: "(?<year>\\d{4})-(\\d{2})(x)?", flags: "g", text: "on 2024-05" }));
    expect(result.matches[0].groups).toEqual([
      { number: 1, name: "year", value: "2024" },
      { number: 2, name: undefined, value: "05" },
      { number: 3, name: undefined, value: undefined },
    ]);
  });

  it("steps past empty matches instead of looping forever", () => {
    const result = ok(runRegex({ pattern: "x*", flags: "g", text: "ab" }));
    expect(result.matches.map((m) => m.index)).toEqual([0, 1, 2]);
  });

  it("steps past a whole surrogate pair with the u flag", () => {
    const result = ok(runRegex({ pattern: "", flags: "gu", text: "😀" }));
    expect(result.matches.map((m) => m.index)).toEqual([0, 2]);
  });

  it("stops at the match limit", () => {
    const result = ok(runRegex({ pattern: "a", flags: "g", text: "aaaaa", limit: 3 }));
    expect(result.matches).toHaveLength(3);
    expect(result.truncated).toBe("limit");
  });

  it("stops when the time budget runs out", () => {
    const result = ok(runRegex({ pattern: "a", flags: "g", text: "a".repeat(50), budgetMs: -1 }));
    expect(result.matches).toHaveLength(1);
    expect(result.truncated).toBe("time");
  });

  it("replaces with $1, $<name>, and $&", () => {
    const result = ok(runRegex({ pattern: "(?<user>\\w+)@(\\w+)", flags: "g", text: "ann@x bob@y", replacement: "$<user> at $2 [$&]" }));
    expect(result.replaced).toBe("ann at x [ann@x] bob at y [bob@y]");
  });

  it("replaces only the first match when g is off", () => {
    expect(ok(runRegex({ pattern: "a", flags: "", text: "aaa", replacement: "b" })).replaced).toBe("baa");
  });

  it("returns the error for an invalid pattern", () => {
    expect(runRegex({ pattern: "[", flags: "g", text: "x" }).ok).toBe(false);
  });
});

describe("parseRegexLiteral", () => {
  it("splits a pasted literal into pattern and flags", () => {
    expect(parseRegexLiteral("/\\d+/gi")).toEqual({ pattern: "\\d+", flags: "gi" });
    expect(parseRegexLiteral("/a\\/b/")).toEqual({ pattern: "a\\/b", flags: "" });
  });

  it("drops flags without a toggle", () => {
    expect(parseRegexLiteral("/a/gy")).toEqual({ pattern: "a", flags: "g" });
  });

  it("ignores text that is not a literal", () => {
    expect(parseRegexLiteral("\\d+")).toBeNull();
    expect(parseRegexLiteral("/api/users")).toBeNull();
    expect(parseRegexLiteral("/(/")).toBeNull();
  });
});

describe("highlightSegments", () => {
  it("splits text into plain and matched segments", () => {
    const { matches } = ok(runRegex({ pattern: "b", flags: "g", text: "abcb" }));
    expect(highlightSegments("abcb", matches)).toEqual([
      { text: "a" },
      { text: "b", match: 0 },
      { text: "c" },
      { text: "b", match: 1 },
    ]);
  });

  it("keeps empty matches and clamps stale offsets to the text", () => {
    const { matches } = ok(runRegex({ pattern: "$", flags: "g", text: "abc" }));
    expect(highlightSegments("abc", matches)).toEqual([{ text: "abc" }, { text: "", match: 0 }]);
    const stale = ok(runRegex({ pattern: "c", flags: "g", text: "abc" })).matches;
    expect(highlightSegments("ab", stale)).toEqual([{ text: "ab" }, { text: "", match: 0 }]);
  });
});
