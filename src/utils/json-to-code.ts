/**
 * JSON to code: infers one type model from a JSON sample, then emits it as
 * TypeScript, Go, Rust, Python, Swift, Kotlin, or JSON Schema.
 */

export type CodeLanguage = "typescript" | "go" | "rust" | "python" | "swift" | "kotlin" | "json-schema";

export const CODE_LANGUAGES: { id: CodeLanguage; label: string }[] = [
  { id: "typescript", label: "TypeScript" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "python", label: "Python" },
  { id: "swift", label: "Swift" },
  { id: "kotlin", label: "Kotlin" },
  { id: "json-schema", label: "JSON Schema" },
];

export interface CodeOptions {
  /** Name of the top-level type. Defaults to "Root". */
  rootName?: string;
  /** TypeScript: emit interfaces or type aliases. */
  tsStyle?: "interface" | "type";
  /** TypeScript: mark every property readonly. */
  tsReadonly?: boolean;
  /** Python: emit dataclasses or Pydantic models. */
  pythonStyle?: "dataclass" | "pydantic";
}

/* ------------------------------------------------------------------ */
/* Type model                                                          */
/* ------------------------------------------------------------------ */

/** Why a type is unknown: the sample array was empty, or the sample value was null. */
export type UnknownReason = "empty-array" | "null";

export type TypeRef = { nullable: boolean } & (
  | { kind: "string" | "integer" | "number" | "boolean" }
  | { kind: "unknown"; reason: UnknownReason }
  | { kind: "array"; items: TypeRef }
  | { kind: "object"; name: string }
  | { kind: "union"; members: TypeRef[] }
);

export interface FieldModel {
  /** The JSON key, as written in the sample. */
  key: string;
  type: TypeRef;
  /** The key is missing from some of the merged objects. */
  optional: boolean;
}

export interface ObjectModel {
  name: string;
  fields: FieldModel[];
}

export interface CodeModel {
  rootName: string;
  root: TypeRef;
  /** Named object types, root first, then in the order they were found. */
  types: ObjectModel[];
}

/* ------------------------------------------------------------------ */
/* Inference                                                           */
/* ------------------------------------------------------------------ */

type Shape =
  | { k: "string" | "integer" | "number" | "boolean" | "null" | "empty" }
  | { k: "array"; item: Shape }
  | { k: "object"; fields: Map<string, { shape: Shape; optional: boolean }> }
  | { k: "union"; members: Shape[] };

const shapeOf = (value: unknown): Shape => {
  if (value === null || value === undefined) return { k: "null" };
  if (typeof value === "string") return { k: "string" };
  if (typeof value === "boolean") return { k: "boolean" };
  if (typeof value === "number") return { k: Number.isInteger(value) ? "integer" : "number" };
  if (Array.isArray(value)) {
    return { k: "array", item: value.reduce<Shape>((acc, item) => mergeShapes(acc, shapeOf(item)), { k: "empty" }) };
  }
  const fields = new Map<string, { shape: Shape; optional: boolean }>();
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    fields.set(key, { shape: shapeOf(child), optional: false });
  }
  return { k: "object", fields };
};

const sameFamily = (a: Shape, b: Shape) =>
  a.k === b.k || ((a.k === "integer" || a.k === "number") && (b.k === "integer" || b.k === "number"));

/** Merges two shapes of the same family: int with float, object with object, array with array. */
const mergeSame = (a: Shape, b: Shape): Shape => {
  if (a.k === "array" && b.k === "array") return { k: "array", item: mergeShapes(a.item, b.item) };
  if (a.k === "object" && b.k === "object") {
    const fields = new Map<string, { shape: Shape; optional: boolean }>();
    for (const [key, field] of a.fields) {
      const other = b.fields.get(key);
      fields.set(key, other
        ? { shape: mergeShapes(field.shape, other.shape), optional: field.optional || other.optional }
        : { shape: field.shape, optional: true });
    }
    for (const [key, field] of b.fields) {
      if (!fields.has(key)) fields.set(key, { shape: field.shape, optional: true });
    }
    return { k: "object", fields };
  }
  if (a.k !== b.k) return { k: "number" };
  return a;
};

