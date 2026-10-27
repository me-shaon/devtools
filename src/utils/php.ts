/**
 * PHP data conversions between serialize() strings, PHP array literals, and JSON.
 * All formats go through one ordered value model. A JavaScript object would move integer
 * keys to the front and round 64-bit integers, so JSON is read and written by hand here.
 * Every function is pure and needs no DOM.
 */

export type PhpResult = { ok: true; value: string; notice?: string } | { ok: false; error: string };

/** One array element or object property. `key` holds the decimal text when `intKey` is true. */
interface PhpEntry {
  key: string;
  intKey: boolean;
  value: PhpValue;
}

type PhpValue =
  | { type: "null" }
  | { type: "bool"; value: boolean }
  | { type: "int"; value: string } // decimal text, so 64-bit values stay exact
  | { type: "float"; value: string } // PHP float text, including INF, -INF, and NAN
  | { type: "string"; value: string }
  | { type: "array"; entries: PhpEntry[] }
  | { type: "object"; className: string; entries: PhpEntry[] }
  | { type: "custom"; className: string; data: string } // C: format from the Serializable interface
  | { type: "enum"; value: string } // "Suit:Hearts"
  | { type: "ref"; value: string };

class PhpSyntaxError extends Error {}

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;
const JSON_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;
const CANONICAL_INT = /^(0|-?[1-9]\d*)$/;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const byteLength = (text: string) => encoder.encode(text).length;
const inInt64 = (n: bigint) => n >= INT64_MIN && n <= INT64_MAX;

const run = (convert: () => string, notice?: () => string | undefined): PhpResult => {
  try {
    const value = convert();
    const message = notice?.();
    return message ? { ok: true, value, notice: message } : { ok: true, value };
  } catch (error) {
    if (error instanceof PhpSyntaxError) return { ok: false, error: error.message };
    throw error;
  }
};

/** PHP casts canonical integer strings such as "7" to integer keys, but leaves "07" and "1.5" as strings. */
const toKey = (key: PhpValue, position: () => string): { key: string; intKey: boolean } => {
  switch (key.type) {
    case "int":
      return { key: key.value, intKey: true };
    case "string":
      return CANONICAL_INT.test(key.value) && inInt64(BigInt(key.value)) ? { key: key.value, intKey: true } : { key: key.value, intKey: false };
    case "bool":
      return { key: key.value ? "1" : "0", intKey: true };
    case "null":
      return { key: "", intKey: false };
    case "float":
      if (!Number.isFinite(Number(key.value))) throw new PhpSyntaxError(`Array key ${key.value} is not valid ${position()}`);
      return { key: String(Math.trunc(Number(key.value))), intKey: true };
    default:
      throw new PhpSyntaxError(`Array keys must be strings or integers ${position()}`);
  }
};

/** Collects entries the way PHP does: a repeated key replaces the earlier value and keeps its place. */
class EntryList {
  readonly entries: PhpEntry[] = [];
  private readonly positions = new Map<string, number>();

  put(entry: PhpEntry) {
    const id = `${entry.intKey ? "i" : "s"}${entry.key}`;
    const index = this.positions.get(id);
    if (index === undefined) {
      this.positions.set(id, this.entries.length);
      this.entries.push(entry);
    } else this.entries[index] = { ...this.entries[index], value: entry.value };
  }
}

/** Private and protected property names carry a "\0Class\0" or "\0*\0" prefix. JSON keeps it so data serializes back exactly. */
const propertyName = (key: string) => key.replace(/^\0[^\0]*\0/, "");

const isList = (entries: PhpEntry[]) => entries.every((entry, index) => entry.intKey && entry.key === String(index));

/* ------------------------------------------------------------ serialize() */

const QUOTE = 0x22;
const SEMICOLON = 0x3b;
const TYPE_CHARS = new Set([..."NbidsaOCErR"].map((c) => c.charCodeAt(0)));

class SerializedReader {
  pos = 0;
  /** How many strings had a declared length that did not match their bytes. */
  repaired = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get done() {
    return this.pos >= this.bytes.length;
  }

  fail(message: string): never {
    throw new PhpSyntaxError(`${message} at byte ${this.pos}`);
  }

  expect(char: string) {
    if (this.bytes[this.pos] !== char.charCodeAt(0)) this.fail(this.done ? `Expected "${char}" but the input ended` : `Expected "${char}"`);
    this.pos++;
  }

