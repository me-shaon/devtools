import { beforeAll, describe, expect, it } from "vitest";
import { countO200k } from "@/utils/token-counter";
import {
  ConversionError,
  compareTokens,
  convertConfig,
  detectConfigFormat,
  jsonToYaml,
  loadToml,
  loadToon,
  needsToml,
  needsToon,
  percentSaved,
  yamlToJson,
  type ConfigFormat,
  type ConvertOptions,
  type TomlModule,
  type ToonModule,
} from "@/utils/yaml-json";

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

describe("convertConfig", () => {
  let toml: TomlModule;
  beforeAll(async () => {
    toml = await loadToml();
  });
  const convert = (input: string, from: ConfigFormat, to: ConfigFormat, options: Partial<ConvertOptions> = {}) =>
    convertConfig(input, from, to, { indent: 2, envNesting: "__", ...options }, toml).output;

  it("says which formats need the TOML parser", () => {
    expect(needsToml("yaml", "json")).toBe(false);
    expect(needsToml("toml", "json")).toBe(true);
    expect(needsToml("env", "toml")).toBe(true);
    expect(() => convertConfig("a = 1", "toml", "json", { indent: 2, envNesting: "__" })).toThrow(/TOML parser/);
  });

  it("converts TOML to JSON, with dates as ISO text", () => {
    const text = '[package]\nname = "demo"\nreleased = 2024-05-01\n\n[dependencies]\nserde = { version = "1", features = ["derive"] }\n';
    expect(JSON.parse(convert(text, "toml", "json"))).toEqual({
      package: { name: "demo", released: "2024-05-01" },
      dependencies: { serde: { version: "1", features: ["derive"] } },
    });
  });

  it("converts JSON to TOML", () => {
    expect(convert('{"title":"x","owner":{"name":"Tom","tags":[1,2]}}', "json", "toml")).toBe(
      'title = "x"\n\n[owner]\nname = "Tom"\ntags = [ 1, 2 ]\n',
    );
  });

  it("reports TOML syntax errors with a line and column", () => {
    expect(() => convert("a = 1\nb = \n", "toml", "json")).toThrow(/^Line 2, column 5: /);
  });

  it("refuses null values for TOML and names the key", () => {
    expect(() => convert('{"a":{"b":null}}', "json", "toml")).toThrow(/"a.b"/);
  });

  it("turns a .env file into a ConfigMap-ready YAML mapping with string values", () => {
    expect(convert("PORT=3000\nDEBUG=true\nNAME='My App'", "env", "yaml")).toBe('PORT: "3000"\nDEBUG: "true"\nNAME: My App\n');
  });

  it("writes nested data to .env in UPPER_SNAKE with the chosen separator", () => {
    const json = '{"database":{"host":"db","maxPool":5},"servers":["a","b"],"debug":false,"none":null}';
    expect(convert(json, "json", "env")).toBe("DATABASE__HOST=db\nDATABASE__MAX_POOL=5\nSERVERS__0=a\nSERVERS__1=b\nDEBUG=false\nNONE=\n");
    expect(convert(json, "json", "env", { envNesting: "_" })).toMatch(/^DATABASE_HOST=db\n/);
  });

  it("reports two paths that give the same .env key", () => {
    expect(() => convert('{"a_b":1,"a":{"b":2}}', "json", "env", { envNesting: "_" })).toThrow(/A_B/);
  });

  it("turns Spring Boot properties into nested YAML", () => {
    const text = "server.port=8080\nspring.datasource.url=jdbc:h2:mem\nspring.datasource.username=sa\napp.hosts[0]=a";
    expect(convert(text, "properties", "yaml")).toBe(
      'server:\n  port: "8080"\nspring:\n  datasource:\n    url: jdbc:h2:mem\n    username: sa\napp:\n  hosts:\n    - a\n',
    );
  });

  it("writes nested YAML as dot keys in .properties", () => {
    expect(convert("server:\n  port: 8080\napp:\n  hosts: [a, b]\n", "yaml", "properties")).toBe(
      "server.port=8080\napp.hosts[0]=a\napp.hosts[1]=b\n",
    );
  });

  it("turns properties into Spring-style .env keys with a single underscore", () => {
    expect(convert("spring.datasource.url=x", "properties", "env", { envNesting: "_" })).toBe("SPRING_DATASOURCE_URL=x\n");
  });

  it("needs an object at the top level for flat formats and TOML", () => {
    expect(() => convert("[1, 2]", "json", "env")).toThrow(/\.env needs an object at the top level/);
    expect(() => convert("a: 1\n---\nb: 2", "yaml", "toml")).toThrow(/one YAML document/);
  });

  it("keeps several YAML documents apart when the target is YAML", () => {
    expect(convert("a: 1\n---\nb: 2\n", "yaml", "yaml")).toBe("a: 1\n---\nb: 2\n");
  });
});