const mergeShapes = (a: Shape, b: Shape): Shape => {
  if (a.k === "empty") return b;
  if (b.k === "empty") return a;
  const members = a.k === "union" ? [...a.members] : [a];
  for (const next of b.k === "union" ? b.members : [b]) {
    const index = members.findIndex((m) => sameFamily(m, next));
    if (index === -1) members.push(next);
    else members[index] = mergeSame(members[index], next);
  }
  return members.length === 1 ? members[0] : { k: "union", members };
};

/** A canonical string for a shape, so structurally identical objects share one type. */
const signature = (shape: Shape): string => {
  switch (shape.k) {
    case "array":
      return `[${signature(shape.item)}]`;
    case "object":
      return `{${[...shape.fields.keys()].sort().map((key) => {
        const field = shape.fields.get(key)!;
        return `${JSON.stringify(key)}${field.optional ? "?" : ""}:${signature(field.shape)}`;
      }).join(",")}}`;
    case "union":
      return `(${shape.members.map(signature).sort().join("|")})`;
    default:
      return shape.k;
  }
};

const INITIALISMS = new Set(["id", "url", "uri", "api", "http", "https", "json", "xml", "html", "sql", "uuid", "ip", "css", "ui"]);

/** Splits a key into words on separators and camelCase boundaries. */
export const splitWords = (key: string): string[] =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export const toPascalCase = (key: string, initialisms = false) =>
  splitWords(key).map((w) => (initialisms && INITIALISMS.has(w.toLowerCase()) ? w.toUpperCase() : capitalize(w))).join("");

export const toCamelCase = (key: string) => {
  const words = splitWords(key);
  if (words.length === 0) return "";
  return words[0].toLowerCase() + words.slice(1).map(capitalize).join("");
};

export const toSnakeCase = (key: string) => splitWords(key).map((w) => w.toLowerCase()).join("_");

const singular = (name: string) => {
  if (/ies$/.test(name) && name.length > 4) return `${name.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(name)) return name;
  if (/(ches|shes|xes|zes|sses)$/.test(name)) return name.slice(0, -2);
  if (/s$/.test(name) && name.length > 1) return name.slice(0, -1);
  return name;
};

/** Type names that clash with a built-in type or keyword in one of the target languages. */
const RESERVED_TYPE_NAMES = new Set([
  "Any", "Array", "Boolean", "Bool", "BaseModel", "Codable", "Data", "Date", "Double", "Error", "False", "Field",
  "Float", "Int", "JsonElement", "List", "Long", "Map", "None", "Number", "Object", "Option", "Optional", "Record",
  "Result", "Self", "SerialName", "Serializable", "Set", "String", "True", "Type", "Union", "Unit", "Value", "Vec",
]);

const typeNameFrom = (hint: string) => {
  let name = toPascalCase(hint) || "Item";
  if (/^\d/.test(name)) name = `T${name}`;
  if (RESERVED_TYPE_NAMES.has(name)) name = `${name}Type`;
  return name;
};

/** Walks a JSON value once and builds the shared type model. */
export function inferModel(value: unknown, rootName = "Root"): CodeModel {
  const root = typeNameFrom(rootName) || "Root";
  const types: ObjectModel[] = [];
  const bySignature = new Map<string, string>();
  const used = new Set<string>();

  const claim = (hint: string) => {
    const base = typeNameFrom(hint);
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}${n}`;
    used.add(name);
    return name;
  };

  const toRef = (shape: Shape, hint: string): TypeRef => {
    const members = shape.k === "union" ? shape.members : [shape];
    const nullable = members.some((m) => m.k === "null");
    const rest = members.filter((m) => m.k !== "null" && m.k !== "empty");
    if (rest.length === 0) {
      return { kind: "unknown", reason: members.some((m) => m.k === "null") ? "null" : "empty-array", nullable };
    }
    if (rest.length > 1) return { kind: "union", members: rest.map((m) => single(m, hint)), nullable };
    return { ...single(rest[0], hint), nullable };
  };

  const single = (shape: Shape, hint: string): TypeRef => {
    switch (shape.k) {
      case "array":
        return { kind: "array", items: toRef(shape.item, singular(hint)), nullable: false };
      case "object": {
        const sig = signature(shape);
        const existing = bySignature.get(sig);
        if (existing) return { kind: "object", name: existing, nullable: false };
        const name = claim(hint);
        bySignature.set(sig, name);
        const model: ObjectModel = { name, fields: [] };
        types.push(model);
        for (const [key, field] of shape.fields) {
          model.fields.push({ key, optional: field.optional, type: toRef(field.shape, key) });
        }
        return { kind: "object", name, nullable: false };
      }
      case "string":
      case "integer":
      case "number":
      case "boolean":
        return { kind: shape.k, nullable: false };
      default:
        return { kind: "unknown", reason: "empty-array", nullable: false };
    }
  };

  const shape = shapeOf(value);
  const rootIsObject = shape.k === "object";
  // An object root takes the root name. Any other root is an alias, so its items get "<Root>Item".
  if (!rootIsObject) used.add(root);
  const ref = toRef(shape, rootIsObject ? root : `${root}Item`);
  return { rootName: root, root: ref, types };
}