  readUntil(char: string): string {
    const end = this.bytes.indexOf(char.charCodeAt(0), this.pos);
    if (end < 0) this.fail(`Expected "${char}" but the input ended`);
    const text = decoder.decode(this.bytes.subarray(this.pos, end));
    this.pos = end + 1;
    return text;
  }

  readInt(terminator: string): string {
    const start = this.pos;
    const text = this.readUntil(terminator);
    if (!/^[+-]?\d+$/.test(text)) {
      this.pos = start;
      this.fail("Expected an integer");
    }
    return BigInt(text).toString();
  }

  readCount(terminator: string): number {
    const count = Number(this.readInt(terminator));
    if (count < 0) this.fail("Expected a length");
    return count;
  }

  /** Reads `length` bytes, then the closing quote. */
  readQuoted(length: number): string {
    this.expect('"');
    const end = this.pos + length;
    if (end > this.bytes.length) this.fail(`Expected ${length} bytes but the input ended`);
    const text = decoder.decode(this.bytes.subarray(this.pos, end));
    this.pos = end;
    this.expect('"');
    return text;
  }

  /** True when a value or the end of an array can start at `pos`. */
  private atBoundary(pos: number) {
    if (pos >= this.bytes.length || this.bytes[pos] === 0x7d /* } */) return true;
    const next = this.bytes[pos + 1];
    return TYPE_CHARS.has(this.bytes[pos]) && (next === 0x3a /* : */ || next === SEMICOLON);
  }

  /**
   * Reads the string body of `s:length:"...";`. A search-and-replace on a database often changes
   * the text but not the length. Then the reader finds the real end at the next `";` that a value follows.
   */
  readString(length: number): string {
    this.expect('"');
    const start = this.pos;
    const end = start + length;
    if (this.bytes[end] === QUOTE && this.bytes[end + 1] === SEMICOLON) {
      this.pos = end + 2;
      return decoder.decode(this.bytes.subarray(start, end));
    }
    for (let i = start; i < this.bytes.length - 1; i++) {
      if (this.bytes[i] === QUOTE && this.bytes[i + 1] === SEMICOLON && this.atBoundary(i + 2)) {
        this.repaired++;
        this.pos = i + 2;
        return decoder.decode(this.bytes.subarray(start, i));
      }
    }
    this.pos = start;
    return this.fail(`String length ${length} does not match the text`);
  }

  readEntries(count: number): PhpEntry[] {
    const entries = new EntryList();
    for (let i = 0; i < count; i++) {
      const keyStart = this.pos;
      const key = this.readValue();
      if (key.type !== "int" && key.type !== "string") {
        this.pos = keyStart;
        this.fail("Array keys must be strings or integers");
      }
      entries.put({ ...toKey(key, () => ""), value: this.readValue() });
    }
    return entries.entries;
  }

