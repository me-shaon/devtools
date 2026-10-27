/**
 * JSON Schema validation with Ajv. The documents are parsed here, not with JSON.parse,
 * so each error can point at the exact text of the value that failed.
 * Ajv loads on first use, so it stays out of the main bundle.
 */
import { isMap, isScalar, isSeq, parseDocument as parseYamlDocument, type Node as YamlNode } from "yaml";
import { emitCode, inferModel } from "./json-to-code";
import { errorAt, setOwn } from "./conversion-error";

export interface SourceRange {
  start: number;
  end: number;
}

interface Location {
  value: SourceRange;
  /** The property name, for values inside an object. */
  key?: SourceRange;
}

export type ParsedDocument =
  | { ok: true; value: unknown; format: "json" | "yaml"; locations: Map<string, Location> }
  | { ok: false; error: string; line?: number; column?: number };

const escapePointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
const childPointer = (pointer: string, key: string | number) => `${pointer}/${escapePointer(String(key))}`;

/** Converts a 0-based offset to a 1-based line and column. */
export const lineColumn = (text: string, offset: number) => {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
};

class JsonSyntaxError extends Error {
  constructor(message: string, readonly offset: number) {
    super(message);
  }
}

/** A strict JSON parser that records the source range of every value and property name. */
const parseJsonWithLocations = (text: string) => {
  const locations = new Map<string, Location>();
  let i = 0;

  const fail = (message: string, at = i): never => {
    throw new JsonSyntaxError(message, at);
  };
  const skipSpace = () => {
    while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i++;
  };
  const describe = () => (i >= text.length ? "Unexpected end of input" : `Unexpected character ${JSON.stringify(text[i])}`);

  const parseString = (): string => {
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text.charCodeAt(i) < 0x20) fail("Control characters must be escaped in strings");
      i += text[i] === "\\" ? 2 : 1;
    }
    if (i >= text.length) fail("Unterminated string", start);
    i++;
    try {
      return JSON.parse(text.slice(start, i)) as string;
    } catch {
      return fail("Invalid escape sequence in string", start);
    }
  };

  const parseValue = (pointer: string, key?: SourceRange): unknown => {
    skipSpace();
    const start = i;
    let value: unknown;
    const ch = text[i];
    if (ch === "{") {
      i++;
      const object = {};
      skipSpace();
      if (text[i] === "}") i++;
      else {
        for (;;) {
          skipSpace();
          if (text[i] !== '"') fail(text[i] === "}" ? "Trailing comma before }" : `${describe()}. Expected a property name in double quotes`);
          const keyStart = i;
          const name = parseString();
          const keyRange = { start: keyStart, end: i };
          skipSpace();
          if (text[i] !== ":") fail(`${describe()}. Expected ":" after the property name`);
          i++;
          setOwn(object, name, parseValue(childPointer(pointer, name), keyRange));
          skipSpace();
          if (text[i] === ",") {
            i++;
            continue;
          }
          if (text[i] === "}") {
            i++;
            break;
          }
          fail(`${describe()}. Expected "," or "}"`);
        }
      }
      value = object;
    } else if (ch === "[") {
      i++;
      const array: unknown[] = [];
      skipSpace();
      if (text[i] === "]") i++;
      else {
        for (;;) {
          skipSpace();
          if (text[i] === "]") fail("Trailing comma before ]");
          array.push(parseValue(childPointer(pointer, array.length)));
          skipSpace();
          if (text[i] === ",") {
            i++;
            continue;
          }
          if (text[i] === "]") {
            i++;
            break;
          }
          fail(`${describe()}. Expected "," or "]"`);
        }
      }
      value = array;
    } else if (ch === '"') {
      value = parseString();
    } else {
      const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 400));
      if (!literal) fail(describe());
      const word = literal![0];
      i += word.length;
      value = word === "true" ? true : word === "false" ? false : word === "null" ? null : Number(word);
    }
    locations.set(pointer, { value: { start, end: i }, ...(key ? { key } : {}) });
    return value;
  };

  const value = parseValue("");
  skipSpace();
  if (i < text.length) fail(`${describe()} after the end of the JSON value`);
  return { value, locations };
};

const yamlLocations = (node: YamlNode | null | undefined, pointer: string, locations: Map<string, Location>, key?: SourceRange) => {
  if (!node) return;
  if (node.range) locations.set(pointer, { value: { start: node.range[0], end: node.range[1] }, ...(key ? { key } : {}) });
  if (isMap(node)) {
    for (const pair of node.items) {
      const keyNode = pair.key as YamlNode | null;
      const name = isScalar(keyNode) ? String(keyNode.value) : String(keyNode);
      const keyRange = keyNode?.range ? { start: keyNode.range[0], end: keyNode.range[1] } : undefined;
      yamlLocations(pair.value as YamlNode | null, childPointer(pointer, name), locations, keyRange);
    }
  } else if (isSeq(node)) {
    node.items.forEach((item, index) => yamlLocations(item as YamlNode, childPointer(pointer, index), locations));
  }
};