/* ------------------------------------------------------------------ */
/* JSON parsing                                                        */
/* ------------------------------------------------------------------ */

/** Invalid JSON input, with a 1-based line and column when the parser reports one. */
export class JsonInputError extends Error {
  constructor(message: string, readonly line?: number, readonly column?: number) {
    super(message);
    this.name = "JsonInputError";
  }
}

const errorPosition = (input: string, message: string) => {
  const lineCol = /line (\d+) column (\d+)/.exec(message);
  if (lineCol) return { line: Number(lineCol[1]), column: Number(lineCol[2]) };
  const pos = /position (\d+)/.exec(message);
  if (!pos) return {};
  const lines = input.slice(0, Number(pos[1])).split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
};

/** Parses JSON. Throws a JsonInputError whose message starts with "Line L, column C:" when the position is known. */
export function parseJsonInput(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Check the syntax.";
    const { line, column } = errorPosition(input, raw);
    const text = `Invalid JSON. ${raw.replace(/\s*\(line \d+ column \d+\)/, "").replace(/ in JSON at position \d+.*$/, "")}`;
    throw new JsonInputError(line ? `Line ${line}, column ${column ?? 1}: ${text}` : text, line, column);
  }
}

/* ------------------------------------------------------------------ */
/* Shared emitter helpers                                              */
/* ------------------------------------------------------------------ */

const findUnknown = (ref: TypeRef): UnknownReason | undefined => {
  if (ref.kind === "unknown") return ref.reason;
  if (ref.kind === "array") return findUnknown(ref.items);
  return undefined;
};

/** A comment for fields whose type the sample could not show. */
const unknownNote = (ref: TypeRef) => {
  if (ref.kind === "union") return "The sample has values of different types.";
  const reason = findUnknown(ref);
  if (reason === "empty-array") return "The sample array is empty, so the element type is unknown.";
  if (reason === "null") return "The sample value is null, so the type is unknown.";
  return undefined;
};

/** Gives each field a unique identifier within its type. */
const uniqueNames = (fields: FieldModel[], name: (key: string) => string) => {
  const used = new Set<string>();
  return fields.map((field) => {
    const base = name(field.key);
    let candidate = base;
    for (let n = 2; used.has(candidate); n++) candidate = `${base}${n}`;
    used.add(candidate);
    return candidate;
  });
};

