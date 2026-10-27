import { errorAt, setOwn } from "./conversion-error";

const LEADING_SPACE = /^[ \t\f]+/;
const UNESCAPES: Record<string, string> = { t: "\t", n: "\n", r: "\r", f: "\f" };

/** A line continues when it ends with an odd number of backslashes. */
const continues = (line: string) => {
  let count = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === "\\"; i--) count++;
  return count % 2 === 1;
};

const unescape = (text: string, line: number) => {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = text[++i];
    if (next === undefined) break;
    if (next === "u") {
      const hex = text.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw errorAt("Invalid \\u escape. Use four hex digits, for example \\u00e9.", line);
      out += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else {
      out += UNESCAPES[next] ?? next;
    }
  }
  return out;
};

const parseLogicalLine = (text: string, line: number): [string, string] => {
  let keyEnd = text.length;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\\") i++;
    else if (char === "=" || char === ":" || char === " " || char === "\t" || char === "\f") {
      keyEnd = i;
      break;
    }
  }
  let valueStart = keyEnd;
  while (valueStart < text.length && /[ \t\f]/.test(text[valueStart])) valueStart++;
  if (text[valueStart] === "=" || text[valueStart] === ":") valueStart++;
  while (valueStart < text.length && /[ \t\f]/.test(text[valueStart])) valueStart++;
  return [unescape(text.slice(0, keyEnd), line), unescape(text.slice(valueStart), line)];
};

/**
 * Parses a Java .properties file into key and value pairs in file order. Follows the
 * java.util.Properties rules: `=`, `:`, or whitespace separators, `#` and `!` comments,
 * backslash line continuations, and \t \n \r \f \uXXXX escapes. A repeated key keeps its last value.
 */
export function parseProperties(input: string): [string, string][] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const pairs = new Map<string, string>();
  let i = 0;
  while (i < lines.length) {
    const startLine = i + 1;
    let logical = lines[i++].replace(LEADING_SPACE, "");
    if (!logical || logical[0] === "#" || logical[0] === "!") continue;
    while (continues(logical)) {
      logical = logical.slice(0, -1) + (i < lines.length ? lines[i++].replace(LEADING_SPACE, "") : "");
    }
    const [key, value] = parseLogicalLine(logical, startLine);
    pairs.set(key, value);
  }
  return [...pairs];
}

/** Splits "app.users[0].name" into ["app", "users", 0, "name"]. Returns null for a key with an empty part. */
const keyPath = (key: string): (string | number)[] | null => {
  const path: (string | number)[] = [];
  for (const segment of key.split(".")) {
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(segment);
    if (!match || (!match[1] && (!match[2] || path.length === 0))) return null;
    if (match[1]) path.push(match[1]);
    for (const index of match[2].matchAll(/\[(\d+)\]/g)) path.push(Number(index[1]));
  }
  return path;
};

/** Joins a path the Spring Boot way: names with dots, list indexes in brackets. */
export function propertiesKey(path: readonly (string | number)[]): string {
  return path.reduce<string>((key, part) => (typeof part === "number" ? `${key}[${part}]` : key ? `${key}.${part}` : part), "");
}

const own = (node: object, key: string | number): unknown =>
  Object.prototype.hasOwnProperty.call(node, key) ? (node as Record<string | number, unknown>)[key] : undefined;

/** Removes the gaps that indexes such as [0] and [2] leave in an array. */
const compact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.filter(() => true).map(compact);
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) setOwn(value, key, compact((value as Record<string, unknown>)[key]));
  }
  return value;
};

/**
 * Turns flat dot keys into nested objects, and [n] indexes into arrays, the way Spring Boot
 * reads application.properties. Throws when a key holds a value and also has nested keys.
 */
export function expandKeys(entries: readonly (readonly [string, string])[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    const path = keyPath(key) ?? [key];
    let node: object = root;
    path.forEach((part, index) => {
      const existing = own(node, part);
      if (index === path.length - 1) {
        if (existing !== undefined && typeof existing === "object") {
          throw errorAt(`Key "${key}" conflicts with the keys under "${key}.". A key cannot hold both a value and nested keys.`);
        }
        setOwn(node, part, value);
        return;
      }
      const wantArray = typeof path[index + 1] === "number";
      if (existing === undefined) {
        const child = wantArray ? [] : {};
        setOwn(node, part, child);
        node = child;
      } else if (typeof existing !== "object" || existing === null || Array.isArray(existing) !== wantArray) {
        throw errorAt(`Key "${key}" conflicts with "${propertiesKey(path.slice(0, index + 1))}". A key cannot hold both a value and nested keys.`);
      } else {
        node = existing;
      }
    });
  }
  return compact(root) as Record<string, unknown>;
}

const escapeChar = (char: string) => {
  switch (char) {
    case "\\":
      return "\\\\";
    case "\t":
      return "\\t";
    case "\n":
      return "\\n";
    case "\r":
      return "\\r";
    case "\f":
      return "\\f";
  }
  const code = char.charCodeAt(0);
  // Java reads .properties files as ISO-8859-1 by default, so anything outside ASCII becomes \uXXXX.
  return code < 0x20 || code > 0x7e ? `\\u${code.toString(16).padStart(4, "0")}` : char;
};

// Index by UTF-16 unit so a character outside the BMP becomes two \u escapes, as Java expects.
const escapeText = (text: string, specials = "") => {
  let out = "";
  for (let i = 0; i < text.length; i++) out += specials.includes(text[i]) ? `\\${text[i]}` : escapeChar(text[i]);
  return out;
};

/** Writes key=value lines with the escapes that java.util.Properties reads back. */
export function formatProperties(entries: readonly (readonly [string, string])[]): string {
  const lines = entries.map(([key, value]) => `${escapeText(key, " =:#!")}=${escapeText(value).replace(/^ /, "\\ ")}`);
  return lines.join("\n") + (lines.length ? "\n" : "");
}
