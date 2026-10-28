import { describe, expect, it } from "vitest";
import { LosslessNumber } from "@/utils/json-repair";
import { diffJson, formatChanges, formatPatch, formatPath, parseSide, previewValue, type PatchOperation } from "@/utils/json-diff";

const parse = (text: string) => {
  const side = parseSide(text);
  if (!side.ok) throw new Error(side.error);
  return side.value;
};

/** A small RFC 6902 applier for add, remove, and replace, to check that each patch rebuilds the right side. */
const applyPatch = (doc: unknown, patch: PatchOperation[]): unknown => {
  let root = structuredClone(doc);
  for (const { op, path, value } of patch) {
    if (path === "") {
      root = structuredClone(value);
      continue;
    }
    const parts = path.slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
    const last = parts.pop()!;
    let parent = root as Record<string, unknown> | unknown[];
    for (const part of parts) parent = (parent as Record<string, unknown>)[part] as Record<string, unknown>;
    if (Array.isArray(parent)) {
      const index = last === "-" ? parent.length : Number(last);
      if (op === "add") parent.splice(index, 0, structuredClone(value));
      else if (op === "remove") parent.splice(index, 1);
      else parent[index] = structuredClone(value);
    } else if (op === "remove") {
      delete parent[last];
    } else {
      parent[last] = structuredClone(value);
    }
  }
  return root;
};

describe("parseSide", () => {
  it("reads JSON, JSON5, and Python literals", () => {
    expect(parseSide('{"a": 1}')).toMatchObject({ ok: true, format: "json", value: { a: 1 } });
    expect(parseSide("{a: 1, b: 'x',}")).toMatchObject({ ok: true, value: { a: 1, b: "x" } });
    const python = parseSide("{'ok': True, 'v': None}");
    expect(python).toMatchObject({ ok: true, value: { ok: true, v: null } });
    expect(python.ok && python.notice).toMatch(/Python/);
  });

  it("reads YAML when the text is not JSON", () => {
    expect(parseSide("name: app\nports:\n  - 80\n  - 443\n")).toMatchObject({ ok: true, format: "yaml", value: { name: "app", ports: [80, 443] } });
  });

  it("keeps large YAML integers exact", () => {
    const side = parseSide("id: 12345678901234567890\n");
    expect(side.ok && (side.value as { id: LosslessNumber }).id).toEqual(new LosslessNumber("12345678901234567890"));
  });

  it("reports JSON errors with a line and column", () => {
    const side = parseSide('{\n  "a": 1\n  "b": }');
    expect(side.ok).toBe(false);
    if (!side.ok) {
      expect(side.line).toBe(3);
      expect(side.error).toMatch(/^Line 3, column \d+:/);
    }
  });

  it("reports YAML errors with a line and column", () => {
    const side = parseSide("a: 1\n b: 2\n");
    expect(side.ok).toBe(false);
    if (!side.ok) expect(side.error).toMatch(/^Line \d+, column \d+: Invalid YAML/);
  });

  it("does not read a single broken word as a YAML string", () => {
    expect(parseSide("tru").ok).toBe(false);
  });
});

describe("formatPath", () => {
  it("writes JSONPath with dots, brackets, and filters", () => {
    expect(formatPath([])).toBe("$");
    expect(formatPath(["users", 2, "email"])).toBe("$.users[2].email");
    expect(formatPath(["a b", "x-y"])).toBe('$["a b"]["x-y"]');
    expect(formatPath(["users", { key: "id", value: 3 }, "name"])).toBe("$.users[?(@.id==3)].name");
    expect(formatPath([{ key: "id", value: "a" }])).toBe('$[?(@.id=="a")]');
  });
});