const identifierOr = (name: string, fallback: string) => {
  if (!name) return fallback;
  return /^\d/.test(name) ? `_${name}` : name;
};

/** Root alias, for roots that are not objects. */
const rootAlias = (model: CodeModel) => (model.root.kind === "object" && model.root.name === model.rootName ? undefined : model.root);

/* ------------------------------------------------------------------ */
/* TypeScript                                                          */
/* ------------------------------------------------------------------ */

const TS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const tsType = (ref: TypeRef): string => {
  let base: string;
  switch (ref.kind) {
    case "string":
    case "boolean":
      base = ref.kind;
      break;
    case "integer":
    case "number":
      base = "number";
      break;
    case "unknown":
      return "unknown";
    case "object":
      base = ref.name;
      break;
    case "array": {
      const inner = tsType(ref.items);
      base = inner.includes(" ") ? `(${inner})[]` : `${inner}[]`;
      break;
    }
    case "union":
      base = ref.members.map(tsType).join(" | ");
      break;
  }
  return ref.nullable ? `${base} | null` : base;
};

const emitTypeScript = (model: CodeModel, options: CodeOptions) => {
  const asType = options.tsStyle === "type";
  const readonly = options.tsReadonly ? "readonly " : "";
  const blocks: string[] = [];
  const alias = rootAlias(model);
  if (alias) blocks.push(`export type ${model.rootName} = ${tsType(alias)};`);
  for (const type of model.types) {
    const lines = type.fields.map((field) => {
      const key = TS_IDENTIFIER.test(field.key) ? field.key : JSON.stringify(field.key);
      const note = unknownNote(field.type);
      const line = `  ${readonly}${key}${field.optional ? "?" : ""}: ${tsType(field.type)};`;
      return note ? `  // ${note}\n${line}` : line;
    });
    const body = lines.length ? `{\n${lines.join("\n")}\n}` : "{}";
    blocks.push(asType ? `export type ${type.name} = ${body};` : `export interface ${type.name} ${body}`);
  }
  return blocks.join("\n\n");
};

/* ------------------------------------------------------------------ */
/* Go                                                                  */
/* ------------------------------------------------------------------ */

const goType = (ref: TypeRef, pointer = ref.nullable): string => {
  let base: string;
  switch (ref.kind) {
    case "string":
      base = "string";
      break;
    case "integer":
      base = "int64";
      break;
    case "number":
      base = "float64";
      break;
    case "boolean":
      base = "bool";
      break;
    case "object":
      base = ref.name;
      break;
    case "array":
      return `[]${goType(ref.items)}`;
    default:
      return "any";
  }
  return pointer ? `*${base}` : base;
};

const goTag = (key: string, optional: boolean) =>
  `\`json:"${key.replace(/[\\"`]/g, (c) => `\\${c}`)}${optional ? ",omitempty" : ""}"\``;

const emitGo = (model: CodeModel) => {
  const blocks: string[] = [];
  const alias = rootAlias(model);
  if (alias) blocks.push(`type ${model.rootName} ${goType(alias)}`);
  for (const type of model.types) {
    const names = uniqueNames(type.fields, (key) => {
      const name = toPascalCase(key, true);
      if (!name) return "Field";
      return /^\d/.test(name) ? `X${name}` : name;
    });
    const rows = type.fields.map((field, i) => ({
      name: names[i],
      type: goType(field.type, field.type.nullable || field.optional),
      tag: goTag(field.key, field.optional),
      note: unknownNote(field.type),
    }));
    const nameWidth = Math.max(0, ...rows.map((r) => r.name.length));
    const typeWidth = Math.max(0, ...rows.map((r) => r.type.length));
    const lines = rows.map((r) => {
      const line = `\t${r.name.padEnd(nameWidth)} ${r.type.padEnd(typeWidth)} ${r.tag}`;
      return r.note ? `\t// ${r.note}\n${line}` : line;
    });
    blocks.push(lines.length ? `type ${type.name} struct {\n${lines.join("\n")}\n}` : `type ${type.name} struct{}`);
  }
  return blocks.join("\n\n");
};

