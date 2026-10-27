import { parseAllDocuments, stringify, YAMLError } from "yaml";
import { ConversionError, errorAt, setOwn } from "./conversion-error";
import { envKey, formatEnv, parseEnv, type EnvNesting } from "./env-file";
import { expandKeys, formatProperties, parseProperties, propertiesKey } from "./properties-file";

export { ConversionError };
export type { EnvNesting };

export type YamlIndent = 2 | 4;
export type ConfigFormat = "json" | "yaml" | "toml" | "env" | "properties";

export const CONFIG_FORMATS: readonly ConfigFormat[] = ["json", "yaml", "toml", "env", "properties"];
export const FORMAT_NAMES: Record<ConfigFormat, string> = { json: "JSON", yaml: "YAML", toml: "TOML", env: ".env", properties: ".properties" };

export interface ConvertOptions {
  /** Indent for JSON and YAML output. */
  indent: YamlIndent;
  /** How nested keys join in .env output. */
  envNesting: EnvNesting;
}

export interface ConversionResult {
  output: string;
  /** Number of YAML documents read. Above 1, the JSON output is an array with one item per document. */
  documents: number;
}

export type TomlModule = typeof import("smol-toml");

/** Loads the TOML parser on first use so it stays out of the YAML and JSON path. */
export const loadToml = (): Promise<TomlModule> => import("smol-toml");

export const needsToml = (from: ConfigFormat, to: ConfigFormat) => from === "toml" || to === "toml";

const yamlError = (error: YAMLError) => {
  const pos = error.linePos?.[0];
  // prettyErrors appends a source excerpt after the first line. Keep the message short.
  const text = error.message.split("\n")[0].replace(/ at line \d+, column \d+:?$/, "").trim();
  return errorAt(text, pos?.line, pos?.col);
};

const parseYaml = (input: string): unknown[] => {
  const parsed = parseAllDocuments(input, { prettyErrors: true });
  const docs = Array.isArray(parsed) ? parsed : [parsed];
  for (const doc of docs) {
    if (doc.errors.length) throw yamlError(doc.errors[0]);
  }
  // A stream that has only comments has no content documents.
  return docs.filter((doc) => doc.contents !== null || docs.length === 1).map((doc) => doc.toJS({ maxAliasCount: 1000 }));
};

/** Finds the line and column of a JSON.parse error, from either "position N" or "line L column C" in the message. */
const jsonErrorPosition = (input: string, message: string) => {
  const lineCol = /line (\d+) column (\d+)/.exec(message);
  if (lineCol) return { line: Number(lineCol[1]), column: Number(lineCol[2]) };
  const pos = /position (\d+)/.exec(message);
  if (!pos) return {};
  const before = input.slice(0, Number(pos[1]));
  const lines = before.split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
};

const parseJson = (input: string): unknown => {
  try {
    return JSON.parse(input);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Check the syntax.";
    const { line, column } = jsonErrorPosition(input, raw);
    const message = `Invalid JSON. ${raw.replace(/\s*\(line \d+ column \d+\)/, "").replace(/ in JSON at position \d+.*$/, "")}`;
    throw errorAt(message, line, column);
  }
};

const requireToml = (toml: TomlModule | undefined) => {
  if (!toml) throw new ConversionError("The TOML parser is still loading. Try again in a moment.");
  return toml;
};

const parseToml = (input: string, toml: TomlModule): unknown => {
  try {
    return toml.parse(input);
  } catch (error) {
    if (error instanceof toml.TomlError) throw errorAt(error.message.split("\n")[0].trim(), error.line, error.column);
    throw error;
  }
};

/** TOML dates become ISO 8601 text, so they read the same in every other format. */
const datesToText = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(datesToText);
  if (value && typeof value === "object") {
    const copy = {};
    for (const [key, item] of Object.entries(value)) setOwn(copy, key, datesToText(item));
    return copy;
  }
  return value;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

const parseSource = (input: string, from: ConfigFormat, to: ConfigFormat, toml?: TomlModule): unknown[] => {
  switch (from) {
    case "yaml":
      return parseYaml(input);
    case "json":
      return [parseJson(input)];
    case "toml": {
      const value = parseToml(input, requireToml(toml));
      return [to === "toml" ? value : datesToText(value)];
    }
    case "env":
      return [parseEnv(input)];
    case "properties":
      return [expandKeys(parseProperties(input))];
  }
};

type Path = (string | number)[];

/** Lists every leaf value with its path. Empty objects and arrays become an empty value. */
const flatten = (value: unknown, path: Path = [], out: [Path, string][] = []) => {
  const children = Array.isArray(value) ? value.map((item, index) => [index, item] as const) : isPlainObject(value) ? Object.entries(value) : null;
  if (!children) out.push([path, value instanceof Date ? value.toISOString() : value == null ? "" : String(value)]);
  else if (children.length === 0 && path.length > 0) out.push([path, ""]);
  else for (const [key, item] of children) flatten(item, [...path, key], out);
  return out;
};

const findNull = (value: unknown, path: Path = []): Path | null => {
  if (value === null || value === undefined) return path;
  const children = Array.isArray(value) ? value.map((item, index) => [index, item] as const) : isPlainObject(value) ? Object.entries(value) : [];
  for (const [key, item] of children) {
    const found = findNull(item, [...path, key]);
    if (found) return found;
  }
  return null;
};