describe("diffJson", () => {
  it("reports no changes for equal values with a different key order", () => {
    const result = diffJson(parse('{"a":1,"b":{"c":[1,2]}}'), parse('{"b":{"c":[1,2]},"a":1}'));
    expect(result.changes).toEqual([]);
    expect(result.patch).toEqual([]);
  });

  it("finds added, removed, changed, and type changes by path", () => {
    const left = { name: "app", port: 80, tags: ["a"], old: true, users: [{ email: "a@x" }] };
    const right = { name: "app", port: "80", tags: ["a", "b"], users: [{ email: "b@x" }], extra: null };
    const { changes, counts } = diffJson(left, right);
    expect(changes).toEqual([
      { kind: "type", path: "$.port", oldValue: 80, newValue: "80" },
      { kind: "added", path: "$.tags[1]", newValue: "b" },
      { kind: "removed", path: "$.old", oldValue: true },
      { kind: "changed", path: "$.users[0].email", oldValue: "a@x", newValue: "b@x" },
      { kind: "added", path: "$.extra", newValue: null },
    ]);
    expect(counts).toEqual({ added: 2, removed: 1, changed: 1, type: 1 });
  });

  it("treats an object and an array as a type change", () => {
    expect(diffJson({ a: {} }, { a: [] }).changes).toEqual([{ kind: "type", path: "$.a", oldValue: {}, newValue: [] }]);
  });

  it("compares large numbers exactly", () => {
    const left = parse('{"id": 12345678901234567890}');
    const same = parse('{"id": 12345678901234567890}');
    const next = parse('{"id": 12345678901234567891}');
    expect(diffJson(left, same).changes).toEqual([]);
    expect(diffJson(left, next).changes).toHaveLength(1);
    expect(formatPatch(diffJson(left, next).patch)).toContain('"value": 12345678901234567891');
  });

  it("does not treat 1 and \"1\" or 0 and false as equal", () => {
    expect(diffJson([1, 0], ["1", false]).counts.type).toBe(2);
  });

  it("compares arrays by index and removes from the end", () => {
    const left = [1, 2, 3, 4];
    const right = [1, 5];
    const result = diffJson(left, right);
    expect(result.changes.map((c) => `${c.kind} ${c.path}`)).toEqual(["changed $[1]", "removed $[3]", "removed $[2]"]);
    expect(applyPatch(left, result.patch)).toEqual(right);
  });

  it("matches array items by a key field", () => {
    const left = { users: [{ id: 1, name: "Ann" }, { id: 2, name: "Bob" }, { id: 3, name: "Cy" }] };
    const right = { users: [{ id: 3, name: "Cy" }, { id: 1, name: "Anne" }, { id: 4, name: "Dee" }] };
    const result = diffJson(left, right, { arrayMode: "key", matchKey: "id" });
    expect(result.changes.map((c) => `${c.kind} ${c.path}`)).toEqual([
      "changed $.users[?(@.id==1)].name",
      "removed $.users[?(@.id==2)]",
      "added $.users[?(@.id==4)]",
    ]);
    const patched = applyPatch(left, result.patch) as typeof right;
    expect(diffJson(patched, right, { arrayMode: "key", matchKey: "id" }).changes).toEqual([]);
  });

  it("falls back to index mode when an item has no key or keys repeat", () => {
    const options = { arrayMode: "key" as const, matchKey: "id" };
    const missing = diffJson([{ id: 1 }, { name: "x" }], [{ name: "x" }, { id: 1 }], options);
    expect(missing.changes[0].path).toBe("$[0].id");
    expect(missing.keyFallbacks).toBe(1);
    expect(diffJson([[1], [2]], [[2], [1]], options).keyFallbacks).toBe(0);
    expect(diffJson([{ id: 1, v: 1 }, { id: 1, v: 2 }], [{ id: 1, v: 2 }, { id: 1, v: 1 }], options).changes[0].path).toBe("$[0].v");
  });

  it("ignores the order of primitive arrays when asked, and keeps duplicates", () => {
    const left = { tags: ["a", "b", "b", "c"] };
    const right = { tags: ["c", "b", "a", "d"] };
    expect(diffJson(left, right).changes.length).toBeGreaterThan(2);
    const result = diffJson(left, right, { ignoreOrder: true });
    expect(result.changes).toEqual([
      { kind: "removed", path: "$.tags[2]", oldValue: "b" },
      { kind: "added", path: "$.tags[3]", newValue: "d" },
    ]);
    const patched = applyPatch(left, result.patch) as typeof right;
    expect(diffJson(patched, right, { ignoreOrder: true }).changes).toEqual([]);
  });

  it("ignores whitespace-only string differences when asked", () => {
    expect(diffJson({ s: "a  b " }, { s: "a b" }).changes).toHaveLength(1);
    expect(diffJson({ s: "a  b " }, { s: "a b" }, { ignoreWhitespace: true }).changes).toEqual([]);
  });

  it("escapes JSON Pointer characters and handles a root change", () => {
    const result = diffJson({ "a/b": 1, "m~n": 1 }, { "a/b": 2, "m~n": 2 });
    expect(result.patch.map((op) => op.path)).toEqual(["/a~1b", "/m~0n"]);
    expect(diffJson(1, "x").patch).toEqual([{ op: "replace", path: "", value: "x" }]);
  });

  it("builds a patch that turns the left side into the right side", () => {
    const left = { a: [1, 2, { b: 1 }], c: { d: 1, e: [] }, z: "keep" };
    const right = { a: [1, { b: 2 }], c: { e: [1, 2], f: true }, z: "keep", n: { deep: [null] } };
    expect(applyPatch(left, diffJson(left, right).patch)).toEqual(right);
  });

  it("keeps a key named __proto__ as data", () => {
    const left = parse('{"__proto__": {"x": 1}}');
    const right = parse('{"__proto__": {"x": 2}}');
    expect(diffJson(left, right).changes).toEqual([{ kind: "changed", path: "$.__proto__.x", oldValue: 1, newValue: 2 }]);
  });

  it("diffs a document of a few MB quickly", () => {
    const make = (shift: number) => ({ items: Array.from({ length: 40000 }, (_, i) => ({ id: i, name: `item ${i}`, value: i % 1000 === 0 ? i + shift : i, tags: ["x", "y"] })) });
    const left = make(0);
    const right = make(1);
    const start = performance.now();
    const result = diffJson(left, right, { arrayMode: "key", matchKey: "id" });
    expect(result.counts.changed).toBe(40);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe("formatChanges and previewValue", () => {
  it("writes one line per change", () => {
    const { changes } = diffJson({ a: 1, b: 1, c: "x" }, { a: 2, c: 1, d: [1] });
    expect(formatChanges(changes)).toBe(["~ $.a: 1 → 2", "- $.b: 1", '! $.c: string "x" → number 1', "+ $.d: [1]"].join("\n"));
  });

  it("cuts long previews", () => {
    expect(previewValue("x".repeat(500), 20)).toHaveLength(20);
    expect(previewValue({ a: 1 })).toBe('{"a":1}');
  });
});
