/**
 * JSON Viewer utility functions
 */

import { LosslessNumber } from './json-repair';

export interface JsonNode {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  depth: number;
  children?: JsonNode[];
  size?: number; // For objects/arrays
}

export interface JsonParseResult {
  success: boolean;
  data?: any;
  error?: string;
  tree?: JsonNode;
}

/**
 * Parse JSON string
 */
export function parseJson(input: string): JsonParseResult {
  try {
    const data = JSON.parse(input);
    const tree = buildJsonTree(data, '', 0);
    return { success: true, data, tree };
  } catch (error) {
    return {
      success: false,
      error: `Invalid JSON: ${(error as Error).message}`,
    };
  }
}

/**
 * Build tree structure from JSON data
 */
function buildJsonTree(data: any, key: string, depth: number): JsonNode {
  const type = getJsonType(data);

  const node: JsonNode = {
    key,
    value: data,
    type,
    depth,
  };

  if (type === 'object' && isContainer(data)) {
    const children: JsonNode[] = [];
    let size = 0;

    for (const [k, v] of Object.entries(data)) {
      children.push(buildJsonTree(v, k, depth + 1));
      size++;
    }

    node.children = children;
    node.size = size;
  } else if (type === 'array') {
    const children: JsonNode[] = [];

    for (let i = 0; i < data.length; i++) {
      children.push(buildJsonTree(data[i], i.toString(), depth + 1));
    }

    node.children = children;
    node.size = data.length;
  }

  return node;
}

/**
 * Get the type of a JSON value
 */
export function getJsonType(value: any): JsonNode['type'] {
  if (value === null) return 'null';
  if (value instanceof LosslessNumber) return 'number';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return type;
  if (type === 'object') return 'object';
  return 'null';
}

/**
 * Format JSON string with indentation
 */
export function formatJson(input: string, indent = 2): string | null {
  try {
    const data = JSON.parse(input);
    return JSON.stringify(data, null, indent);
  } catch {
    return null;
  }
}

/**
 * Minify JSON string
 */
export function minifyJson(input: string): string | null {
  try {
    const data = JSON.parse(input);
    return JSON.stringify(data);
  } catch {
    return null;
  }
}

/**
 * Sort JSON object keys
 */
export function sortJsonKeys(input: string): string | null {
  try {
    const data = JSON.parse(input);
    const sorted = sortObject(data);
    return JSON.stringify(sorted, null, 2);
  } catch {
    return null;
  }
}

/** Sort object keys in a parsed value, at every depth. */
export function sortJsonValue(value: unknown): unknown {
  return sortObject(value);
}

/**
 * Write a parsed value as JSON, like JSON.stringify, but write large numbers
 * (LosslessNumber) as their exact text. The indent is a space count or "\t".
 */
export function stringifyJson(value: unknown, indent: number | string = 0): string {
  const gap = typeof indent === 'number' ? ' '.repeat(indent) : indent;
  if (!hasLosslessNumber(value)) return JSON.stringify(value, null, gap) ?? 'null';
  const write = (node: unknown, pad: string): string => {
    if (node instanceof LosslessNumber) return node.text;
    if (node === null || typeof node !== 'object') return JSON.stringify(node) ?? 'null';
    const inner = pad + gap;
    const join = (items: string[], open: string, close: string) =>
      items.length === 0 ? open + close
        : gap ? `${open}\n${inner}${items.join(`,\n${inner}`)}\n${pad}${close}` : `${open}${items.join(',')}${close}`;
    if (Array.isArray(node)) return join(node.map((item) => write(item, inner)), '[', ']');
    const colon = gap ? ': ' : ':';
    const record = node as Record<string, unknown>;
    return join(Object.keys(record).map((key) => `${JSON.stringify(key)}${colon}${write(record[key], inner)}`), '{', '}');
  };
  return write(value, '');
}

function hasLosslessNumber(value: unknown): boolean {
  if (value instanceof LosslessNumber) return true;
  if (value === null || typeof value !== 'object') return false;
  for (const item of Object.values(value)) if (hasLosslessNumber(item)) return true;
  return false;
}