/** TOML, .env, and .properties hold one table of keys, so they need one object. */
const singleObject = (values: unknown[], to: ConfigFormat) => {
  const name = FORMAT_NAMES[to];
  if (values.length > 1) throw new ConversionError(`${name} needs one YAML document. This input has ${values.length}.`);
  const value = values[0];
  if (!isPlainObject(value)) {
    const kind = Array.isArray(value) ? "an array" : value === null || value === undefined ? "empty" : "a single value";
    throw new ConversionError(`${name} needs an object at the top level. The input is ${kind}.`);
  }
  return value;
};

const writeEnv = (value: Record<string, unknown>, nesting: EnvNesting) => {
  const sources = new Map<string, string>();
  const entries = flatten(value).map(([path, text]) => {
    const key = envKey(path, nesting);
    const source = propertiesKey(path);
    const earlier = sources.get(key);
    if (earlier !== undefined) throw new ConversionError(`"${earlier}" and "${source}" both become ${key}. Rename one of them.`);
    sources.set(key, source);
    return [key, text] as const;
  });
  return formatEnv(entries);
};

const writeToml = (value: Record<string, unknown>, toml: TomlModule) => {
  const nullPath = findNull(value);
  if (nullPath) throw new ConversionError(`TOML has no null value. Remove or replace "${propertiesKey(nullPath)}".`);
  try {
    const text = toml.stringify(value).trim();
    return text ? `${text}\n` : "";
  } catch (error) {
    throw new ConversionError(error instanceof Error ? error.message : "Could not write TOML.");
  }
};

const writeTarget = (values: unknown[], to: ConfigFormat, options: ConvertOptions, toml?: TomlModule) => {
  switch (to) {
    case "json":
      return JSON.stringify((values.length === 1 ? values[0] : values) ?? null, null, options.indent);
    case "yaml":
      return values.map((value) => stringify(value, { indent: options.indent, lineWidth: 0 })).join("---\n");
    case "toml":
      return writeToml(singleObject(values, to), requireToml(toml));
    case "env":
      return writeEnv(singleObject(values, to), options.envNesting);
    case "properties":
      return formatProperties(flatten(singleObject(values, to)).map(([path, text]) => [propertiesKey(path), text] as const));
  }
};

/**
 * Converts between JSON, YAML, TOML, .env, and .properties. Pass the module from loadToml when
 * either side is TOML. Several YAML documents become a JSON array, or stay separate in YAML.
 * Throws a ConversionError with a short message, and a line and column when the parser gives one.
 */
export function convertConfig(input: string, from: ConfigFormat, to: ConfigFormat, options: ConvertOptions, toml?: TomlModule): ConversionResult {
  if (!input.trim()) return { output: "", documents: 0 };
  if (needsToml(from, to)) requireToml(toml);
  const values = parseSource(input, from, to, toml);
  if (values.length === 0) return { output: to === "yaml" ? "null\n" : "null", documents: 0 };
  return { output: writeTarget(values, to, options, toml), documents: values.length };
}

/** Converts YAML to JSON. Several documents (separated by ---) become a JSON array. */
export function yamlToJson(input: string, indent: YamlIndent = 2): ConversionResult {
  return convertConfig(input, "yaml", "json", { indent, envNesting: "__" });
}

/** Converts JSON to YAML. */
export function jsonToYaml(input: string, indent: YamlIndent = 2): ConversionResult {
  return convertConfig(input, "json", "yaml", { indent, envNesting: "__" });
}

const TOML_TABLE = /^\[\[?[A-Za-z0-9_.\-" ]+\]\]?$/;
const TOML_PAIR = /^[A-Za-z0-9_.\-"]+\s*=\s*\S/;
const TOML_TYPED_PAIR = /^[A-Za-z0-9_.\-"]+ = (["'[{]|\d|true\b|false\b)/;
const ENV_PAIR = /^(export\s+)?[A-Z_][A-Z0-9_]*=/;
const PROPERTIES_PAIR = /^[A-Za-z0-9_-]+(\[\d+\])*(\.[A-Za-z0-9_-]+(\[\d+\])*)+\s*[=:]/;

/** Guesses the format of pasted text. Returns null when no format is a clear match. */
export function detectConfigFormat(text: string): ConfigFormat | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/^[[{]/.test(trimmed)) {
    try {
      const value = JSON.parse(trimmed);
      if (typeof value === "object" && value !== null) return "json";
    } catch {
      /* Not JSON. A TOML table header also starts with [. */
    }
  }
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  if (lines.some((line) => TOML_TABLE.test(line)) && lines.some((line) => TOML_PAIR.test(line))) return "toml";
  if (ENV_PAIR.test(lines[0] ?? "")) {
    try {
      const keys = Object.keys(parseEnv(trimmed));
      if (keys.length && keys.every((key) => /^[A-Z_][A-Z0-9_]*$/.test(key))) return "env";
    } catch {
      /* Not a .env file. */
    }
  }
  if (lines.length && lines.every((line) => TOML_TYPED_PAIR.test(line))) return "toml";
  const pairs = lines.filter((line) => !line.startsWith("!"));
  if (pairs.length && pairs.every((line) => PROPERTIES_PAIR.test(line))) return "properties";
  if (lines.some((line) => /^(- |---$)/.test(line) || /^[^\s:#][^:]*:(\s|$)/.test(line))) return "yaml";
  return null;
}
