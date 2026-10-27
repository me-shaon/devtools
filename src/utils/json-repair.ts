/**
 * Lenient JSON reader. Valid JSON takes the JSON.parse fast path. Other input goes through a
 * small parser that also reads JSON5, NDJSON, and the data literals that Python, Ruby, and
 * JavaScript print. Each repair is counted and reported. Input that has more than one possible
 * meaning is refused with a line and column, so a repair never changes the data silently.
 */

/** An integer above 2^53 (or a number that overflows a double), kept as its exact text. */
export class LosslessNumber {
  constructor(readonly text: string) {}
  toString() {
    return this.text;
  }
  valueOf() {
    return Number(this.text);
  }
}

export interface JsonReadError {
  message: string;
  line: number;
  column: number;
  offset: number;
}

export type JsonReadResult =
  | { ok: true; value: unknown; notice?: string; largeNumbers: number }
  | { ok: false; error: JsonReadError };

type Repair =
  | "unquotedKey"
  | "singleQuote"
  | "stringPrefix"
  | "pythonConstant"
  | "tuple"
  | "rubyArrow"
  | "symbol"
  | "nil"
  | "comment"
  | "trailingComma"
  | "missingComma"
  | "undefinedProperty"
  | "undefinedItem"
  | "number"
  | "escape"
  | "controlChar"
  | "wrapper";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Notice text for each repair, in the order the notice lists them. */
const REPAIR_TEXT: [Repair, (n: number) => string][] = [
  ["unquotedKey", (n) => `quoted ${plural(n, "key", "keys")}`],
  ["singleQuote", (n) => `converted ${plural(n, "single-quoted string", "single-quoted strings")}`],
  ["stringPrefix", (n) => `removed ${plural(n, "string prefix", "string prefixes")}`],
  ["pythonConstant", (n) => `converted ${plural(n, "Python constant", "Python constants")}`],
  ["tuple", (n) => `converted ${plural(n, "tuple to an array", "tuples to arrays")}`],
  ["rubyArrow", (n) => `replaced ${plural(n, "=> separator", "=> separators")} with colons`],
  ["symbol", (n) => `converted ${plural(n, "symbol", "symbols")} to strings`],
  ["nil", (n) => `converted ${plural(n, "nil", "nils")} to null`],
  ["comment", (n) => `removed ${plural(n, "comment", "comments")}`],
  ["trailingComma", (n) => `removed ${plural(n, "trailing comma", "trailing commas")}`],
  ["missingComma", (n) => `added ${plural(n, "missing comma", "missing commas")}`],
  ["undefinedProperty", (n) => `dropped ${plural(n, "undefined property", "undefined properties")}`],
  ["undefinedItem", (n) => `changed ${plural(n, "undefined array item", "undefined array items")} to null`],
  ["number", (n) => `rewrote ${plural(n, "number", "numbers")} in JSON form`],
  ["escape", (n) => `fixed ${plural(n, "string escape", "string escapes")}`],
  ["controlChar", (n) => `escaped ${plural(n, "control character", "control characters")}`],
  ["wrapper", () => "removed the code around the value"],
];

/** Repairs that only one language explains, and the repairs that its name covers in the notice. */
const DIALECTS: { name: string; markers: Repair[]; implies: Repair[] }[] = [
  { name: "Python", markers: ["pythonConstant", "tuple", "stringPrefix"], implies: ["pythonConstant", "tuple", "stringPrefix", "singleQuote", "unquotedKey", "escape"] },
  { name: "Ruby", markers: ["rubyArrow", "symbol", "nil"], implies: ["rubyArrow", "symbol", "nil", "singleQuote", "unquotedKey", "escape"] },
  { name: "JavaScript", markers: ["undefinedProperty", "undefinedItem"], implies: ["singleQuote", "unquotedKey", "escape"] },
];

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const STRICT_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;
const NUMBER = /[+-]?(?:0[xX][\da-fA-F](?:_?[\da-fA-F])*|0[oO][0-7](?:_?[0-7])*|0[bB][01](?:_?[01])*|(?:\d(?:_?\d)*)?(?:\.(?:\d(?:_?\d)*)?)?(?:[eE][+-]?\d(?:_?\d)*)?n?)/y;
// Sticky (y) patterns match at lastIndex, so the reader never copies the rest of the input.
const IDENT = /[A-Za-z_$\p{L}][\w$\p{L}\p{N}]*/uy;
const IDENT_CHAR = /[\w$\p{L}\p{N}]/u;
const WRAPPER = /^(?:export\s+default\s+|module\.exports\s*=\s*|(?:(?:const|let|var)\s+)?[A-Za-z_$][\w$.]*\s*=(?![=>])\s*)/;
const SIMPLE_ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
const EXTRA_ESCAPES: Record<string, string> = { "'": "'", v: "\v", a: "\x07", e: "\x1b", "#": "#" };
const NO_JSON_FORM = new Set(["NaN", "nan", "Infinity", "inf", "undefined"]);
// Text that may hide a large or overflowing number. Valid JSON without it stays on JSON.parse.
const MAYBE_LARGE = /\d{16}|[eE][+-]?\d{3}/;