  readValue(): PhpValue {
    if (this.done) this.fail("Expected a value but the input ended");
    const type = String.fromCharCode(this.bytes[this.pos]);
    this.pos++;
    switch (type) {
      case "N":
        this.expect(";");
        return { type: "null" };
      case "b": {
        this.expect(":");
        const start = this.pos;
        const text = this.readUntil(";");
        if (text !== "0" && text !== "1") {
          this.pos = start;
          this.fail("Expected 0 or 1");
        }
        return { type: "bool", value: text === "1" };
      }
      case "i":
        this.expect(":");
        return { type: "int", value: this.readInt(";") };
      case "d": {
        this.expect(":");
        const start = this.pos;
        const text = this.readUntil(";");
        if (!/^([+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?|-?INF|NAN)$/.test(text)) {
          this.pos = start;
          this.fail("Expected a float");
        }
        return { type: "float", value: text };
      }
      case "s": {
        this.expect(":");
        return { type: "string", value: this.readString(this.readCount(":")) };
      }
      case "a": {
        this.expect(":");
        const count = this.readCount(":");
        this.expect("{");
        const entries = this.readEntries(count);
        this.expect("}");
        return { type: "array", entries };
      }
      case "O": {
        this.expect(":");
        const className = this.readQuoted(this.readCount(":"));
        this.expect(":");
        const count = this.readCount(":");
        this.expect("{");
        const entries = this.readEntries(count);
        this.expect("}");
        return { type: "object", className, entries };
      }
      case "C": {
        this.expect(":");
        const className = this.readQuoted(this.readCount(":"));
        this.expect(":");
        const length = this.readCount(":");
        this.expect("{");
        const end = this.pos + length;
        if (end > this.bytes.length) this.fail(`Expected ${length} bytes but the input ended`);
        const data = decoder.decode(this.bytes.subarray(this.pos, end));
        this.pos = end;
        this.expect("}");
        return { type: "custom", className, data };
      }
      case "E": {
        this.expect(":");
        const value = this.readQuoted(this.readCount(":"));
        this.expect(";");
        return { type: "enum", value };
      }
      case "r":
      case "R":
        this.expect(":");
        return { type: "ref", value: this.readInt(";") };
      default:
        this.pos--;
        return this.fail(`Unknown type "${type}"`);
    }
  }
}

/** Reads session data in PHP's default `name|value name|value` format. */
const readSession = (reader: SerializedReader): PhpValue => {
  const entries = new EntryList();
  while (!reader.done) {
    const name = reader.readUntil("|");
    entries.put({ key: name, intKey: false, value: reader.readValue() });
  }
  return { type: "array", entries: entries.entries };
};

const parseSerialized = (text: string): { value: PhpValue; repaired: number } => {
  const reader = new SerializedReader(encoder.encode(text));
  const value = /^[^|:;{}"]+\|/.test(text) ? readSession(reader) : reader.readValue();
  if (!reader.done) reader.fail("Unexpected text after the value");
  return { value, repaired: reader.repaired };
};

const serialize = (value: PhpValue): string => {
  const quoted = (text: string) => `${byteLength(text)}:"${text}"`;
  const entries = (items: PhpEntry[], objectKeys: boolean) =>
    `${items.length}:{${items.map((e) => (e.intKey && !objectKeys ? `i:${e.key};` : `s:${quoted(e.key)};`) + serialize(e.value)).join("")}}`;
  switch (value.type) {
    case "null":
      return "N;";
    case "bool":
      return `b:${value.value ? 1 : 0};`;
    case "int":
      return `i:${value.value};`;
    case "float":
      return `d:${value.value};`;
    case "string":
      return `s:${quoted(value.value)};`;
    case "array":
      return `a:${entries(value.entries, false)}`;
    case "object":
      return `O:${quoted(value.className)}:${entries(value.entries, true)}`;
    case "custom":
      return `C:${quoted(value.className)}:${byteLength(value.data)}:{${value.data}}`;
    case "enum":
      return `E:${quoted(value.value)};`;
    case "ref":
      return `R:${value.value};`;
  }
};

/* ----------------------------------------------------------------- JSON */

/** Reads JSON into the value model, keeping key order and the exact number text. */
class JsonReader {
  pos = 0;

  constructor(private readonly text: string) {}

  fail(message: string): never {
    throw new PhpSyntaxError(this.pos >= this.text.length ? "Unexpected end of JSON" : `${message} at position ${this.pos}`);
  }

  skipSpace() {
    while (/[ \t\n\r]/.test(this.text[this.pos] ?? "")) this.pos++;
  }

  readString(): string {
    // JSON forbids raw control characters in strings.
    // eslint-disable-next-line no-control-regex
    const match = /^"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/.exec(this.text.slice(this.pos));
    if (!match) this.fail("Invalid string");
    this.pos += match[0].length;
    return JSON.parse(match[0]) as string;
  }

  readValue(): PhpValue {
    this.skipSpace();
    const char = this.text[this.pos];
    if (char === "{") return this.readObject();
    if (char === "[") {
      this.pos++;
      const entries: PhpEntry[] = [];
      this.skipSpace();
      if (this.text[this.pos] === "]") {
        this.pos++;
        return { type: "array", entries };
      }
      for (;;) {
        entries.push({ key: String(entries.length), intKey: true, value: this.readValue() });
        this.skipSpace();
        if (this.text[this.pos] === ",") this.pos++;
        else if (this.text[this.pos] === "]") {
          this.pos++;
          return { type: "array", entries };
        } else this.fail('Expected "," or "]"');
      }
    }
    if (char === '"') return { type: "string", value: this.readString() };
    for (const [word, value] of [["true", { type: "bool", value: true }], ["false", { type: "bool", value: false }], ["null", { type: "null" }]] as const) {
      if (this.text.startsWith(word, this.pos)) {
        this.pos += word.length;
        return value;
      }
    }
    const number = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(this.text.slice(this.pos));
    if (number) {
      this.pos += number[0].length;
      const text = number[0];
      // Integers outside the 64-bit range become floats, as in PHP.
      return /[.eE]/.test(text) || !inInt64(BigInt(text)) ? { type: "float", value: text } : { type: "int", value: text };
    }
    return this.fail(char === undefined ? "" : `Unexpected character "${char}"`);
  }

  readObject(): PhpValue {
    this.pos++;
    const entries = new EntryList();
    this.skipSpace();
    if (this.text[this.pos] === "}") this.pos++;
    else {
      for (;;) {
        this.skipSpace();
        if (this.text[this.pos] !== '"') this.fail("Expected a property name");
        const name = this.readString();
        this.skipSpace();
        if (this.text[this.pos] !== ":") this.fail('Expected ":"');
        this.pos++;
        entries.put({ ...toKey({ type: "string", value: name }, () => ""), value: this.readValue() });
        this.skipSpace();
        if (this.text[this.pos] === ",") this.pos++;
        else if (this.text[this.pos] === "}") {
          this.pos++;
          break;
        } else this.fail('Expected "," or "}"');
      }
    }
    return fromSpecialKeys(entries.entries);
  }

  readDocument(): PhpValue {
    const value = this.readValue();
    this.skipSpace();
    if (this.pos < this.text.length) this.fail("Unexpected text after the JSON value");
    return value;
  }
}

const stringAt = (entries: PhpEntry[], key: string) => {
  const entry = entries.find((e) => !e.intKey && e.key === key);
  return entry?.value.type === "string" ? entry.value.value : undefined;
};

/** Turns the `__class`, `__enum`, and `__ref` keys that toJson writes back into PHP values. */
const fromSpecialKeys = (entries: PhpEntry[]): PhpValue => {
  const only = entries.length === 1 ? entries[0] : undefined;
  if (only?.key === "__enum" && only.value.type === "string") return { type: "enum", value: only.value.value };
  if (only?.key === "__ref" && only.value.type === "int") return { type: "ref", value: only.value.value };
  const className = stringAt(entries, "__class");
  if (className === undefined) return { type: "array", entries };
  const data = stringAt(entries, "__serialized");
  if (data !== undefined && entries.length === 2) return { type: "custom", className, data };
  return { type: "object", className, entries: entries.filter((e) => e.intKey || e.key !== "__class") };
};

const toJson = (value: PhpValue, depth = 0): string => {
  const pad = "  ".repeat(depth + 1);
  const close = "  ".repeat(depth);
  const object = (items: [string, string][]) =>
    items.length ? `{\n${items.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${v}`).join(",\n")}\n${close}}` : "{}";
  const members = (entries: PhpEntry[]) => entries.map((e): [string, string] => [e.key, toJson(e.value, depth + 1)]);
  switch (value.type) {
    case "null":
      return "null";
    case "bool":
      return String(value.value);
    case "int":
      return value.value;
    case "float":
      return JSON_NUMBER.test(value.value) ? value.value : JSON_NUMBER.test(String(Number(value.value))) ? String(Number(value.value)) : JSON.stringify(value.value);
    case "string":
      return JSON.stringify(value.value);
    case "array":
      if (value.entries.length && isList(value.entries)) return `[\n${value.entries.map((e) => pad + toJson(e.value, depth + 1)).join(",\n")}\n${close}]`;
      return value.entries.length ? object(members(value.entries)) : "[]";
    case "object":
      return object([["__class", JSON.stringify(value.className)], ...members(value.entries)]);
    case "custom":
      return object([["__class", JSON.stringify(value.className)], ["__serialized", JSON.stringify(value.data)]]);
    case "enum":
      return object([["__enum", JSON.stringify(value.value)]]);
    case "ref":
      return object([["__ref", value.value]]);
  }
};

/* ------------------------------------------------------- PHP array literal */

type Token =
  | { kind: "punct"; text: string; pos: number }
  | { kind: "string"; value: string; pos: number }
  | { kind: "number"; text: string; pos: number }
  | { kind: "name"; text: string; pos: number }
  | { kind: "variable"; text: string; pos: number }
  | { kind: "end"; pos: number };

const ESCAPES: Record<string, number> = { n: 10, t: 9, r: 13, v: 11, e: 27, f: 12, "\\": 92, $: 36, '"': 34 };

/** Decodes a double-quoted PHP string. Octal and \x escapes write bytes, so the result is read as UTF-8. */
const decodeDoubleQuoted = (body: string, pos: number): string => {
  const bytes: number[] = [];
  const pushText = (text: string) => bytes.push(...encoder.encode(text));
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char !== "\\") {
      // Keep astral characters whole so they encode as one UTF-8 sequence.
      const code = body.codePointAt(i) ?? 0;
      pushText(String.fromCodePoint(code));
      if (code > 0xffff) i++;
      continue;
    }
    const next = body[i + 1] ?? "";
    let match: RegExpExecArray | null;
    if (next in ESCAPES) {
      bytes.push(ESCAPES[next]);
      i++;
    } else if ((match = /^[0-7]{1,3}/.exec(body.slice(i + 1)))) {
      bytes.push(parseInt(match[0], 8) & 0xff);
      i += match[0].length;
    } else if ((match = /^x([0-9a-fA-F]{1,2})/.exec(body.slice(i + 1)))) {
      bytes.push(parseInt(match[1], 16));
      i += match[0].length;
    } else if ((match = /^u\{([0-9a-fA-F]+)\}/.exec(body.slice(i + 1)))) {
      const code = parseInt(match[1], 16);
      if (code > 0x10ffff) throw new PhpSyntaxError(`Invalid Unicode escape at position ${pos + i}`);
      pushText(String.fromCodePoint(code));
      i += match[0].length;
    } else bytes.push(92); // PHP keeps an unknown escape as written
  }
  return decoder.decode(new Uint8Array(bytes));
};

const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    let match: RegExpExecArray | null;
    if ((match = /^(\s+|\/\/[^\n]*|#(?!\[)[^\n]*|\/\*[\s\S]*?\*\/|<\?php\b|\?>)/.exec(rest))) {
      i += match[0].length;
    } else if (rest.startsWith("<<<")) {
      throw new PhpSyntaxError(`Heredoc and nowdoc strings are not supported at position ${i}`);
    } else if (rest[0] === "'") {
      match = /^'((?:[^'\\]|\\[\s\S])*)'/.exec(rest);
      if (!match) throw new PhpSyntaxError(`Unclosed string at position ${i}`);
      tokens.push({ kind: "string", value: match[1].replace(/\\([\\'])/g, "$1"), pos: i });
      i += match[0].length;
    } else if (rest[0] === '"') {
      match = /^"((?:[^"\\]|\\[\s\S])*)"/.exec(rest);
      if (!match) throw new PhpSyntaxError(`Unclosed string at position ${i}`);
      tokens.push({ kind: "string", value: decodeDoubleQuoted(match[1], i + 1), pos: i });
      i += match[0].length;
    } else if ((match = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(\d[\d_]*)?\.?\d[\d_]*([eE][+-]?\d+)?|\d[\d_]*\.)/.exec(rest))) {
      tokens.push({ kind: "number", text: match[0], pos: i });
      i += match[0].length;
    } else if ((match = /^\$[A-Za-z_\x80-￿][\w\x80-￿]*/.exec(rest))) {
      tokens.push({ kind: "variable", text: match[0], pos: i });
      i += match[0].length;
    } else if ((match = /^\\?[A-Za-z_\x80-￿][\w\x80-￿]*(\\[A-Za-z_\x80-￿][\w\x80-￿]*)*/.exec(rest))) {
      tokens.push({ kind: "name", text: match[0].replace(/^\\/, ""), pos: i });
      i += match[0].length;
    } else if ((match = /^(=>|::|[[\](),;=+-])/.exec(rest))) {
      tokens.push({ kind: "punct", text: match[0], pos: i });
      i += match[0].length;
    } else {
      throw new PhpSyntaxError(`Unexpected character "${rest[0]}" at position ${i}`);
    }
  }
  tokens.push({ kind: "end", pos: source.length });
  return tokens;
};

const parseNumber = (text: string, negative: boolean): PhpValue => {
  const clean = text.replace(/_/g, "");
  const sign = negative ? "-" : "";
  if (/^\d+$/.test(clean) || /^0[xXbBoO]/.test(clean)) {
    // A leading 0 means octal in PHP.
    const digits = /^0\d+$/.test(clean) ? `0o${clean.slice(1)}` : clean.replace(/^0O/, "0o").replace(/^0B/, "0b").replace(/^0X/, "0x");
    const n = BigInt(digits) * (negative ? -1n : 1n);
    return inInt64(n) ? { type: "int", value: n.toString() } : { type: "float", value: String(Number(n)) };
  }
  return { type: "float", value: String(Number(sign + clean)) };
};

class PhpArrayParser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  private get token() {
    return this.tokens[this.index];
  }

  private fail(message: string): never {
    const token = this.token;
    throw new PhpSyntaxError(token.kind === "end" ? `${message} but the input ended` : `${message} at position ${token.pos}`);
  }

  private isPunct(text: string) {
    return this.token.kind === "punct" && this.token.text === text;
  }

  private isName(text: string) {
    return this.token.kind === "name" && this.token.text.toLowerCase() === text;
  }

  private expect(text: string) {
    if (!this.isPunct(text)) this.fail(`Expected "${text}"`);
    this.index++;
  }

  private readItems(closer: string): PhpEntry[] {
    const entries = new EntryList();
    let nextIndex = 0n;
    while (!this.isPunct(closer)) {
      const keyPos = this.token.pos;
      const first = this.readValue();
      let entry: PhpEntry;
      if (this.isPunct("=>")) {
        this.index++;
        entry = { ...toKey(first, () => `at position ${keyPos}`), value: this.readValue() };
      } else {
        entry = { key: nextIndex.toString(), intKey: true, value: first };
      }
      if (entry.intKey && BigInt(entry.key) >= nextIndex) nextIndex = BigInt(entry.key) + 1n;
      entries.put(entry);
      if (!this.isPunct(",")) break;
      this.index++;
    }
    this.expect(closer);
    return entries.entries;
  }

  /** Reads integer sums such as var_export's `-9223372036854775807-1` for PHP_INT_MIN. */
  private readSum(first: PhpValue): PhpValue {
    let value = first;
    while (value.type === "int" && (this.isPunct("-") || this.isPunct("+")) && this.tokens[this.index + 1]?.kind === "number") {
      const negative = this.isPunct("-");
      const next = parseNumber((this.tokens[this.index + 1] as { text: string }).text, negative);
      if (next.type !== "int") break;
      this.index += 2;
      const sum = BigInt(value.value) + BigInt(next.value);
      value = inInt64(sum) ? { type: "int", value: sum.toString() } : { type: "float", value: String(Number(sum)) };
    }
    return value;
  }

  readValue(): PhpValue {
    const token = this.token;
    if (this.isPunct("[")) {
      this.index++;
      return { type: "array", entries: this.readItems("]") };
    }
    if (this.isPunct("(")) {
      this.index++;
      if (!this.isName("object")) this.fail('Expected "object" in a cast');
      this.index++;
      this.expect(")");
      const inner = this.readValue();
      if (inner.type === "object") return inner;
      if (inner.type !== "array") return { type: "object", className: "stdClass", entries: [{ key: "scalar", intKey: false, value: inner }] };
      return { type: "object", className: "stdClass", entries: inner.entries };
    }
    if (this.isPunct("-") || this.isPunct("+")) {
      const negative = this.isPunct("-");
      this.index++;
      const next = this.token;
      if (next.kind === "number") {
        this.index++;
        return this.readSum(parseNumber(next.text, negative));
      }
      if (next.kind === "name" && /^(inf|nan)$/i.test(next.text)) {
        this.index++;
        return { type: "float", value: `${negative && next.text.toUpperCase() === "INF" ? "-" : ""}${next.text.toUpperCase()}` };
      }
      return this.fail("Expected a number");
    }
    if (token.kind === "number") {
      this.index++;
      return this.readSum(parseNumber(token.text, false));
    }
    if (token.kind === "string") {
      this.index++;
      return { type: "string", value: token.value };
    }
    if (token.kind === "name") {
      const lower = token.text.toLowerCase();
      this.index++;
      if (lower === "array" && this.isPunct("(")) {
        this.index++;
        return { type: "array", entries: this.readItems(")") };
      }
      if (lower === "true" || lower === "false") return { type: "bool", value: lower === "true" };
      if (lower === "null") return { type: "null" };
      if (lower === "inf" || lower === "nan") return { type: "float", value: token.text.toUpperCase() };
      if (this.isPunct("::")) {
        this.index++;
        const member = this.token;
        if (member.kind !== "name") this.fail("Expected a name after ::");
        this.index++;
        if (member.text === "__set_state" && this.isPunct("(")) {
          this.index++;
          const state = this.readValue();
          this.expect(")");
          if (state.type !== "array") this.fail("Expected an array in __set_state");
          return { type: "object", className: token.text, entries: state.entries };
        }
        return { type: "enum", value: `${token.text}:${member.text}` };
      }
      this.index--;
      return this.fail(`Unsupported name "${token.text}"`);
    }
    if (token.kind === "variable") return this.fail("Variables are not supported");
    return this.fail("Expected a value");
  }

  /** Reads an optional `return` or `$name =`, one value, and an optional `;`. */
  readDocument(): PhpValue {
    if (this.isName("return")) this.index++;
    else if (this.token.kind === "variable" && this.tokens[this.index + 1]?.kind === "punct" && (this.tokens[this.index + 1] as { text: string }).text === "=") this.index += 2;
    const value = this.readValue();
    if (this.isPunct(";")) this.index++;
    if (this.token.kind !== "end") this.fail("Unexpected text after the value");
    return value;
  }
}

const quotePhp = (text: string) => `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