/* ------------------------------------------------------------------ */
/* Rust                                                                */
/* ------------------------------------------------------------------ */

const RUST_KEYWORDS = new Set([
  "as", "async", "await", "break", "const", "continue", "dyn", "else", "enum", "extern", "false", "fn", "for", "if",
  "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return", "static", "struct", "trait",
  "true", "type", "unsafe", "use", "where", "while", "abstract", "become", "box", "do", "final", "macro", "override",
  "priv", "try", "typeof", "unsized", "virtual", "yield", "gen",
]);
/** Keywords that cannot be raw identifiers. */
const RUST_NO_RAW = new Set(["self", "super", "crate", "_"]);

const rustType = (ref: TypeRef, option = ref.nullable): string => {
  let base: string;
  switch (ref.kind) {
    case "string":
      base = "String";
      break;
    case "integer":
      base = "i64";
      break;
    case "number":
      base = "f64";
      break;
    case "boolean":
      base = "bool";
      break;
    case "object":
      base = ref.name;
      break;
    case "array":
      base = `Vec<${rustType(ref.items)}>`;
      break;
    default:
      base = "serde_json::Value";
  }
  return option ? `Option<${base}>` : base;
};

const rustField = (key: string) => {
  const snake = identifierOr(toSnakeCase(key), "field");
  if (RUST_NO_RAW.has(snake)) return `${snake}_`;
  return RUST_KEYWORDS.has(snake) ? `r#${snake}` : snake;
};

const emitRust = (model: CodeModel) => {
  const blocks: string[] = ["use serde::{Deserialize, Serialize};"];
  const alias = rootAlias(model);
  if (alias) blocks.push(`pub type ${model.rootName} = ${rustType(alias)};`);
  for (const type of model.types) {
    const names = uniqueNames(type.fields, rustField);
    const lines = type.fields.map((field, i) => {
      const out: string[] = [];
      const note = unknownNote(field.type);
      if (note) out.push(`    // ${note}`);
      // serde strips the r# prefix, so a raw identifier needs no rename.
      if (names[i].replace(/^r#/, "") !== field.key) out.push(`    #[serde(rename = ${JSON.stringify(field.key)})]`);
      if (field.optional) out.push(`    #[serde(default, skip_serializing_if = "Option::is_none")]`);
      out.push(`    pub ${names[i]}: ${rustType(field.type, field.type.nullable || field.optional)},`);
      return out.join("\n");
    });
    const derive = "#[derive(Debug, Clone, Serialize, Deserialize)]";
    blocks.push(lines.length ? `${derive}\npub struct ${type.name} {\n${lines.join("\n")}\n}` : `${derive}\npub struct ${type.name} {}`);
  }
  return blocks.join("\n\n");
};

/* ------------------------------------------------------------------ */
/* Python                                                              */
/* ------------------------------------------------------------------ */

const PYTHON_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif",
  "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or",
  "pass", "raise", "return", "try", "while", "with", "yield",
]);

const pythonType = (ref: TypeRef, imports: Set<string>, optional = ref.nullable): string => {
  let base: string;
  switch (ref.kind) {
    case "string":
      base = "str";
      break;
    case "integer":
      base = "int";
      break;
    case "number":
      base = "float";
      break;
    case "boolean":
      base = "bool";
      break;
    case "object":
      base = ref.name;
      break;
    case "array":
      imports.add("List");
      base = `List[${pythonType(ref.items, imports)}]`;
      break;
    case "union":
      imports.add("Union");
      base = `Union[${ref.members.map((m) => pythonType(m, imports)).join(", ")}]`;
      break;
    default:
      imports.add("Any");
      return "Any";
  }
  if (!optional) return base;
  imports.add("Optional");
  return `Optional[${base}]`;
};

