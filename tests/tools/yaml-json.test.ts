import { describe, expect, it } from "vitest";
import { ConversionError, jsonToYaml, yamlToJson } from "@/utils/yaml-json";

describe("yamlToJson", () => {
  it("converts a mapping with the chosen indent", () => {
    expect(yamlToJson("a: 1\nb: [x, y]\n").output).toBe('{\n  "a": 1,\n  "b": [\n    "x",\n    "y"\n  ]\n}');
    expect(yamlToJson("a: 1", 4).output).toBe('{\n    "a": 1\n}');
  });
  it("turns several documents into an array", () => {
    const result = yamlToJson("a: 1\n---\nb: 2\n");
    expect(JSON.parse(result.output)).toEqual([{ a: 1 }, { b: 2 }]);
    expect(result.documents).toBe(2);
  });
  it("keeps a single document with a leading marker as an object", () => {
    expect(JSON.parse(yamlToJson("---\na: 1\n").output)).toEqual({ a: 1 });
  });
  it("expands anchors and aliases", () => {
    expect(JSON.parse(yamlToJson("base: &b {x: 1}\ncopy: *b").output)).toEqual({ base: { x: 1 }, copy: { x: 1 } });
  });
  it("reports the line and column of a syntax error", () => {
    try {
      yamlToJson("a: 1\nb: [1, 2\nc: 3");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConversionError);
      expect((error as ConversionError).line).toBe(3);
      expect((error as Error).message).toMatch(/^Line 3, column 1: /);
    }
  });
  it("returns an empty result for blank input", () => {
    expect(yamlToJson("  \n")).toEqual({ output: "", documents: 0 });
  });
});

describe("jsonToYaml", () => {
  it("converts JSON to YAML", () => {
    expect(jsonToYaml('{"a":1,"b":[1,{"c":"x"}]}').output).toBe("a: 1\nb:\n  - 1\n  - c: x\n");
  });
  it("round trips through both directions", () => {
    const data = { name: "DevTools", tags: ["offline", "desktop"], nested: { n: 1.5, ok: true, none: null } };
    const yaml = jsonToYaml(JSON.stringify(data)).output;
    expect(JSON.parse(yamlToJson(yaml).output)).toEqual(data);
  });
  it("reports invalid JSON with a line number", () => {
    expect(() => jsonToYaml('{\n  "a": 1,\n  bad\n}')).toThrow(/^Line 3, column 3: Invalid JSON/);
  });
});
