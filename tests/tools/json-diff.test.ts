import { describe, expect, it } from "vitest";
import { diffJsonValues, formatDiffValue } from "@/utils/json-diff";

describe("JSON Diff Utils", () => {
  it("detects changed, added, and removed entries", () => {
    const original = {
      name: "DevTools",
      version: "1.0.0",
      enabled: true,
      nested: { a: 1 },
    };

    const modified = {
      name: "DevTools",
      version: "1.1.0",
      nested: { a: 2 },
      newKey: "new",
    };

    const result = diffJsonValues(original, modified, { includeUnchanged: true });

    expect(result.entries.some((entry) => entry.path === "$.version" && entry.type === "changed")).toBe(true);
    expect(result.entries.some((entry) => entry.path === "$.enabled" && entry.type === "removed")).toBe(true);
    expect(result.entries.some((entry) => entry.path === "$.newKey" && entry.type === "added")).toBe(true);
    expect(result.entries.some((entry) => entry.path === "$.nested.a" && entry.type === "changed")).toBe(true);
  });

  it("supports array paths", () => {
    const result = diffJsonValues(
      { items: [1, 2, 3] },
      { items: [1, 4] },
      { includeUnchanged: true },
    );

    expect(result.entries.some((entry) => entry.path === "$.items[1]" && entry.type === "changed")).toBe(true);
    expect(result.entries.some((entry) => entry.path === "$.items[2]" && entry.type === "removed")).toBe(true);
  });

  it("filters unchanged when requested", () => {
    const result = diffJsonValues(
      { a: 1, b: 2 },
      { a: 1, b: 3 },
      { includeUnchanged: false },
    );

    expect(result.entries.some((entry) => entry.type === "unchanged")).toBe(false);
    expect(result.entries.some((entry) => entry.path === "$.b" && entry.type === "changed")).toBe(true);
  });

  it("truncates result when max entries is reached", () => {
    const original = { a: 1, b: 2, c: 3 };
    const modified = { a: 2, b: 3, c: 4 };
    const result = diffJsonValues(original, modified, { maxEntries: 2, includeUnchanged: false });

    expect(result.truncated).toBe(true);
    expect(result.entries).toHaveLength(2);
  });

  it("formats diff values for display", () => {
    expect(formatDiffValue("hello")).toBe("hello");
    expect(formatDiffValue(undefined)).toBe("undefined");
    expect(formatDiffValue({ a: 1 })).toContain('"a": 1');
  });
});
