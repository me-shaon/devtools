/**
 * Structural JSON diff. Both sides are parsed, then compared value by value. Object key order
 * is ignored. Each change has a JSONPath for people and a JSON Pointer for the RFC 6902 patch.
 */

import { isMap, isScalar, isSeq, parseDocument as parseYamlDocument, type Node as YamlNode } from "yaml";
import { withPosition } from "./conversion-error";
import { LosslessNumber, readJson } from "./json-repair";
import { stringifyJson } from "./json";

export type DiffSide =
  | { ok: true; value: unknown; format: "json" | "yaml"; notice?: string }
  | { ok: false; error: string; line?: number; column?: number };

export type ChangeKind = "added" | "removed" | "changed" | "type";

export interface JsonChange {
  kind: ChangeKind;
  /** JSONPath, such as $.users[2].email. */
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface PatchOperation {
  op: "add" | "remove" | "replace";
  path: string;
  value?: unknown;
}

export type ArrayMode = "index" | "key";

export interface DiffOptions {
  arrayMode: ArrayMode;
  /** The id field that matches array items in "key" mode, such as "id". */
  matchKey: string;
  /** Compares arrays of primitives as sets with counts, so the item order does not matter. */
  ignoreOrder: boolean;
  /** Treats strings as equal when they differ only in whitespace. */
  ignoreWhitespace: boolean;
}

export const DEFAULT_DIFF_OPTIONS: DiffOptions = { arrayMode: "index", matchKey: "id", ignoreOrder: false, ignoreWhitespace: false };

export interface DiffResult {
  changes: JsonChange[];
  patch: PatchOperation[];
  counts: Record<ChangeKind, number>;
  /** Arrays of objects compared by index in "key" mode, because an item has no unique match key. */
  keyFallbacks: number;
}

type ValueType = "null" | "boolean" | "number" | "string" | "array" | "object";

export function valueType(value: unknown): ValueType {
  if (value === null || value === undefined) return "null";
  if (value instanceof LosslessNumber) return "number";
  if (Array.isArray(value)) return "array";
  const type = typeof value;
  if (type === "boolean" || type === "number" || type === "string") return type;
  return "object";
}

/** Converts YAML integers read as BigInt to numbers, or to LosslessNumber when a double cannot hold them. */
const fromYaml = (value: unknown): unknown => {
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : new LosslessNumber(value.toString());
  }
  if (Array.isArray(value)) return value.map(fromYaml);
  if (value !== null && typeof value === "object" && !(value instanceof LosslessNumber)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      Object.defineProperty(out, key, { value: fromYaml((value as Record<string, unknown>)[key]), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  return value;
};

const hasYamlStructure = (node: YamlNode | null | undefined) => isMap(node) || isSeq(node) || (isScalar(node) && typeof node.value !== "string");

/**
 * Reads one side of the diff. JSON and data literals go through the lenient JSON reader.
 * Text that does not start with "{" or "[" and is not JSON is read as YAML.
 */
export function parseSide(text: string): DiffSide {
  const json = readJson(text);
  if ("value" in json) return { ok: true, value: json.value, format: "json", notice: json.notice };
  const { message, line, column } = json.error;
  const jsonError = { ok: false as const, error: withPosition(message, line, column), line, column };
  if (/^\s*[[{]/.test(text)) return jsonError;
  const doc = parseYamlDocument(text, { intAsBigInt: true, prettyErrors: true });
  if (doc.errors.length) {
    const first = doc.errors[0];
    const pos = first.linePos?.[0];
    const yamlMessage = first.message.split("\n")[0].replace(/ at line \d+, column \d+:?$/, "").trim();
    return { ok: false, error: withPosition(`Invalid YAML. ${yamlMessage}`, pos?.line, pos?.col), line: pos?.line, column: pos?.col };
  }
  // A single plain word is valid YAML, but the user most likely typed broken JSON.
  if (!hasYamlStructure(doc.contents as YamlNode | null)) return jsonError;
  return { ok: true, value: fromYaml(doc.toJS({ maxAliasCount: 1000 })), format: "yaml" };
}

type Segment = string | number | { key: string; value: unknown };

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Formats path segments as JSONPath. A matched array item shows as a filter, such as [?(@.id==3)]. */
export function formatPath(segments: Segment[]): string {
  let path = "$";
  for (const segment of segments) {
    if (typeof segment === "number") path += `[${segment}]`;
    else if (typeof segment === "string") path += IDENTIFIER.test(segment) ? `.${segment}` : `[${JSON.stringify(segment)}]`;
    else path += `[?(@${IDENTIFIER.test(segment.key) ? `.${segment.key}` : `[${JSON.stringify(segment.key)}]`}==${stringifyJson(segment.value)})]`;
  }
  return path;
}

const escapePointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");

/** A text key for a primitive that keeps the type, so 1 and "1" differ and large numbers compare exactly. */
const primitiveKey = (value: unknown, ignoreWhitespace: boolean): string => {
  if (value instanceof LosslessNumber) return `n:${/^-?\d+$/.test(value.text) ? BigInt(value.text).toString() : value.text}`;
  if (typeof value === "number") return `n:${Number.isSafeInteger(value) || !Number.isInteger(value) ? String(value) : BigInt(value).toString()}`;
  if (typeof value === "string") return `s:${ignoreWhitespace ? normalizeSpace(value) : value}`;
  return `${valueType(value)}:${String(value)}`;
};

const normalizeSpace = (text: string) => text.replace(/\s+/g, " ").trim();

const isPrimitive = (value: unknown) => {
  const type = valueType(value);
  return type !== "array" && type !== "object";
};

const isRecord = (value: unknown): value is Record<string, unknown> => valueType(value) === "object";

const hasOwn = (record: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(record, key);

/** Returns the id of each item, or null when one item has no usable id or two items share one. */
const itemIds = (items: unknown[], key: string): string[] | null => {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!isRecord(item) || !hasOwn(item, key) || !isPrimitive(item[key])) return null;
    const id = primitiveKey(item[key], false);
    if (seen.has(id)) return null;
    seen.add(id);
    ids.push(id);
  }
  return ids;
};

/** Compares two parsed values and returns the changes, the counts, and an RFC 6902 patch. */
export function diffJson(left: unknown, right: unknown, options: Partial<DiffOptions> = {}): DiffResult {
  const opts = { ...DEFAULT_DIFF_OPTIONS, ...options };
  const matchKey = opts.matchKey.trim();
  const changes: JsonChange[] = [];
  const patch: PatchOperation[] = [];
  const counts: Record<ChangeKind, number> = { added: 0, removed: 0, changed: 0, type: 0 };
  let keyFallbacks = 0;

  const record = (kind: ChangeKind, segments: Segment[], oldValue?: unknown, newValue?: unknown) => {
    counts[kind]++;
    const change: JsonChange = { kind, path: formatPath(segments) };
    if (kind !== "added") change.oldValue = oldValue;
    if (kind !== "removed") change.newValue = newValue;
    changes.push(change);
  };

  const compare = (a: unknown, b: unknown, segments: Segment[], pointer: string) => {
    const typeA = valueType(a);
    const typeB = valueType(b);
    if (typeA !== typeB) {
      record("type", segments, a, b);
      patch.push({ op: "replace", path: pointer, value: b });
      return;
    }
    if (typeA === "object") return compareObjects(a as Record<string, unknown>, b as Record<string, unknown>, segments, pointer);
    if (typeA === "array") return compareArrays(a as unknown[], b as unknown[], segments, pointer);
    if (primitiveKey(a, opts.ignoreWhitespace) !== primitiveKey(b, opts.ignoreWhitespace)) {
      record("changed", segments, a, b);
      patch.push({ op: "replace", path: pointer, value: b });
    }
  };

  const compareObjects = (a: Record<string, unknown>, b: Record<string, unknown>, segments: Segment[], pointer: string) => {
    for (const key of Object.keys(a)) {
      const childPointer = `${pointer}/${escapePointer(key)}`;
      if (!hasOwn(b, key)) {
        record("removed", [...segments, key], a[key]);
        patch.push({ op: "remove", path: childPointer });
      } else {
        compare(a[key], b[key], [...segments, key], childPointer);
      }
    }
    for (const key of Object.keys(b)) {
      if (hasOwn(a, key)) continue;
      record("added", [...segments, key], undefined, b[key]);
      patch.push({ op: "add", path: `${pointer}/${escapePointer(key)}`, value: b[key] });
    }
  };

  const compareArrays = (a: unknown[], b: unknown[], segments: Segment[], pointer: string) => {
    if (opts.ignoreOrder && a.every(isPrimitive) && b.every(isPrimitive)) return compareUnordered(a, b, segments, pointer);
    if (opts.arrayMode === "key" && matchKey) {
      const idsA = itemIds(a, matchKey);
      const idsB = idsA && itemIds(b, matchKey);
      if (idsA && idsB) return compareByKey(a, b, idsA, idsB, segments, pointer);
      if (a.some(isRecord) || b.some(isRecord)) keyFallbacks++;
    }
    const shared = Math.min(a.length, b.length);
    for (let i = 0; i < shared; i++) compare(a[i], b[i], [...segments, i], `${pointer}/${i}`);
    // Remove from the end first, so each patch index is still valid when the patch is applied in order.
    for (let i = a.length - 1; i >= shared; i--) {
      record("removed", [...segments, i], a[i]);
      patch.push({ op: "remove", path: `${pointer}/${i}` });
    }
    for (let i = shared; i < b.length; i++) {
      record("added", [...segments, i], undefined, b[i]);
      patch.push({ op: "add", path: `${pointer}/${i}`, value: b[i] });
    }
  };

  const compareUnordered = (a: unknown[], b: unknown[], segments: Segment[], pointer: string) => {
    const unmatched = new Map<string, number[]>();
    a.forEach((item, index) => {
      const key = primitiveKey(item, opts.ignoreWhitespace);
      const list = unmatched.get(key);
      if (list) list.push(index);
      else unmatched.set(key, [index]);
    });
    const added: number[] = [];
    b.forEach((item, index) => {
      const list = unmatched.get(primitiveKey(item, opts.ignoreWhitespace));
      if (list?.length) list.shift();
      else added.push(index);
    });
    const removed = [...unmatched.values()].flat().sort((x, y) => x - y);
    for (const index of removed) record("removed", [...segments, index], a[index]);
    for (const index of [...removed].reverse()) patch.push({ op: "remove", path: `${pointer}/${index}` });
    for (const index of added) {
      record("added", [...segments, index], undefined, b[index]);
      patch.push({ op: "add", path: `${pointer}/-`, value: b[index] });
    }
  };

  const compareByKey = (a: unknown[], b: unknown[], idsA: string[], idsB: string[], segments: Segment[], pointer: string) => {
    const indexB = new Map(idsB.map((id, index) => [id, index]));
    const inA = new Set(idsA);
    const segmentFor = (item: unknown) => ({ key: matchKey, value: (item as Record<string, unknown>)[matchKey] });
    const removed: number[] = [];
    // Patch nested changes with the original indexes before any item is removed.
    idsA.forEach((id, index) => {
      const match = indexB.get(id);
      if (match === undefined) removed.push(index);
      else compare(a[index], b[match], [...segments, segmentFor(a[index])], `${pointer}/${index}`);
    });
    for (const index of removed) record("removed", [...segments, segmentFor(a[index])], a[index]);
    for (const index of [...removed].reverse()) patch.push({ op: "remove", path: `${pointer}/${index}` });
    idsB.forEach((id, index) => {
      if (inA.has(id)) return;
      record("added", [...segments, segmentFor(b[index])], undefined, b[index]);
      patch.push({ op: "add", path: `${pointer}/-`, value: b[index] });
    });
  };

  compare(left, right, [], "");
  return { changes, patch, counts, keyFallbacks };
}

/** A short, one-line JSON preview of a value. */
export function previewValue(value: unknown, max = 120): string {
  const text = stringifyJson(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const MARKERS: Record<ChangeKind, string> = { added: "+", removed: "-", changed: "~", type: "!" };

/** Writes the changes as plain text, one change per line. */
export function formatChanges(changes: JsonChange[]): string {
  return changes
    .map((change) => {
      const marker = MARKERS[change.kind];
      if (change.kind === "added") return `${marker} ${change.path}: ${stringifyJson(change.newValue)}`;
      if (change.kind === "removed") return `${marker} ${change.path}: ${stringifyJson(change.oldValue)}`;
      if (change.kind === "type") {
        return `${marker} ${change.path}: ${valueType(change.oldValue)} ${stringifyJson(change.oldValue)} → ${valueType(change.newValue)} ${stringifyJson(change.newValue)}`;
      }
      return `${marker} ${change.path}: ${stringifyJson(change.oldValue)} → ${stringifyJson(change.newValue)}`;
    })
    .join("\n");
}

/** Writes the patch as indented JSON. Large numbers keep their exact text. */
export function formatPatch(patch: PatchOperation[]): string {
  return stringifyJson(patch, 2);
}