/** Orders types so each one comes after the types it uses. */
const dependencyOrder = (model: CodeModel) => {
  const byName = new Map(model.types.map((t) => [t.name, t]));
  const done = new Set<string>();
  const order: ObjectModel[] = [];
  const refs = (ref: TypeRef): string[] =>
    ref.kind === "object" ? [ref.name] : ref.kind === "array" ? refs(ref.items) : ref.kind === "union" ? ref.members.flatMap(refs) : [];
  const visit = (type: ObjectModel) => {
    if (done.has(type.name)) return;
    done.add(type.name);
    for (const field of type.fields) for (const name of refs(field.type)) visit(byName.get(name)!);
    order.push(type);
  };
  model.types.forEach(visit);
  return order;
};

const emitPython = (model: CodeModel, options: CodeOptions) => {
  const pydantic = options.pythonStyle === "pydantic";
  const imports = new Set<string>();
  const pydanticImports = new Set(["BaseModel"]);
  const blocks: string[] = [];
  for (const type of dependencyOrder(model)) {
    const names = uniqueNames(type.fields, (key) => {
      const snake = identifierOr(toSnakeCase(key), "field");
      return PYTHON_KEYWORDS.has(snake) ? `${snake}_` : snake;
    });
    // Fields with a default must come after fields without one.
    const order = type.fields.map((field, i) => ({ field, name: names[i] }));
    order.sort((a, b) => Number(a.field.optional) - Number(b.field.optional));
    let aliased = false;
    const lines = order.map(({ field, name }) => {
      const out: string[] = [];
      const note = unknownNote(field.type);
      if (note) out.push(`    # ${note}`);
      const annotation = pythonType(field.type, imports, field.type.nullable || field.optional);
      const renamed = name !== field.key;
      if (pydantic && renamed) {
        aliased = true;
        pydanticImports.add("Field");
        const args = field.optional ? `default=None, alias=${JSON.stringify(field.key)}` : `alias=${JSON.stringify(field.key)}`;
        out.push(`    ${name}: ${annotation} = Field(${args})`);
      } else {
        if (!pydantic && renamed) out.push(`    # JSON key: ${JSON.stringify(field.key)}`);
        out.push(`    ${name}: ${annotation}${field.optional ? " = None" : ""}`);
      }
      return out.join("\n");
    });
    if (pydantic && aliased) {
      pydanticImports.add("ConfigDict");
      lines.unshift("    model_config = ConfigDict(populate_by_name=True)\n");
    }
    const head = pydantic ? `class ${type.name}(BaseModel):` : `@dataclass\nclass ${type.name}:`;
    blocks.push(`${head}\n${lines.length ? lines.join("\n") : "    pass"}`);
  }
  const alias = rootAlias(model);
  if (alias) blocks.push(`${model.rootName} = ${pythonType(alias, imports)}`);

  const header: string[] = [];
  if (!pydantic && model.types.length) header.push("from dataclasses import dataclass");
  if (imports.size) header.push(`from typing import ${[...imports].sort().join(", ")}`);
  if (pydantic && model.types.length) header.push(`from pydantic import ${[...pydanticImports].sort().join(", ")}`);
  return [...(header.length ? [header.join("\n")] : []), ...blocks].join("\n\n\n");
};

/* ------------------------------------------------------------------ */
/* Swift                                                               */
/* ------------------------------------------------------------------ */

const SWIFT_KEYWORDS = new Set([
  "associatedtype", "class", "deinit", "enum", "extension", "fileprivate", "func", "import", "init", "inout",
  "internal", "let", "open", "operator", "private", "protocol", "public", "rethrows", "static", "struct", "subscript",
  "typealias", "var", "break", "case", "continue", "default", "defer", "do", "else", "fallthrough", "for", "guard", "if",
  "in", "repeat", "return", "switch", "where", "while", "as", "catch", "false", "is", "nil", "self", "super", "throw",
  "throws", "true", "try", "Any", "Self", "Type", "Protocol",
]);