/** Type, key count, and depth of a parsed value, for the status bar. */
export function describeJsonValue(value: unknown): { type: JsonNode['type']; keys: number; depth: number } {
  let keys = 0;
  let depth = 0;
  const visit = (node: unknown, level: number) => {
    if (!isContainer(node)) return;
    const values: unknown[] = Array.isArray(node) ? node : Object.values(node as object);
    if (!Array.isArray(node)) keys += values.length;
    if (values.length) depth = Math.max(depth, level + 1);
    for (const item of values) visit(item, level + 1);
  };
  visit(value, 0);
  return { type: getJsonType(value), keys, depth };
}

/**
 * Recursively sort object keys
 */
function sortObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }

  if (isContainer(obj)) {
    const sorted: any = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = sortObject(obj[key]);
    }
    return sorted;
  }

  return obj;
}

/**
 * Convert JSON to XML
 */
export function jsonToXml(input: string, rootName = 'root'): string | null {
  try {
    return jsonValueToXml(JSON.parse(input), rootName);
  } catch {
    return null;
  }
}

/** Convert a parsed value to XML. */
export function jsonValueToXml(value: unknown, rootName = 'root'): string {
  return valueToXmlLines(value, rootName, true).join('\n');
}

function xmlName(name: string): string {
  let safe = name.replace(/[^A-Za-z0-9_.-]/g, '_');
  if (!safe || !/^[A-Za-z_]/.test(safe)) safe = `_${safe}`;
  return safe;
}

function isContainer(value: any): boolean {
  return value !== null && typeof value === 'object' && !(value instanceof LosslessNumber);
}

/**
 * Convert a value to indented XML lines. Arrays repeat the element name.
 * An array inside an array is wrapped and its items are named "item".
 */
function valueToXmlLines(value: any, name: string, nested = false): string[] {
  const tag = xmlName(name);
  if (Array.isArray(value)) {
    if (nested) {
      // Wrapper element holding the items.
      if (value.length === 0) return [`<${tag}/>`];
      const inner = value.flatMap((item) => valueToXmlLines(item, 'item', true));
      return [`<${tag}>`, ...inner.map((l) => `  ${l}`), `</${tag}>`];
    }
    if (value.length === 0) return [`<${tag}/>`];
    return value.flatMap((item) => valueToXmlLines(item, name, Array.isArray(item)));
  }
  if (isContainer(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return [`<${tag}/>`];
    const inner = keys.flatMap((key) => valueToXmlLines(value[key], key));
    return [`<${tag}>`, ...inner.map((l) => `  ${l}`), `</${tag}>`];
  }
  return [`<${tag}>${scalarToXml(value)}</${tag}>`];
}

function scalarToXml(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return escapeXml(value);
  return String(value);
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert JSON to YAML
 */
export function jsonToYaml(input: string): string | null {
  try {
    return yamlValue(JSON.parse(input));
  } catch {
    return null;
  }
}

/** Convert a parsed value to YAML. */
export function jsonValueToYaml(value: unknown): string {
  return yamlValue(value);
}

function yamlScalar(value: any): string {
  if (value === null) return 'null';
  if (value instanceof LosslessNumber) return value.text;
  if (Array.isArray(value)) return '[]';
  if (typeof value === 'object') return '{}';
  if (typeof value === 'string') return JSON.stringify(value); // valid YAML double-quoted string
  return String(value);
}

function yamlKey(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
}

function isFilledContainer(value: any): boolean {
  return isContainer(value) && Object.keys(value).length > 0;
}

function yamlValue(value: any): string {
  return isFilledContainer(value) ? yamlLines(value).join('\n') : yamlScalar(value);
}

function yamlLines(value: any): string[] {
  const lines: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isFilledContainer(item)) {
        const [first, ...rest] = yamlLines(item);
        lines.push(`- ${first}`, ...rest.map((l) => `  ${l}`));
      } else {
        lines.push(`- ${yamlScalar(item)}`);
      }
    }
  } else {
    for (const key of Object.keys(value)) {
      const child = value[key];
      if (isFilledContainer(child)) {
        lines.push(`${yamlKey(key)}:`, ...yamlLines(child).map((l) => `  ${l}`));
      } else {
        lines.push(`${yamlKey(key)}: ${yamlScalar(child)}`);
      }
    }
  }
  return lines;
}

