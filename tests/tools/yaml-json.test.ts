import { beforeAll, describe, expect, it } from "vitest";
import {
  ConversionError,
  convertConfig,
  detectConfigFormat,
  jsonToYaml,
  loadToml,
  needsToml,
  yamlToJson,
  type ConfigFormat,
  type ConvertOptions,
  type TomlModule,
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

describe("detectConfigFormat", () => {
  it("recognizes each format", () => {
    expect(detectConfigFormat('{"a": 1}')).toBe("json");
    expect(detectConfigFormat('[package]\nname = "demo"\nversion = "0.1.0"')).toBe("toml");
    expect(detectConfigFormat('[tool.poetry]\nname = "x"')).toBe("toml");
    expect(detectConfigFormat("# db\nDB_HOST=localhost\nexport DB_PORT=5432")).toBe("env");
    expect(detectConfigFormat("server.port=8080\nspring.application.name=demo")).toBe("properties");
    expect(detectConfigFormat("name: demo\nitems:\n  - a")).toBe("yaml");
  });

  it("returns null when it is not sure", () => {
    expect(detectConfigFormat("hello world")).toBeNull();
    expect(detectConfigFormat("")).toBeNull();
  });
});
