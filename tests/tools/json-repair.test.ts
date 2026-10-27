import { describe, expect, it } from "vitest";
import { errorExcerpt, LosslessNumber, readJson, type JsonReadResult } from "@/utils/json-repair";
import { describeJsonValue, jsonValueToXml, jsonValueToYaml, renderJsonView, runJsonQuery, sortJsonValue, stringifyJson } from "@/utils/json";

const ok = (input: string) => {
  const result = readJson(input);
  if (!result.ok) throw new Error(`Expected success, got: ${result.error.message} (${result.error.line}:${result.error.column})`);
  return result;
};
const fail = (input: string) => {
  const result: JsonReadResult = readJson(input);
  if (result.ok) throw new Error(`Expected an error, got: ${stringifyJson(result.value)}`);
  return result.error;
};
const json = (input: string) => stringifyJson(ok(input).value);

describe("readJson: valid JSON", () => {
  it("reads valid JSON with no notice", () => {
    const result = ok('{"a": [1, true, null, "x"]}');
    expect(result.value).toEqual({ a: [1, true, null, "x"] });
    expect(result.notice).toBeUndefined();
    expect(result.largeNumbers).toBe(0);
  });

  it("keeps integers above 2^53 exact and counts them", () => {
    const result = ok('{"id": 12345678901234567890, "neg": -9007199254740993, "safe": 9007199254740991}');
    expect(result.largeNumbers).toBe(2);
    expect((result.value as { id: unknown }).id).toBeInstanceOf(LosslessNumber);
    expect(stringifyJson(result.value)).toBe('{"id":12345678901234567890,"neg":-9007199254740993,"safe":9007199254740991}');
    expect(result.notice).toBeUndefined();
  });

  it("keeps numbers that overflow a double exact", () => {
    expect(json("[1e999]")).toBe("[1e999]");
  });

  it("keeps a __proto__ key as data", () => {
    const value = ok('{"__proto__": {"x": 1}}').value as object;
    expect(Object.keys(value)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  });
});

describe("readJson: repairs", () => {
  it("converts a Python literal", () => {
    const result = ok("{'name': 'Ada', 'admin': True, 'tags': ('a', 'b',), 'manager': None, 'n': 1,}");
    expect(result.value).toEqual({ name: "Ada", admin: true, tags: ["a", "b"], manager: null, n: 1 });
    expect(result.notice).toBe("Repaired: converted from a Python literal; removed 2 trailing commas.");
  });

  it("reads Python integer keys, u'' strings, escapes, and one-item tuples", () => {
    expect(ok("{1: u'caf\\xe9', 2: (3,)}").value).toEqual({ 1: "café", 2: [3] });
  });

  it("converts a Ruby hash", () => {
    const result = ok('{"id"=>1, :role=>:admin, name: "Ada", "team" => nil}');
    expect(result.value).toEqual({ id: 1, role: "admin", name: "Ada", team: null });
    expect(result.notice).toBe("Repaired: converted from a Ruby literal.");
  });

  it("removes irb output arrows", () => {
    expect(ok('=> {"a"=>1}').value).toEqual({ a: 1 });
  });

  it("converts a JavaScript object literal", () => {
    const result = ok("const user = {\n  name: 'Ada', // the name\n  skip: undefined,\n  list: [1, undefined, 0x1F,],\n};");
    expect(result.value).toEqual({ name: "Ada", list: [1, null, 31] });
    expect(result.notice).toBe(
      "Repaired: converted from a JavaScript literal; removed 1 comment; removed 2 trailing commas; dropped 1 undefined property; changed 1 undefined array item to null; rewrote 1 number in JSON form; removed the code around the value.",
    );
  });

  it("lists repairs one by one when the source language is unclear", () => {
    const result = ok("{a: 'x'}");
    expect(result.notice).toBe("Repaired: quoted 1 key; converted 1 single-quoted string.");
  });

  it("removes comments of each style", () => {
    expect(ok('{\n  /* block */ "a": 1, # hash\n  "b": 2 // line\n}').value).toEqual({ a: 1, b: 2 });
  });

  it("adds a missing comma between values on separate lines", () => {
    const result = ok('{\n  "a": 1\n  "b": [\n    {"c": 2}\n    {"d": 3}\n  ]\n}');
    expect(result.value).toEqual({ a: 1, b: [{ c: 2 }, { d: 3 }] });
    expect(result.notice).toBe("Repaired: added 2 missing commas.");
  });

  it("escapes raw tabs in strings", () => {
    expect(ok('{"a": "x\ty"}').value).toEqual({ a: "x\ty" });
  });

  it("normalizes number forms", () => {
    expect(ok("[+1, .5, 5., 1_000, 0b11, 0o17, 10n]").value).toEqual([1, 0.5, 5, 1000, 3, 15, 10]);
  });

  it("reads NDJSON as an array", () => {
    const result = ok('{"a":1}\n{"a":2}\n\n{"a":3}\n');
    expect(result.value).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(result.notice).toBe("Read 3 NDJSON lines as an array.");
  });

  it("reports repairs inside NDJSON lines", () => {
    expect(ok("{'a': 1}\n{'a': 2}").notice).toBe("Read 2 NDJSON lines as an array. Repaired: converted 2 single-quoted strings.");
  });
});

describe("readJson: errors", () => {
  it("reports the line and column of the first error", () => {
    const error = fail('{\n  "a": 1,\n  "b": ]\n}');
    expect(error).toMatchObject({ line: 3, column: 8 });
    expect(error.message).toBe("Expected a value.");
  });

  it("reports input that ends early", () => {
    expect(fail('{"broken":').message).toBe("Expected a value, but the input ended.");
  });

  it("refuses unquoted values instead of guessing", () => {
    const error = fail("{a: hello}");
    expect(error.message).toBe('Unquoted text "hello". Put it in quotes if it is a string.');
    expect(error).toMatchObject({ line: 1, column: 5 });
  });

  it("refuses values that have no JSON form", () => {
    expect(fail("[NaN]").message).toBe('"NaN" has no JSON form.');
    expect(fail("[-Infinity]").message).toBe('"Infinity" has no JSON form.');
    expect(fail("undefined").message).toBe('"undefined" has no JSON form.');
    expect(fail("{'a': Decimal('1.5')}").message).toBe('Unquoted text "Decimal". Put it in quotes if it is a string.');
  });

  it("refuses Ruby objects instead of reading them as comments", () => {
    expect(fail("[#<User id: 1>]").message).toBe("Ruby objects (#<...>) have no JSON form.");
  });

  it("refuses ambiguous numbers and escapes", () => {
    expect(fail("[007]").message).toMatch(/Leading zeros/);
    expect(fail('["a\\q"]').message).toBe('Unknown escape "\\q".');
  });

  it("refuses values on one line without a comma", () => {
    expect(fail("[1 2]").message).toBe('Expected "," or "]".');
    expect(fail('{"a": 1 "b": 2}').message).toBe('Expected "," or "}".');
  });

  it("refuses adjacent strings, which Python would join", () => {
    expect(fail('[\n  "a"\n  "b"\n]').message).toMatch(/Add a comma/);
  });

  it("refuses a value in parentheses without a comma", () => {
    expect(fail("(1)").message).toMatch(/not a tuple/);
  });

  it("refuses array holes", () => {
    expect(fail("[1,,2]").message).toBe("Expected a value.");
  });

  it("reports an unclosed string at its start", () => {
    expect(fail('{"a": "open\n}')).toMatchObject({ line: 1, column: 7, message: "Unclosed string." });
  });

  it("reports text after the value", () => {
    expect(fail('{"a": 1} }').message).toBe("Unexpected text after the value.");
  });
});

describe("errorExcerpt", () => {
  it("returns the error line and the caret index", () => {
    expect(errorExcerpt('{\n  "b": ]\n}', 9)).toEqual({ text: '  "b": ]', caret: 7 });
  });

  it("cuts a long line around the error", () => {
    const { text, caret } = errorExcerpt(`${"x".repeat(100)}!`, 100);
    expect(text.startsWith("…")).toBe(true);
    expect(text[caret]).toBe("!");
  });
});

describe("renderJsonView", () => {
  const value = { b: [1], a: "x" };
  it("renders each output mode", () => {
    expect(renderJsonView(value, "format", "\t")).toEqual({ ok: true, text: '{\n\t"b": [\n\t\t1\n\t],\n\t"a": "x"\n}', kind: "json" });
    expect(renderJsonView(value, "minify", 2)).toMatchObject({ text: '{"b":[1],"a":"x"}' });
    expect(renderJsonView(value, "sort", 2)).toMatchObject({ text: '{\n  "a": "x",\n  "b": [\n    1\n  ]\n}' });
    expect(renderJsonView(value, "yaml", 2)).toMatchObject({ kind: "yaml" });
    expect(renderJsonView(value, "xml", 2)).toMatchObject({ kind: "xml" });
  });

  it("runs queries and explains empty results", () => {
    expect(renderJsonView(value, "query", 2, "b[0]")).toMatchObject({ ok: true, text: "1" });
    expect(renderJsonView(value, "query", 2, "")).toEqual({ ok: false, message: "Enter a query." });
    expect(renderJsonView(value, "query", 2, "zzz")).toEqual({ ok: false, message: "No match for this query." });
  });
});

describe("JSON output helpers with large numbers", () => {
  it("writes tab indentation", () => {
    expect(stringifyJson({ a: [1] }, "\t")).toBe('{\n\t"a": [\n\t\t1\n\t]\n}');
    expect(stringifyJson(ok('{"a": [12345678901234567890], "b": {}}').value, "\t")).toBe('{\n\t"a": [\n\t\t12345678901234567890\n\t],\n\t"b": {}\n}');
  });

  it("keeps large numbers exact in YAML, XML, sorting, and queries", () => {
    const value = ok('{"b": 12345678901234567890, "a": [1]}').value;
    expect(jsonValueToYaml(value)).toBe("b: 12345678901234567890\na:\n  - 1");
    expect(jsonValueToXml(value)).toContain("<b>12345678901234567890</b>");
    expect(stringifyJson(sortJsonValue(value))).toBe('{"a":[1],"b":12345678901234567890}');
    const query = runJsonQuery(value, "$.*");
    expect(query.ok && stringifyJson(query.value)).toBe("[12345678901234567890,[1]]");
  });

  it("describes a value for the status bar", () => {
    expect(describeJsonValue(ok('{"a": {"b": [1, 2]}, "c": 12345678901234567890}').value)).toEqual({ type: "object", keys: 3, depth: 3 });
    expect(describeJsonValue(5)).toEqual({ type: "number", keys: 0, depth: 0 });
  });

  it("reads a large valid file with long IDs quickly", () => {
    const rows = Array.from({ length: 20000 }, (_, i) => `{"id": 1234567890123456${String(i).padStart(5, "0")}, "name": "row ${i}"}`);
    const started = performance.now();
    const result = ok(`[${rows.join(",")}]`);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(result.largeNumbers).toBe(20000);
  });
});