const UNDEFINED = Symbol("undefined");

class ReadError extends Error {
  constructor(message: string, readonly offset: number) {
    super(message);
  }
}

class LenientReader {
  pos = 0;
  largeNumbers = 0;
  readonly repairs = new Map<Repair, number>();

  constructor(private readonly src: string) {}

  repair(kind: Repair) {
    this.repairs.set(kind, (this.repairs.get(kind) ?? 0) + 1);
  }

  fail(message: string, offset = this.pos): never {
    const ended = offset >= this.src.length;
    throw new ReadError(ended ? `${message.replace(/\.$/, "")}, but the input ended.` : message, offset);
  }

  /** Skips spaces and comments. Returns true when it crossed a line break. */
  skip(): boolean {
    const src = this.src;
    let newline = false;
    while (this.pos < src.length) {
      const ch = src[this.pos];
      if (ch === "\n" || ch === "\r") {
        newline = true;
        this.pos++;
      } else if (ch === " " || ch === "\t" || ch === "﻿" || ch === " ") {
        this.pos++;
      } else if (ch === "/" && src[this.pos + 1] === "/") {
        const end = src.indexOf("\n", this.pos);
        this.pos = end === -1 ? src.length : end;
        this.repair("comment");
      } else if (ch === "/" && src[this.pos + 1] === "*") {
        const end = src.indexOf("*/", this.pos + 2);
        if (end === -1) this.fail("Unclosed comment.");
        if (src.slice(this.pos, end).includes("\n")) newline = true;
        this.pos = end + 2;
        this.repair("comment");
      } else if (ch === "#") {
        if (src[this.pos + 1] === "<") this.fail("Ruby objects (#<...>) have no JSON form.");
        const end = src.indexOf("\n", this.pos);
        this.pos = end === -1 ? src.length : end;
        this.repair("comment");
      } else break;
    }
    return newline;
  }

  get ch() {
    return this.src[this.pos];
  }

  /** Matches a sticky pattern at an offset. */
  private match(pattern: RegExp, at = this.pos): string | null {
    pattern.lastIndex = at;
    return pattern.exec(this.src)?.[0] ?? null;
  }

  readDocument(): { value: unknown; lines: number } {
    this.skip();
    if (this.src.startsWith("=>", this.pos)) {
      // irb and Rails console print results after "=>".
      this.pos += 2;
      this.repair("wrapper");
      this.skip();
    } else {
      const wrapper = WRAPPER.exec(this.src.slice(this.pos));
      if (wrapper && wrapper[0].trim()) {
        this.pos += wrapper[0].length;
        this.repair("wrapper");
        this.skip();
      }
    }
    const values = [this.readTop()];
    let newline = this.skip();
    if (this.ch === ";") {
      this.pos++;
      if (!this.repairs.has("wrapper")) this.repair("wrapper");
      newline = this.skip() || newline;
    }
    // More values, each on its own line, are NDJSON.
    while (this.pos < this.src.length) {
      if (!newline || !this.startsValue()) this.fail("Unexpected text after the value.");
      values.push(this.readTop());
      newline = this.skip();
    }
    return values.length === 1 ? { value: values[0], lines: 1 } : { value: values, lines: values.length };
  }

