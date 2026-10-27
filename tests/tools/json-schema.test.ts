import { beforeAll, describe, expect, it } from "vitest";
import {
  compileSchema,
  generateSchema,
  loadValidator,
  locate,
  parseDocument,
  type CompiledSchema,
  type ParsedDocument,
  type ValidatorModules,
} from "@/utils/json-schema";

let modules: ValidatorModules;
beforeAll(async () => {
  modules = await loadValidator();
});

const parsed = (text: string) => {
  const doc = parseDocument(text);
  if (!doc.ok) throw new Error(doc.error);
  return doc;
};

const compiled = (schema: unknown) => {
  const result = compileSchema(modules, schema);
  if (!result.ok) throw new Error(result.error);
  return result;
};

const issues = (schema: unknown, data: unknown) => compiled(schema).validate(data);

const textAt = (text: string, doc: ParsedDocument & { ok: true }, pointer: string, key = false) => {
  const range = locate(doc, pointer, key);
  return range ? text.slice(range.start, range.end) : undefined;
};

describe("parseDocument", () => {
  it("parses JSON and records where each value is", () => {
    const text = '{\n  "items": [\n    {"price": 1},\n    {"price": "x"}\n  ],\n  "a/b": true\n}';
    const doc = parsed(text);
    expect(doc.format).toBe("json");
    expect(doc.value).toEqual({ items: [{ price: 1 }, { price: "x" }], "a/b": true });
    expect(textAt(text, doc, "/items/1/price")).toBe('"x"');
    expect(textAt(text, doc, "/items/1/price", true)).toBe('"price"');
    expect(textAt(text, doc, "/items/0")).toBe('{"price": 1}');
    expect(textAt(text, doc, "/a~1b")).toBe("true");
    expect(textAt(text, doc, "")).toBe(text);
  });

  it("falls back to the nearest parent for an unknown path", () => {
    const text = '{"a": {"b": 1}}';
    expect(textAt(text, parsed(text), "/a/missing")).toBe('{"b": 1}');
  });

  it("reports JSON errors with a line and column", () => {
    const doc = parseDocument('{\n  "a": 1,\n  "b": }');
    expect(doc.ok).toBe(false);
    if (!doc.ok) {
      expect(doc.error).toMatch(/^Line 3, column 8:/);
      expect(doc.line).toBe(3);
      expect(doc.column).toBe(8);
    }
  });

  it("rejects trailing commas and text after the value", () => {
    expect(parseDocument('{"a": 1,}').ok).toBe(false);
    expect(parseDocument("[1] x").ok).toBe(false);
  });

  it("parses YAML and records where each value is", () => {
    const text = "apiVersion: v1\nspec:\n  replicas: three\n  ports:\n    - 80\n    - http\n";
    const doc = parsed(text);
    expect(doc.format).toBe("yaml");
    expect(doc.value).toEqual({ apiVersion: "v1", spec: { replicas: "three", ports: [80, "http"] } });
    expect(textAt(text, doc, "/spec/replicas")).toBe("three");
    expect(textAt(text, doc, "/spec/replicas", true)).toBe("replicas");
    expect(textAt(text, doc, "/spec/ports/1")).toBe("http");
  });

  it("reports YAML errors with a line and column", () => {
    const doc = parseDocument("a: 1\nb: [1, 2\n");
    expect(doc.ok).toBe(false);
    if (!doc.ok) expect(doc.error).toMatch(/^Line \d+, column \d+:/);
  });
});

describe("compileSchema", () => {
  it("picks the draft from $schema", () => {
    expect(compiled({ $schema: "https://json-schema.org/draft/2020-12/schema" }).draft).toBe("2020-12");
    expect(compiled({ $schema: "https://json-schema.org/draft/2019-09/schema" }).draft).toBe("2019-09");
    expect(compiled({ $schema: "http://json-schema.org/draft-07/schema#" }).draft).toBe("draft-07");
    expect(compiled({ $schema: "http://json-schema.org/draft-06/schema#" }).draft).toBe("draft-06");
    expect(compiled({}).draft).toBe("draft-07");
  });

  it("supports 2020-12 keywords", () => {
    const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", prefixItems: [{ type: "string" }], items: false };
    expect(issues(schema, ["a"])).toEqual([]);
    expect(issues(schema, ["a", 1]).map((i) => i.keyword)).toEqual(["items"]);
  });

  it("reads draft-04 schemas and converts boolean exclusive limits", () => {
    const result = compiled({ $schema: "http://json-schema.org/draft-04/schema#", type: "number", minimum: 0, exclusiveMinimum: true });
    expect(result.draft).toBe("draft-04");
    expect(result.notice).toMatch(/draft-04/i);
    expect(result.validate(0)).toHaveLength(1);
    expect(result.validate(1)).toEqual([]);
  });

  it("explains that remote $ref URLs are not fetched", () => {
    const result = compileSchema(modules, { $ref: "https://example.com/schemas/user.json" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/https:\/\/example\.com\/schemas\/user\.json.*not fetched/);
  });

  it("resolves local $ref and $defs", () => {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { owner: { $ref: "#/$defs/user" } },
      $defs: { user: { type: "object", required: ["name"] } },
    };
    expect(issues(schema, { owner: {} })[0]).toMatchObject({ path: "/owner", keyword: "required" });
  });

  it("lists schema mistakes with their location in the schema", () => {
    const result = compileSchema(modules, { type: "object", properties: { age: { type: "int" } } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/schema is not valid/i);
      expect(result.issues?.[0].pointer).toBe("/properties/age/type");
    }
  });

  it("rejects a schema that is not an object or a boolean", () => {
    expect(compileSchema(modules, 42).ok).toBe(false);
  });
});

describe("validate", () => {
  const schema = {
    type: "object",
    required: ["name", "items"],
    additionalProperties: false,
    properties: {
      name: { type: "string" },
      email: { type: "string", format: "email" },
      status: { enum: ["draft", "live"] },
      items: { type: "array", items: { type: "object", properties: { price: { type: "number", minimum: 0 } } } },
    },
  };

  it("returns no issues for valid data", () => {
    expect(issues(schema, { name: "a", items: [] })).toEqual([]);
  });

  it("reports every error with its path, keyword, and a plain message", () => {
    const result: ReturnType<Extract<CompiledSchema, { ok: true }>["validate"]> = issues(schema, {
      items: [{ price: 1 }, { price: -1 }, { price: "9" }],
      email: "nope",
      status: "gone",
      extra: 1,
    });
    const byKeyword = Object.fromEntries(result.map((i) => [i.keyword, i]));
    expect(byKeyword.required).toMatchObject({ path: "/", message: 'Missing required property "name"' });
    expect(byKeyword.additionalProperties).toMatchObject({ path: "/extra", message: 'Property "extra" is not allowed', key: true });
    expect(byKeyword.minimum).toMatchObject({ path: "/items/1/price", message: "Must be >= 0" });
    expect(byKeyword.type).toMatchObject({ path: "/items/2/price", message: "Expected number, got string" });
    expect(byKeyword.format).toMatchObject({ path: "/email", message: 'Must be a valid "email"' });
    expect(byKeyword.enum).toMatchObject({ path: "/status", message: 'Must be one of: "draft", "live"' });
  });
});

describe("generateSchema", () => {
  it("writes a 2020-12 schema that the data passes", () => {
    const data = { id: 1, tags: ["a"], owner: { name: "x" } };
    const schema = JSON.parse(generateSchema(data));
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(issues(schema, data)).toEqual([]);
  });
});