const swiftType = (ref: TypeRef, optional = ref.nullable): string => {
  let base: string;
  switch (ref.kind) {
    case "integer":
      base = "Int";
      break;
    case "number":
      base = "Double";
      break;
    case "boolean":
      base = "Bool";
      break;
    case "object":
      base = ref.name;
      break;
    case "array":
      base = `[${swiftType(ref.items)}]`;
      break;
    // Swift has no built-in type for any JSON value. String keeps the struct Codable.
    default:
      base = "String";
  }
  return optional ? `${base}?` : base;
};

const swiftName = (key: string) => {
  const camel = identifierOr(toCamelCase(key), "field");
  return SWIFT_KEYWORDS.has(camel) ? `\`${camel}\`` : camel;
};

const emitSwift = (model: CodeModel) => {
  const blocks: string[] = ["import Foundation"];
  const alias = rootAlias(model);
  if (alias) blocks.push(`typealias ${model.rootName} = ${swiftType(alias)}`);
  for (const type of model.types) {
    const names = uniqueNames(type.fields, swiftName);
    const lines = type.fields.map((field, i) => {
      const note = unknownNote(field.type);
      const line = `    let ${names[i]}: ${swiftType(field.type, field.type.nullable || field.optional)}`;
      return note ? `    // ${note} Replace String with the real type.\n${line}` : line;
    });
    const renamed = type.fields.some((field, i) => names[i].replace(/`/g, "") !== field.key);
    if (renamed) {
      const cases = type.fields.map((field, i) =>
        names[i].replace(/`/g, "") === field.key ? `        case ${names[i]}` : `        case ${names[i]} = ${JSON.stringify(field.key)}`);
      lines.push("", "    enum CodingKeys: String, CodingKey {", ...cases, "    }");
    }
    blocks.push(lines.length ? `struct ${type.name}: Codable {\n${lines.join("\n")}\n}` : `struct ${type.name}: Codable {}`);
  }
  return blocks.join("\n\n");
};

/* ------------------------------------------------------------------ */
/* Kotlin                                                              */
/* ------------------------------------------------------------------ */

const KOTLIN_KEYWORDS = new Set([
  "as", "break", "class", "continue", "do", "else", "false", "for", "fun", "if", "in", "interface", "is", "null",
  "object", "package", "return", "super", "this", "throw", "true", "try", "typealias", "typeof", "val", "var", "when",
  "while",
]);

const kotlinType = (ref: TypeRef, uses: Set<string>, optional = ref.nullable): string => {
  let base: string;
  switch (ref.kind) {
    case "string":
      base = "String";
      break;
    case "integer":
      base = "Long";
      break;
    case "number":
      base = "Double";
      break;
    case "boolean":
      base = "Boolean";
      break;
    case "object":
      base = ref.name;
      break;
    case "array":
      base = `List<${kotlinType(ref.items, uses)}>`;
      break;
    default:
      uses.add("JsonElement");
      base = "JsonElement";
  }
  return optional ? `${base}?` : base;
};

const kotlinString = (value: string) => JSON.stringify(value).replace(/\$/g, "\\$");