const toPhp = (value: PhpValue, longSyntax: boolean, depth = 0): string => {
  const pad = "    ".repeat(depth + 1);
  const close = "    ".repeat(depth);
  const [open, end] = longSyntax ? ["array(", ")"] : ["[", "]"];
  const array = (entries: PhpEntry[]) => {
    if (!entries.length) return open + end;
    const list = isList(entries);
    const lines = entries.map((e) => `${pad}${list ? "" : `${e.intKey ? e.key : quotePhp(propertyName(e.key))} => `}${toPhp(e.value, longSyntax, depth + 1)},`);
    return `${open}\n${lines.join("\n")}\n${close}${end}`;
  };
  switch (value.type) {
    case "null":
      return "null";
    case "bool":
      return String(value.value);
    case "int":
      // PHP reads -9223372036854775808 as a negated float, so write the minimum as an expression.
      return value.value === INT64_MIN.toString() ? "PHP_INT_MIN" : value.value;
    case "float":
      if (/^(-?INF|NAN)$/.test(value.value)) return value.value;
      return /^-?\d+$/.test(value.value) ? `${value.value}.0` : value.value;
    case "string":
      return quotePhp(value.value);
    case "array":
      return array(value.entries);
    case "object":
      return value.className === "stdClass" ? `(object) ${array(value.entries)}` : `\\${value.className}::__set_state(${array(value.entries)})`;
    case "custom":
      return `unserialize(${quotePhp(serialize(value))})`;
    case "enum": {
      const [className, member] = value.value.split(":");
      return `\\${className}::${member}`;
    }
    case "ref":
      return `null /* reference to value ${value.value} */`;
  }
};

