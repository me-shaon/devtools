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

  it("detects root-level primitive changes", () => {
    const result = diffJsonValues("1.0.0", "1.1.0", { includeUnchanged: false });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      path: "$",
      type: "changed",
      original: "1.0.0",
      modified: "1.1.0",
    });
  });

  it("adds and removes array elements", () => {
    const result = diffJsonValues(
      { items: ["a"] },
      { items: ["a", "b", "c"] },
      { includeUnchanged: false },
    );

    expect(result.entries.some((entry) => entry.path === "$.items[1]" && entry.type === "added")).toBe(true);
    expect(result.entries.some((entry) => entry.path === "$.items[2]" && entry.type === "added")).toBe(true);
  });

  it("uses bracket path format for non-identifier keys", () => {
    const result = diffJsonValues(
      { "display-name": "Alice" },
      { "display-name": "Bob" },
      { includeUnchanged: false },
    );

    expect(result.entries.some((entry) => entry.path === '$["display-name"]' && entry.type === "changed")).toBe(true);
  });

  it("includes unchanged entries when enabled", () => {
    const result = diffJsonValues(
      { a: 1, b: 2 },
      { a: 1, b: 3 },
      { includeUnchanged: true },
    );

    expect(result.entries.some((entry) => entry.path === "$.a" && entry.type === "unchanged")).toBe(true);
    expect(result.entries.some((entry) => entry.path === "$.b" && entry.type === "changed")).toBe(true);
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

  it("returns no entries for identical values when unchanged is disabled", () => {
    const result = diffJsonValues({ a: 1 }, { a: 1 }, { includeUnchanged: false });

    expect(result.entries).toHaveLength(0);
    expect(result.truncated).toBe(false);
  });

  it("treats NaN values as unchanged", () => {
    const result = diffJsonValues({ value: Number.NaN }, { value: Number.NaN }, { includeUnchanged: true });

    expect(result.entries.some((entry) => entry.path === "$.value" && entry.type === "unchanged")).toBe(true);
  });

  it("handles type changes between object and primitive", () => {
    const result = diffJsonValues(
      { data: { nested: true } },
      { data: "replaced" },
      { includeUnchanged: false },
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      path: "$.data",
      type: "changed",
    });
  });

  it("truncates result when max entries is reached", () => {
    const original = { a: 1, b: 2, c: 3 };
    const modified = { a: 2, b: 3, c: 4 };
    const result = diffJsonValues(original, modified, { maxEntries: 2, includeUnchanged: false });

    expect(result.truncated).toBe(true);
    expect(result.entries).toHaveLength(2);
  });

  it("does not truncate when entry count stays within limit", () => {
    const result = diffJsonValues(
      { a: 1, b: 2 },
      { a: 2, b: 3 },
      { maxEntries: 3, includeUnchanged: false },
    );

    expect(result.truncated).toBe(false);
    expect(result.entries).toHaveLength(2);
  });

  it("formats diff values for display", () => {
    expect(formatDiffValue("hello")).toBe("hello");
    expect(formatDiffValue(undefined)).toBe("undefined");
    expect(formatDiffValue({ a: 1 })).toContain('"a": 1');
    expect(formatDiffValue([1, 2])).toContain("[\n");
  });
});