const SIMPLE_KEY = /^[^.[\]'"\s]+$/;

/**
 * Get JSON path to a value
 */
export function getJsonPaths(data: any, prefix = ''): string[] {
  const paths: string[] = [];

  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const path = `${prefix}[${i}]`;
      paths.push(path);
      paths.push(...getJsonPaths(data[i], path));
    }
  } else if (isContainer(data)) {
    for (const key of Object.keys(data)) {
      const path = SIMPLE_KEY.test(key)
        ? prefix ? `${prefix}.${key}` : key
        : `${prefix}['${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;
      paths.push(path);
      paths.push(...getJsonPaths(data[key], path));
    }
  }

  return paths;
}

type PathToken = { type: 'key'; key: string } | { type: 'index'; index: number } | { type: 'wildcard' };

function tokenizePath(path: string): PathToken[] | null {
  const tokens: PathToken[] = [];
  let i = 0;
  const src = path.trim();
  if (src.startsWith('$')) i = 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '.') {
      i++;
      let key = '';
      while (i < src.length && src[i] !== '.' && src[i] !== '[') key += src[i++];
      if (!key) return null;
      tokens.push(key === '*' ? { type: 'wildcard' } : { type: 'key', key });
    } else if (ch === '[') {
      const end = src.indexOf(']', i);
      if (end === -1) return null;
      let inner = src.slice(i + 1, end);
      const quote = inner[0];
      if (quote === "'" || quote === '"') {
        // Find the closing quote, allowing the key to contain "]" or escapes.
        let j = i + 2;
        let key = '';
        while (j < src.length && src[j] !== quote) {
          if (src[j] === '\\' && j + 1 < src.length) j++;
          key += src[j++];
        }
        if (src[j] !== quote || src[j + 1] !== ']') return null;
        tokens.push({ type: 'key', key });
        i = j + 2;
        continue;
      }
      inner = inner.trim();
      if (inner === '*') tokens.push({ type: 'wildcard' });
      else if (/^\d+$/.test(inner)) tokens.push({ type: 'index', index: parseInt(inner, 10) });
      else return null;
      i = end + 1;
    } else if (i === (src.startsWith('$') ? 1 : 0)) {
      // A leading key without a dot, such as "user.name".
      let key = '';
      while (i < src.length && src[i] !== '.' && src[i] !== '[') key += src[i++];
      tokens.push(key === '*' ? { type: 'wildcard' } : { type: 'key', key });
    } else {
      return null;
    }
  }
  return tokens;
}

/**
 * Run a JSONPath-like query. Supports "$", "a.b", "a[0]", "a[0][1]",
 * "['key']" and the wildcards "[*]" and ".*". Wildcards return an array.
 */
export function runJsonQuery(
  data: any,
  path: string
): { ok: true; found: boolean; value: any } | { ok: false; error: string } {
  const tokens = tokenizePath(path);
  if (!tokens) return { ok: false, error: 'Invalid query syntax.' };

  let current: any[] = [data];
  let multiple = false;
  for (const token of tokens) {
    const next: any[] = [];
    for (const node of current) {
      if (token.type === 'wildcard') {
        if (Array.isArray(node)) next.push(...node);
        else if (isContainer(node)) next.push(...Object.values(node));
      } else if (token.type === 'index') {
        if (Array.isArray(node) && token.index < node.length) next.push(node[token.index]);
      } else if (
        isContainer(node) &&
        !Array.isArray(node) &&
        Object.prototype.hasOwnProperty.call(node, token.key)
      ) {
        next.push(node[token.key]);
      }
    }
    if (token.type === 'wildcard') multiple = true;
    current = next;
  }
  if (multiple) return { ok: true, found: true, value: current };
  return current.length ? { ok: true, found: true, value: current[0] } : { ok: true, found: false, value: null };
}

/**
 * Query JSON using JSONPath-like syntax. Returns null when nothing matches.
 */
export function queryJson(data: any, path: string): any | null {
  const result = runJsonQuery(data, path);
  return result.ok && result.found ? result.value : null;
}

/**
 * Get JSON statistics
 */
export function getJsonStats(input: string): {
  size: number;
  keys: number;
  arrays: number;
  objects: number;
  depth: number;
} | null {
  try {
    const data = JSON.parse(input);
    return {
      size: input.length,
      keys: countKeys(data),
      arrays: countArrays(data),
      objects: countObjects(data),
      depth: getDepth(data),
    };
  } catch {
    return null;
  }
}

/**
 * Count keys in JSON
 */
function countKeys(obj: any): number {
  if (Array.isArray(obj)) {
    return obj.reduce((sum, item) => sum + countKeys(item), 0);
  }
  if (obj !== null && typeof obj === 'object') {
    return (
      Object.keys(obj).length +
      Object.values(obj).reduce<number>((sum, val) => sum + countKeys(val), 0)
    );
  }
  return 0;
}

/**
 * Count arrays in JSON
 */
function countArrays(obj: any): number {
  if (Array.isArray(obj)) {
    return 1 + obj.reduce((sum, item) => sum + countArrays(item), 0);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.values(obj).reduce<number>((sum, val) => sum + countArrays(val), 0);
  }
  return 0;
}

/**
 * Count objects in JSON
 */
function countObjects(obj: any): number {
  if (Array.isArray(obj)) {
    return obj.reduce((sum, item) => sum + countObjects(item), 0);
  }
  if (obj !== null && typeof obj === 'object') {
    return (
      1 +
      Object.values(obj).reduce<number>((sum, val) => sum + countObjects(val), 0)
    );
  }
  return 0;
}

/**
 * Get depth of JSON structure
 */
function getDepth(obj: any, currentDepth = 0): number {
  if (Array.isArray(obj)) {
    if (obj.length === 0) return currentDepth;
    return Math.max(...obj.map((item) => getDepth(item, currentDepth + 1)));
  }
  if (obj !== null && typeof obj === 'object') {
    const values = Object.values(obj);
    if (values.length === 0) return currentDepth;
    return Math.max(...values.map((val) => getDepth(val, currentDepth + 1)));
  }
  return currentDepth;
}

export type JsonViewMode = 'format' | 'minify' | 'sort' | 'yaml' | 'xml' | 'query';

export type JsonView =
  | { ok: true; text: string; kind: 'json' | 'yaml' | 'xml' }
  | { ok: false; message: string };

/** Render a parsed value for the JSON Viewer output pane. The indent is a space count or "\t". */
export function renderJsonView(value: unknown, mode: JsonViewMode, indent: number | string, query = ''): JsonView {
  switch (mode) {
    case 'minify':
      return { ok: true, text: stringifyJson(value), kind: 'json' };
    case 'sort':
      return { ok: true, text: stringifyJson(sortJsonValue(value), indent), kind: 'json' };
    case 'yaml':
      return { ok: true, text: jsonValueToYaml(value), kind: 'yaml' };
    case 'xml':
      return { ok: true, text: jsonValueToXml(value), kind: 'xml' };
    case 'query': {
      if (!query.trim()) return { ok: false, message: 'Enter a query.' };
      const result = runJsonQuery(value, query);
      if (result.ok === false) return { ok: false, message: result.error };
      if (!result.found) return { ok: false, message: 'No match for this query.' };
      return { ok: true, text: stringifyJson(result.value, indent), kind: 'json' };
    }
    default:
      return { ok: true, text: stringifyJson(value, indent), kind: 'json' };
  }
}