/* ------------------------------------------------------------ public API */

/** Converts serialize() output or PHP session data to JSON. String lengths that do not match are repaired. */
export function unserializeToJson(text: string): PhpResult {
  const input = text.trim();
  let repaired = 0;
  return run(
    () => {
      if (!input) return "";
      const parsed = parseSerialized(input);
      repaired = parsed.repaired;
      return toJson(parsed.value);
    },
    () =>
      repaired
        ? `Repaired ${repaired} string length${repaired === 1 ? "" : "s"} that did not match the text. Serialize the JSON again to get valid data.`
        : undefined,
  );
}

/** Converts JSON to serialize() output. */
export function jsonToSerialized(text: string): PhpResult {
  return run(() => (text.trim() ? serialize(new JsonReader(text).readDocument()) : ""));
}

/** Converts a PHP array literal, a `return [...]` config file, or var_export() output to JSON. */
export function phpArrayToJson(text: string): PhpResult {
  return run(() => (text.trim() ? toJson(new PhpArrayParser(tokenize(text)).readDocument()) : ""));
}

/** Converts JSON to a PHP array literal with PSR-12 indentation. */
export function jsonToPhpArray(text: string, options: { longSyntax?: boolean } = {}): PhpResult {
  return run(() => (text.trim() ? toPhp(new JsonReader(text).readDocument(), options.longSyntax ?? false) : ""));
}