const emitKotlin = (model: CodeModel) => {
  const uses = new Set<string>();
  let serialName = false;
  const blocks: string[] = [];
  const alias = rootAlias(model);
  if (alias) blocks.push(`typealias ${model.rootName} = ${kotlinType(alias, uses)}`);
  for (const type of model.types) {
    const names = uniqueNames(type.fields, (key) => {
      const camel = identifierOr(toCamelCase(key), "field");
      return KOTLIN_KEYWORDS.has(camel) ? `\`${camel}\`` : camel;
    });
    const lines = type.fields.map((field, i) => {
      const out: string[] = [];
      const note = unknownNote(field.type);
      if (note) out.push(`    // ${note}`);
      if (names[i].replace(/`/g, "") !== field.key) {
        serialName = true;
        out.push(`    @SerialName(${kotlinString(field.key)})`);
      }
      const typeText = kotlinType(field.type, uses, field.type.nullable || field.optional);
      out.push(`    val ${names[i]}: ${typeText}${field.optional ? " = null" : ""},`);
      return out.join("\n");
    });
    blocks.push(lines.length ? `@Serializable\ndata class ${type.name}(\n${lines.join("\n")}\n)` : `@Serializable\nclass ${type.name}`);
  }
  const imports: string[] = [];
  if (serialName) imports.push("import kotlinx.serialization.SerialName");
  if (model.types.length) imports.push("import kotlinx.serialization.Serializable");
  if (uses.has("JsonElement")) imports.push("import kotlinx.serialization.json.JsonElement");
  return [...(imports.length ? [imports.join("\n")] : []), ...blocks].join("\n\n");
};

/* ------------------------------------------------------------------ */
/* JSON Schema                                                         */
/* ------------------------------------------------------------------ */

type Schema = Record<string, unknown>;

const PRIMITIVE_SCHEMA: Record<string, string> = { string: "string", integer: "integer", number: "number", boolean: "boolean" };

const schemaOf = (ref: TypeRef): Schema => {
  switch (ref.kind) {
    case "unknown":
      return { $comment: unknownNote(ref) };
    case "object": {
      const target = { $ref: `#/$defs/${ref.name}` };
      return ref.nullable ? { anyOf: [target, { type: "null" }] } : target;
    }
    case "union": {
      const members = ref.members.map(schemaOf);
      return { anyOf: ref.nullable ? [...members, { type: "null" }] : members };
    }
    case "array": {
      const items = schemaOf(ref.items);
      return { type: ref.nullable ? ["array", "null"] : "array", items };
    }
    default:
      return { type: ref.nullable ? [PRIMITIVE_SCHEMA[ref.kind], "null"] : PRIMITIVE_SCHEMA[ref.kind] };
  }
};

const objectSchema = (type: ObjectModel): Schema => {
  const properties: Schema = {};
  for (const field of type.fields) properties[field.key] = schemaOf(field.type);
  const required = type.fields.filter((f) => !f.optional).map((f) => f.key);
  return { type: "object", properties, ...(required.length ? { required } : {}) };
};

const emitJsonSchema = (model: CodeModel) => {
  const alias = rootAlias(model);
  const defs: Schema = {};
  for (const type of model.types) {
    if (!alias && type.name === model.rootName) continue;
    defs[type.name] = objectSchema(type);
  }
  const body = alias ? schemaOf(alias) : objectSchema(model.types[0]);
  const schema: Schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: model.rootName,
    ...body,
    ...(Object.keys(defs).length ? { $defs: defs } : {}),
  };
  return JSON.stringify(schema, null, 2);
};

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export interface CodeResult {
  output: string;
  /** Number of declarations: named object types plus a root alias when the root is not an object. */
  typeCount: number;
}

/** Emits code for a model in one language. */
export function emitCode(model: CodeModel, language: CodeLanguage, options: CodeOptions = {}): string {
  switch (language) {
    case "typescript":
      return emitTypeScript(model, options);
    case "go":
      return emitGo(model);
    case "rust":
      return emitRust(model);
    case "python":
      return emitPython(model, options);
    case "swift":
      return emitSwift(model);
    case "kotlin":
      return emitKotlin(model);
    case "json-schema":
      return emitJsonSchema(model);
  }
}

/** Parses JSON text and emits types for it. Throws JsonInputError for invalid JSON. */
export function jsonToCode(input: string, language: CodeLanguage, options: CodeOptions = {}): CodeResult {
  if (!input.trim()) return { output: "", typeCount: 0 };
  const model = inferModel(parseJsonInput(input), options.rootName?.trim() || "Root");
  const output = emitCode(model, language, options);
  return { output, typeCount: model.types.length + (rootAlias(model) ? 1 : 0) };
}