describe("TOON", () => {
  let toml: TomlModule;
  let toon: ToonModule;
  beforeAll(async () => {
    [toml, toon] = await Promise.all([loadToml(), loadToon()]);
  });
  const convert = (input: string, from: ConfigFormat, to: ConfigFormat, options: Partial<ConvertOptions> = {}) =>
    convertConfig(input, from, to, { indent: 2, envNesting: "__", ...options }, toml, toon).output;
  const roundTrip = (data: unknown, options: Partial<ConvertOptions> = {}) =>
    JSON.parse(convert(convert(JSON.stringify(data), "json", "toon", options), "toon", "json"));

  it("says which formats need the TOON encoder", () => {
    expect(needsToon("yaml", "json")).toBe(false);
    expect(needsToon("toon", "json")).toBe(true);
    expect(needsToon("yaml", "toon")).toBe(true);
    expect(() => convertConfig("a: 1", "toon", "json", { indent: 2, envNesting: "__" })).toThrow(/TOON encoder/);
  });

  it("writes a uniform array of objects as a table", () => {
    const json = '{"users":[{"id":1,"name":"Ada","admin":true},{"id":2,"name":"Bob","admin":false}]}';
    expect(convert(json, "json", "toon")).toBe("users[2]{id,name,admin}:\n  1,Ada,true\n  2,Bob,false\n");
    expect(roundTrip(JSON.parse(json))).toEqual(JSON.parse(json));
  });

  it("writes nested objects with indentation and the chosen indent", () => {
    const data = { server: { http: { port: 8080 } }, name: "api" };
    expect(convert(JSON.stringify(data), "json", "toon")).toBe("server:\n  http:\n    port: 8080\nname: api\n");
    expect(convert(JSON.stringify(data), "json", "toon", { indent: 4 })).toBe("server:\n    http:\n        port: 8080\nname: api\n");
    expect(roundTrip(data, { indent: 4 })).toEqual(data);
  });

  it("writes an array of primitives on one line", () => {
    expect(convert('{"tags":["a","b","c"],"empty":[]}', "json", "toon")).toBe("tags[3]: a,b,c\nempty: []\n");
    expect(roundTrip([1, "two", true, null])).toEqual([1, "two", true, null]);
  });

  it("quotes strings that would read as another value", () => {
    const data = { a: "x, y", b: "true", c: "42", d: "", e: " pad", f: 'say "hi"', "g h": 1 };
    const text = convert(JSON.stringify(data), "json", "toon");
    expect(text).toContain('a: "x, y"\nb: "true"\nc: "42"\nd: ""\ne: " pad"\nf: "say \\"hi\\""\n"g h": 1');
    expect(roundTrip(data)).toEqual(data);
  });

  it("uses the chosen delimiter and reads it back", () => {
    const data = { rows: [{ id: 1, note: "a, b" }, { id: 2, note: "c" }], tags: ["x", "y"] };
    const tab = convert(JSON.stringify(data), "json", "toon", { toonDelimiter: "\t" });
    expect(tab).toBe("rows[2\t]{id\tnote}:\n  1\ta, b\n  2\tc\ntags[2\t]: x\ty\n");
    expect(convert(JSON.stringify(data), "json", "toon", { toonDelimiter: "|" })).toContain("rows[2|]{id|note}:\n  1|a, b\n");
    expect(roundTrip(data, { toonDelimiter: "\t" })).toEqual(data);
    expect(roundTrip(data, { toonDelimiter: "|" })).toEqual(data);
  });

  it("converts YAML and TOML to TOON", () => {
    expect(convert("name: demo\nports: [80, 443]\n", "yaml", "toon")).toBe("name: demo\nports[2]: 80,443\n");
    expect(convert('[package]\nname = "demo"\nreleased = 2024-05-01\n', "toml", "toon")).toBe('package:\n  name: demo\n  released: 2024-05-01\n');
  });

  it("turns several YAML documents into one TOON array", () => {
    const result = convertConfig("id: 1\n---\nid: 2\n", "yaml", "toon", { indent: 2, envNesting: "__" }, undefined, toon);
    expect(result.output).toBe("[2]{id}:\n  1\n  2\n");
    expect(result.documents).toBe(2);
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("converts TOON to YAML", () => {
    expect(convert("app: api\nusers[2]{id,name}:\n  1,Ada\n  2,Bob\n", "toon", "yaml")).toBe("app: api\nusers:\n  - id: 1\n    name: Ada\n  - id: 2\n    name: Bob\n");
  });

  it("reports TOON errors with a line and column", () => {
    expect(() => convert("users[2]{id,name}:\n  1,Ada\n", "toon", "json")).toThrow(/^Line 2, column 3: Expected 2 tabular rows, but got 1$/);
    expect(() => convert('a: 1\nb: "open', "toon", "json")).toThrow(/^Line 2, column 1: Unterminated string/);
    try {
      convert("a:\n  b: 1\n c: 2", "toon", "json");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConversionError);
      expect((error as ConversionError).line).toBe(3);
    }
  });

  it("counts tokens for minified JSON, pretty JSON, and TOON", async () => {
    expect(percentSaved(200, 120)).toBe(40);
    expect(percentSaved(100, 110)).toBe(-10);
    expect(percentSaved(0, 5)).toBe(0);
    const count = async (text: string) => text.length;
    expect(await compareTokens({ a: 1 }, "a: 1\n", count)).toEqual({ json: 7, prettyJson: 12, toon: 4, saved: 42.9 });
  });

  it("shows that TOON saves o200k tokens on uniform records", async () => {
    const users = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}`, email: `user${i + 1}@example.com`, active: i % 2 === 0 }));
    const result = convertConfig(JSON.stringify({ users }), "json", "toon", { indent: 2, envNesting: "__" }, undefined, toon);
    const comparison = await compareTokens(result.data, result.output, async (text) => (await countO200k(text)).count);
    expect(comparison.toon).toBeLessThan(comparison.json);
    expect(comparison.json).toBeLessThan(comparison.prettyJson);
    expect(comparison.saved).toBeGreaterThan(30);
  });
});

describe("detectConfigFormat", () => {
  it("recognizes each format", () => {
    expect(detectConfigFormat('{"a": 1}')).toBe("json");
    expect(detectConfigFormat('[package]\nname = "demo"\nversion = "0.1.0"')).toBe("toml");
    expect(detectConfigFormat('[tool.poetry]\nname = "x"')).toBe("toml");
    expect(detectConfigFormat("# db\nDB_HOST=localhost\nexport DB_PORT=5432")).toBe("env");
    expect(detectConfigFormat("server.port=8080\nspring.application.name=demo")).toBe("properties");
    expect(detectConfigFormat("name: demo\nitems:\n  - a")).toBe("yaml");
  });

  it("recognizes TOON by its array headers", () => {
    expect(detectConfigFormat("users[2]{id,name}:\n  1,Ada\n  2,Bob")).toBe("toon");
    expect(detectConfigFormat("name: demo\ntags[2]: a,b")).toBe("toon");
    expect(detectConfigFormat("[2\t]{id\tname}:\n  1\tAda\n  2\tBob")).toBe("toon");
    expect(detectConfigFormat("items[1]:\n  - id: 1")).toBe("toon");
    expect(detectConfigFormat("envs[2:]{region}:\n  prod: eu\n  dev: us")).toBe("toon");
  });

  it("keeps YAML that only looks like a TOON header", () => {
    expect(detectConfigFormat("matrix[2]: one value\nname: x")).toBe("yaml");
    expect(detectConfigFormat("name: demo\ntags: [a, b]")).toBe("yaml");
    expect(detectConfigFormat("app.hosts[0]=a\napp.name=x")).toBe("properties");
  });

  it("returns null when it is not sure", () => {
    expect(detectConfigFormat("hello world")).toBeNull();
    expect(detectConfigFormat("")).toBeNull();
  });
});