  private readTop(): unknown {
    const start = this.pos;
    const value = this.readValue();
    if (value === UNDEFINED) this.fail('"undefined" has no JSON form.', start);
    return value;
  }

  private startsValue() {
    return /[[{("'\-+.\d:A-Za-z_$]/.test(this.ch ?? "") || this.match(IDENT) !== null;
  }

  readValue(): unknown {
    const ch = this.ch;
    if (ch === undefined) this.fail("Expected a value.");
    if (ch === "{") return this.readObject();
    if (ch === "[") return this.readList("]");
    if (ch === "(") return this.readList(")");
    if (ch === '"' || ch === "'") return this.readString();
    if (ch === ":") return this.readSymbol();
    if (/[\d.+-]/.test(ch)) return this.readNumber();
    const ident = this.match(IDENT);
    if (ident) return this.readName(ident);
    return this.fail("Expected a value.");
  }

  private readName(name: string): unknown {
    const start = this.pos;
    const next = this.src[start + name.length];
    if ((name === "u" || name === "U") && (next === "'" || next === '"')) {
      this.pos++;
      this.repair("stringPrefix");
      return this.readString();
    }
    if ((name === "b" || name === "B") && (next === "'" || next === '"')) this.fail("Python bytes have no JSON form.");
    this.pos += name.length;
    if (name === "true") return true;
    if (name === "false") return false;
    if (name === "null") return null;
    if (name === "True" || name === "False" || name === "None") {
      this.repair("pythonConstant");
      return name === "True" ? true : name === "False" ? false : null;
    }
    if (name === "nil") {
      this.repair("nil");
      return null;
    }
    if (name === "undefined") return UNDEFINED;
    if (NO_JSON_FORM.has(name)) this.fail(`"${name}" has no JSON form.`, start);
    return this.fail(`Unquoted text "${name}". Put it in quotes if it is a string.`, start);
  }

  private readSymbol(): string {
    const start = this.pos;
    this.pos++;
    const quote = this.ch;
    if (quote === '"' || quote === "'") {
      const value = this.readString();
      this.repair("symbol");
      return value;
    }
    const ident = this.match(IDENT);
    if (!ident) this.fail("Expected a value.", start);
    this.pos += ident.length;
    this.repair("symbol");
    return ident;
  }

  readString(): string {
    const src = this.src;
    const start = this.pos;
    const quote = src[start];
    if (quote === "'") this.repair("singleQuote");
    let out = "";
    let i = start + 1;
    for (;;) {
      if (i >= src.length) this.fail("Unclosed string.", start);
      const ch = src[i];
      if (ch === quote) break;
      if (ch === "\n" || ch === "\r") this.fail("Unclosed string.", start);
      if (ch !== "\\") {
        // Copy a run of plain characters at once.
        let end = i;
        while (end < src.length) {
          const c = src[end];
          if (c === quote || c === "\\" || c === "\n" || c === "\r") break;
          if (c < " ") this.repair("controlChar");
          end++;
        }
        out += src.slice(i, end);
        i = end;
        continue;
      }
      const next = src[i + 1];
      if (next === undefined) this.fail("Unclosed string.", start);
      if (next in SIMPLE_ESCAPES) {
        out += SIMPLE_ESCAPES[next];
        i += 2;
        continue;
      }
      let match: RegExpExecArray | null;
      const rest = src.slice(i + 1, i + 12);
      if (next === "u" && (match = /^u([\da-fA-F]{4})/.exec(rest))) {
        out += String.fromCharCode(parseInt(match[1], 16));
        i += 6;
        continue;
      }
      this.repair("escape");
      if (next in EXTRA_ESCAPES) {
        out += EXTRA_ESCAPES[next];
        i += 2;
      } else if (next === "0" && !/[0-9]/.test(src[i + 2] ?? "")) {
        out += "\0";
        i += 2;
      } else if ((match = /^x([\da-fA-F]{2})/.exec(rest)) || (match = /^U([\da-fA-F]{8})/.exec(rest)) || (match = /^u\{([\da-fA-F]{1,6})\}/.exec(rest))) {
        const code = parseInt(match[1], 16);
        if (code > 0x10ffff) this.fail("Invalid Unicode escape.", i);
        out += String.fromCodePoint(code);
        i += 1 + match[0].length;
      } else if (next === "\n" || next === "\r") {
        // A backslash before a line break continues the string.
        i += src.startsWith("\r\n", i + 1) ? 3 : 2;
      } else {
        this.fail(`Unknown escape "\\${next}".`, i);
      }
    }
    this.pos = i + 1;
    return out;
  }

  private readNumber(): number | LosslessNumber {
    const start = this.pos;
    const text = this.match(NUMBER) ?? "";
    if (!/\d/.test(text)) {
      // A sign before a name, as in -Infinity.
      const ident = /^[+-]/.test(text) ? this.match(IDENT, start + 1) : null;
      if (ident && NO_JSON_FORM.has(ident)) this.fail(`"${ident}" has no JSON form.`, start + 1);
      this.fail("Expected a value.");
    }
    if (IDENT_CHAR.test(this.src[start + text.length] ?? "")) this.fail("Invalid number.", start);
    this.pos += text.length;
    if (STRICT_NUMBER.test(text)) return this.toNumber(text);
    const negative = text.startsWith("-");
    const body = text.replace(/^[+-]/, "").replace(/_/g, "").replace(/n$/, "");
    if (/^0\d/.test(body)) this.fail("Leading zeros are ambiguous: some languages read them as octal.", start);
    if (text.endsWith("n") && !/^(0[xob][\da-f]+|\d+)$/i.test(body)) this.fail("Invalid number.", start);
    this.repair("number");
    const sign = negative ? "-" : "";
    if (/^0[xob]/i.test(body)) return this.toNumber(sign + BigInt(body.toLowerCase()).toString());
    const normal = body.replace(/^\./, "0.").replace(/\.(?=[eE]|$)/, "");
    return this.toNumber(sign + normal);
  }

  private toNumber(text: string): number | LosslessNumber {
    if (/^-?\d+$/.test(text)) {
      const big = BigInt(text);
      if (big > MAX_SAFE || big < -MAX_SAFE) {
        this.largeNumbers++;
        return new LosslessNumber(big.toString());
      }
      return Number(text);
    }
    const value = Number(text);
    if (!Number.isFinite(value)) {
      this.largeNumbers++;
      return new LosslessNumber(text);
    }
    return value;
  }

  private readKey(): string {
    const ch = this.ch;
    const start = this.pos;
    if (ch === '"' || ch === "'") return this.readString();
    if (ch === ":") return this.readSymbol();
    if (ch !== undefined && /[\d.+-]/.test(ch)) {
      // Python and JavaScript number keys become strings, as json.dumps and JSON.stringify write them.
      const value = this.readNumber();
      this.repair("unquotedKey");
      return value instanceof LosslessNumber ? value.text : String(value);
    }
    const name = this.match(IDENT);
    if (!name) this.fail(ch === undefined ? "Expected a key." : 'Expected a key or "}".');
    if (name === "True" || name === "False" || name === "None") this.fail(`The key ${name} is ambiguous. Put it in quotes.`, start);
    if ((name === "u" || name === "U") && (this.src[start + 1] === "'" || this.src[start + 1] === '"')) {
      this.pos++;
      this.repair("stringPrefix");
      return this.readString();
    }
    this.pos += name.length;
    this.repair("unquotedKey");
    return name;
  }

  private readObject(): Record<string, unknown> {
    const object: Record<string, unknown> = {};
    this.pos++;
    let afterComma = false;
    for (;;) {
      this.skip();
      if (this.ch === "}") {
        if (afterComma) this.repair("trailingComma");
        this.pos++;
        return object;
      }
      if (this.ch === ",") this.fail('Expected a key or "}".');
      const key = this.readKey();
      this.skip();
      if (this.src.startsWith("=>", this.pos)) {
        this.pos += 2;
        this.repair("rubyArrow");
      } else if (this.ch === ":") {
        this.pos++;
      } else this.fail('Expected ":" after the key.');
      this.skip();
      const value = this.readValue();
      if (value === UNDEFINED) this.repair("undefinedProperty");
      // defineProperty keeps a "__proto__" key as data, as JSON.parse does.
      else Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
      const newline = this.skip();
      afterComma = false;
      if (this.ch === ",") {
        this.pos++;
        afterComma = true;
      } else if (this.ch === "}") {
        continue;
      } else if (newline && this.ch !== undefined && this.startsValue()) {
        this.repair("missingComma");
      } else this.fail('Expected "," or "}".');
    }
  }

  /** Reads an array, or a Python tuple when the closer is ")". */
  private readList(closer: "]" | ")"): unknown[] {
    const list: unknown[] = [];
    const start = this.pos;
    this.pos++;
    let afterComma = false;
    for (;;) {
      this.skip();
      if (this.ch === closer) {
        if (closer === ")") {
          if (list.length === 1 && !afterComma) this.fail('A single value in parentheses is not a tuple. Add a comma, as in (1,).', start);
          this.repair("tuple");
        }
        // Python requires the comma in a one-item tuple, so it is not a repair.
        if (afterComma && !(closer === ")" && list.length === 1)) this.repair("trailingComma");
        this.pos++;
        return list;
      }
      const isString = this.ch === '"' || this.ch === "'";
      const value = this.readValue();
      if (value === UNDEFINED) {
        this.repair("undefinedItem");
        list.push(null);
      } else list.push(value);
      const newline = this.skip();
      afterComma = false;
      if (this.ch === ",") {
        this.pos++;
        afterComma = true;
      } else if (this.ch === closer) {
        continue;
      } else if (newline && this.ch !== undefined && this.startsValue()) {
        const nextString = this.ch === '"' || this.ch === "'";
        if (isString && nextString) this.fail("Add a comma between the strings. Python joins strings that are next to each other.");
        this.repair("missingComma");
      } else this.fail(`Expected "," or "${closer}".`);
    }
  }
}

const position = (src: string, offset: number): JsonReadError => {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { message: "", line, column: offset - lineStart + 1, offset };
};

/** The input line around an error, cut to a short window, and the caret index in it. */
export function errorExcerpt(input: string, offset: number, width = 60): { text: string; caret: number } {
  const lineStart = input.lastIndexOf("\n", offset - 1) + 1;
  const lineEnd = input.indexOf("\n", offset) === -1 ? input.length : input.indexOf("\n", offset);
  const line = input.slice(lineStart, lineEnd).replace(/\r$/, "").replace(/\t/g, " ");
  const caret = offset - lineStart;
  const from = Math.max(0, Math.min(caret - Math.floor(width / 2), line.length - width));
  const to = Math.min(line.length, from + width);
  const prefix = from > 0 ? "…" : "";
  return { text: prefix + line.slice(from, to) + (to < line.length ? "…" : ""), caret: prefix.length + caret - from };
}

const buildNotice = (repairs: Map<Repair, number>, lines: number): string | undefined => {
  const parts: string[] = [];
  const found = DIALECTS.filter((dialect) => dialect.markers.some((marker) => repairs.has(marker)));
  const dialect = found.length === 1 ? found[0] : undefined;
  if (dialect) parts.push(`converted from a ${dialect.name} literal`);
  for (const [kind, text] of REPAIR_TEXT) {
    const count = repairs.get(kind);
    if (count && !dialect?.implies.includes(kind)) parts.push(text(count));
  }
  const repaired = parts.length ? `Repaired: ${parts.join("; ")}.` : "";
  const ndjson = lines > 1 ? `Read ${lines} NDJSON lines as an array.` : "";
  return [ndjson, repaired].filter(Boolean).join(" ") || undefined;
};

/** Reads JSON or a data literal. Returns the value, a repair notice, and the count of large numbers. */
export function readJson(input: string): JsonReadResult {
  if (!MAYBE_LARGE.test(input)) {
    try {
      return { ok: true, value: JSON.parse(input), largeNumbers: 0 };
    } catch {
      // Not plain JSON. The lenient reader below reports the exact problem.
    }
  }
  const reader = new LenientReader(input);
  try {
    const { value, lines } = reader.readDocument();
    return { ok: true, value, notice: buildNotice(reader.repairs, lines), largeNumbers: reader.largeNumbers };
  } catch (error) {
    if (!(error instanceof ReadError)) throw error;
    return { ok: false, error: { ...position(input, error.offset), message: error.message } };
  }
}
