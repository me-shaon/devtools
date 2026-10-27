import { errorAt, setOwn } from "./conversion-error";

/** How nested keys join in .env output: "__" (ASP.NET Core, pydantic) or "_" (Spring Boot). */
export type EnvNesting = "__" | "_";

const KEY_LINE = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_.-]*)[ \t]*=[ \t]*/;
const DOUBLE_ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t" };

const unescapeDouble = (body: string) => body.replace(/\\([nrt"\\])/g, (_, char: string) => DOUBLE_ESCAPES[char] ?? char);

/**
 * Parses a .env file into a flat map of strings. Supports comments, `export`, single, double,
 * and backtick quotes, and quoted values over several lines. `${VAR}` references stay as text.
 * A repeated key keeps its last value. Throws a ConversionError with the line on invalid input.
 */
export function parseEnv(input: string): Record<string, string> {
  const text = input.replace(/\r\n?/g, "\n");
  const result: Record<string, string> = {};
  let pos = 0;
  let line = 1;
  while (pos < text.length) {
    const newline = text.indexOf("\n", pos);
    const lineEnd = newline === -1 ? text.length : newline;
    const raw = text.slice(pos, lineEnd);
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      pos = lineEnd + 1;
      line++;
      continue;
    }
    const match = KEY_LINE.exec(raw);
    if (!match) {
      throw errorAt("Expected KEY=value. Keys use letters, digits, and underscores.", line, raw.length - raw.trimStart().length + 1);
    }
    const key = match[1];
    const start = pos + match[0].length;
    const quote = text[start];

    if (quote === '"' || quote === "'" || quote === "`") {
      let close = -1;
      for (let i = start + 1; i < text.length; i++) {
        if (quote === '"' && text[i] === "\\") i++;
        else if (text[i] === quote) {
          close = i;
          break;
        }
      }
      if (close === -1) throw errorAt(`The value of ${key} has no closing quote.`, line, start - pos + 1);
      const body = text.slice(start + 1, close);
      const closeLine = line + (body.match(/\n/g)?.length ?? 0);
      const after = text.indexOf("\n", close);
      const restEnd = after === -1 ? text.length : after;
      if (!/^\s*(#.*)?$/.test(text.slice(close + 1, restEnd))) {
        const closeColumn = close - text.lastIndexOf("\n", close - 1);
        throw errorAt(`Unexpected text after the closing quote of ${key}.`, closeLine, closeColumn + 1);
      }
      setOwn(result, key, quote === '"' ? unescapeDouble(body) : body);
      pos = restEnd + 1;
      line = closeLine + 1;
      continue;
    }

    // An unquoted value ends at a # that follows whitespace.
    setOwn(result, key, raw.slice(match[0].length).replace(/\s+#.*$/, "").trim());
    pos = lineEnd + 1;
    line++;
  }
  return result;
}

const SAFE_VALUE = /^[A-Za-z0-9_./:@%+,=-]+$/;

const quoteEnvValue = (value: string) => {
  if (value === "" || SAFE_VALUE.test(value)) return value;
  // Single quotes keep the value literal, so $ and # need no escapes.
  if (!/['\n\r]/.test(value)) return `'${value}'`;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
};

/** Writes KEY=value lines. Values are quoted only when they need it. */
export function formatEnv(entries: readonly (readonly [string, string])[]): string {
  return entries.map(([key, value]) => `${key}=${quoteEnvValue(value)}`).join("\n") + (entries.length ? "\n" : "");
}

/** Turns a path such as ["database", "maxPool"] into an UPPER_SNAKE key such as DATABASE__MAX_POOL. */
export function envKey(path: readonly (string | number)[], nesting: EnvNesting): string {
  return path
    .map((part) =>
      String(part)
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^A-Za-z0-9_]+/g, "_")
        .toUpperCase(),
    )
    .join(nesting);
}