/**
 * Parses JSON, or YAML when the text does not start with "{" or "[".
 * YAML lets the tool check Kubernetes manifests and OpenAPI files as they are.
 */
export function parseDocument(text: string): ParsedDocument {
  if (/^\s*[[{]/.test(text)) {
    try {
      return { ok: true, format: "json", ...parseJsonWithLocations(text) };
    } catch (error) {
      if (!(error instanceof JsonSyntaxError)) throw error;
      const { line, column } = lineColumn(text, error.offset);
      return { ok: false, error: errorAt(`Invalid JSON. ${error.message}.`, line, column).message, line, column };
    }
  }
  const doc = parseYamlDocument(text, { prettyErrors: true });
  if (doc.errors.length) {
    const first = doc.errors[0];
    const pos = first.linePos?.[0];
    const message = first.message.split("\n")[0].replace(/ at line \d+, column \d+:?$/, "").trim();
    return { ok: false, error: errorAt(`Invalid YAML. ${message}`, pos?.line, pos?.col).message, line: pos?.line, column: pos?.col };
  }
  const locations = new Map<string, Location>();
  yamlLocations(doc.contents as YamlNode | null, "", locations);
  return { ok: true, format: "yaml", value: doc.toJS({ maxAliasCount: 1000 }), locations };
}

/** Finds the text range for a JSON pointer, or for the nearest parent when the path does not exist. */
export function locate(doc: ParsedDocument & { ok: true }, pointer: string, key = false): SourceRange | undefined {
  let current = pointer;
  for (;;) {
    const location = doc.locations.get(current);
    if (location) return (key && current === pointer && location.key) || location.value;
    if (!current) return undefined;
    current = current.slice(0, current.lastIndexOf("/"));
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

type AjvClass = typeof import("ajv").default;
type AjvInstance = InstanceType<AjvClass>;
type AjvError = NonNullable<AjvInstance["errors"]>[number];

export interface ValidatorModules {
  Ajv07: AjvClass;
  Ajv2019: AjvClass;
  Ajv2020: AjvClass;
  addFormats: typeof import("ajv-formats").default;
}

// CommonJS modules can arrive with the export on `default` or on `default.default`.
const unwrap = <T>(module: { default: T }): T => ((module.default as { default?: T }).default ?? module.default);

let modulesPromise: Promise<ValidatorModules> | undefined;

/** Loads Ajv on first use. */
export function loadValidator(): Promise<ValidatorModules> {
  modulesPromise ??= Promise.all([import("ajv"), import("ajv/dist/2019"), import("ajv/dist/2020"), import("ajv-formats")])
    .then(([a07, a2019, a2020, formats]) => ({
      Ajv07: unwrap(a07),
      Ajv2019: unwrap(a2019) as unknown as AjvClass,
      Ajv2020: unwrap(a2020) as unknown as AjvClass,
      addFormats: unwrap(formats),
    }))
    .catch((error) => {
      modulesPromise = undefined;
      throw error;
    });
  return modulesPromise;
}

export type Draft = "2020-12" | "2019-09" | "draft-07" | "draft-06" | "draft-04";

export const DRAFT_LABELS: Record<Draft, string> = {
  "2020-12": "Draft 2020-12",
  "2019-09": "Draft 2019-09",
  "draft-07": "Draft-07",
  "draft-06": "Draft-06",
  "draft-04": "Draft-04",
};

export interface SchemaIssue {
  /** The JSON pointer shown to the user, "/" for the root. */
  path: string;
  keyword: string;
  message: string;
  /** The JSON pointer to select in the document. */
  pointer: string;
  /** Select the property name instead of its value. */
  key: boolean;
}

export type CompiledSchema =
  | { ok: true; draft: Draft; notice?: string; validate: (data: unknown) => SchemaIssue[] }
  | { ok: false; error: string; issues?: SchemaIssue[] };

const DRAFT_PATTERNS: [RegExp, Draft][] = [
  [/draft\/2020-12\/schema/, "2020-12"],
  [/draft\/2019-09\/schema/, "2019-09"],
  [/draft-07\/schema/, "draft-07"],
  [/draft-06\/schema/, "draft-06"],
  [/draft-0[34]\/schema/, "draft-04"],
];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Rewrites draft-04 syntax for the draft-07 validator: `id` to `$id`, and boolean exclusive limits to numbers. */
const upgradeDraft04 = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(upgradeDraft04);
  if (!isObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) setOwn(out, key, upgradeDraft04(child));
  if (typeof out.id === "string" && out.$id === undefined) {
    out.$id = out.id;
    delete out.id;
  }
  for (const [flag, limit] of [["exclusiveMinimum", "minimum"], ["exclusiveMaximum", "maximum"]] as const) {
    if (out[flag] === true && typeof out[limit] === "number") {
      out[flag] = out[limit];
      delete out[limit];
    } else if (typeof out[flag] === "boolean") delete out[flag];
  }
  return out;
};

const typeName = (value: unknown) => (value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value);

const preview = (value: unknown) => {
  const text = JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
};

const toIssue = (error: AjvError): SchemaIssue => {
  const params = error.params as Record<string, unknown>;
  const base = error.instancePath;
  const issue = (message: string, pointer = base, key = false): SchemaIssue => ({ path: pointer || "/", keyword: error.keyword, message, pointer, key });
  switch (error.keyword) {
    case "required":
      return issue(`Missing required property "${params.missingProperty}"`);
    case "additionalProperties":
    case "unevaluatedProperties": {
      const name = String(params.additionalProperty ?? params.unevaluatedProperty);
      return issue(`Property "${name}" is not allowed`, childPointer(base, name), true);
    }
    case "propertyNames":
      return issue(`Property name "${params.propertyName}" is not valid`, childPointer(base, String(params.propertyName)), true);
    case "type": {
      const expected = String(params.type).split(",").join(" or ");
      return issue(`Expected ${expected}, got ${typeName(error.data)}`);
    }
    case "enum": {
      const allowed = (params.allowedValues as unknown[]) ?? [];
      const list = allowed.slice(0, 10).map(preview).join(", ");
      return issue(`Must be one of: ${list}${allowed.length > 10 ? ", ..." : ""}`);
    }
    case "const":
      return issue(`Must equal ${preview(params.allowedValue)}`);
    case "format":
      return issue(`Must be a valid "${params.format}"`);
    default: {
      const message = error.message ?? "Is not valid";
      return issue(message.charAt(0).toUpperCase() + message.slice(1));
    }
  }
};

/** Converts Ajv errors to issues, and drops repeats that anyOf and oneOf branches can produce. */
const toIssues = (errors: AjvError[] | null | undefined) => {
  const seen = new Set<string>();
  const out: SchemaIssue[] = [];
  for (const error of errors ?? []) {
    const issue = toIssue(error);
    const id = `${issue.pointer}\u0000${issue.keyword}\u0000${issue.message}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(issue);
  }
  return out;
};

const isRemote = (ref: string) => !ref.startsWith("#");

/** Compiles a schema. Detects the draft from `$schema` and uses draft-07 when it is missing. */
export function compileSchema(modules: ValidatorModules, schema: unknown): CompiledSchema {
  if (!isObject(schema) && typeof schema !== "boolean") return { ok: false, error: "The schema must be a JSON object or a boolean." };
  const declared = isObject(schema) && typeof schema.$schema === "string" ? schema.$schema : undefined;
  let draft: Draft = "draft-07";
  let notice: string | undefined;
  let source = schema;
  if (declared) {
    const match = DRAFT_PATTERNS.find(([pattern]) => pattern.test(declared));
    if (match) draft = match[1];
    else notice = `The $schema "${declared}" is not a known draft. The tool validates with draft-07.`;
  }
  if (isObject(source) && (draft === "draft-04" || draft === "draft-06" || notice)) {
    // Ajv has no draft-04 or draft-06 meta-schema built in. Draft-07 reads both once the syntax is updated.
    source = { ...(draft === "draft-04" ? (upgradeDraft04(source) as Record<string, unknown>) : source) };
    delete (source as Record<string, unknown>).$schema;
    if (draft === "draft-04") notice = "Draft-04 schemas are checked with the draft-07 rules. Boolean exclusiveMinimum and exclusiveMaximum are converted.";
  }

  const AjvClass = draft === "2020-12" ? modules.Ajv2020 : draft === "2019-09" ? modules.Ajv2019 : modules.Ajv07;
  // strict: false accepts the extra keywords that OpenAPI and Kubernetes schemas use.
  const ajv = new AjvClass({ allErrors: true, strict: false, verbose: true, validateSchema: false, discriminator: true });
  modules.addFormats(ajv);

  if (!ajv.validateSchema(source as object)) {
    const issues = toIssues(ajv.errors);
    return { ok: false, error: `The schema is not valid against ${DRAFT_LABELS[draft]}.`, issues };
  }

  let validateFn: ReturnType<AjvInstance["compile"]>;
  try {
    validateFn = ajv.compile(source as object);
  } catch (error) {
    const ref = (error as { missingRef?: string }).missingRef;
    if (ref) {
      return {
        ok: false,
        error: isRemote(ref)
          ? `The $ref "${ref}" is not fetched, because the tool works offline. Copy that schema into $defs and point $ref at it.`
          : `The $ref "${ref}" does not point to anything in this schema.`,
      };
    }
    return { ok: false, error: `The schema cannot be compiled. ${(error as Error).message}` };
  }

  return {
    ok: true,
    draft,
    ...(notice ? { notice } : {}),
    validate: (data) => (validateFn(data) ? [] : toIssues(validateFn.errors)),
  };
}

/** Writes a starter 2020-12 schema from sample data, with JSON to Code's generator. */
export function generateSchema(value: unknown): string {
  return emitCode(inferModel(value), "json-schema");
}
