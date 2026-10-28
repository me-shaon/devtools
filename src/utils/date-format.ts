// Translates date format strings between Go layouts, strftime (C, Python, Ruby), Java/Unicode
// patterns, date-fns, Moment.js/Day.js, PHP date(), and .NET custom formats.
//
// Every dialect parses into the same list of parts (literal text, fields, fractions, and raw
// tokens that only the source dialect knows). Every dialect then emits from that list. When a
// target has no exact token, the emitter uses the closest one and returns a warning for it.

export type Dialect = "go" | "c" | "python" | "ruby" | "java" | "datefns" | "moment" | "php" | "dotnet";

export const DIALECTS: { id: Dialect; label: string }[] = [
  { id: "go", label: "Go" },
  { id: "c", label: "C strftime" },
  { id: "python", label: "Python strftime" },
  { id: "ruby", label: "Ruby strftime" },
  { id: "java", label: "Java / Kotlin / Swift" },
  { id: "datefns", label: "date-fns" },
  { id: "moment", label: "Moment.js / Day.js" },
  { id: "php", label: "PHP date()" },
  { id: "dotnet", label: ".NET" },
];

export const DIALECT_LABELS = Object.fromEntries(DIALECTS.map((d) => [d.id, d.label])) as Record<Dialect, string>;

export type FieldId =
  | "year" | "year2" | "isoWeekYear" | "isoWeek" | "quarter"
  | "month" | "month2" | "monthShort" | "monthLong"
  | "day" | "day2" | "daySpace" | "daySuffix"
  | "dayOfYear" | "dayOfYear3" | "dayOfYearSpace" | "dayOfYear0"
  | "weekdayShort" | "weekdayLong" | "weekdayIso" | "weekday0"
  | "hour" | "hour2" | "hourSpace" | "hour12" | "hour12_2" | "hour12Space"
  | "minute" | "minute2" | "second" | "second2"
  | "ampm" | "ampmLower"
  | "offset" | "offsetColon" | "offsetHour" | "offsetZ" | "offsetColonZ" | "offsetHourZ"
  | "zoneAbbr" | "zoneId"
  | "unix" | "unixMs";

export const FIELD_LABELS: Record<FieldId, string> = {
  year: "Year, 4 digits",
  year2: "Year, 2 digits",
  isoWeekYear: "ISO week-numbering year",
  isoWeek: "ISO week number, 2 digits",
  quarter: "Quarter (1 to 4)",
  month: "Month (1 to 12)",
  month2: "Month, 2 digits",
  monthShort: "Month name, short (Jan)",
  monthLong: "Month name (January)",
  day: "Day of month (1 to 31)",
  day2: "Day of month, 2 digits",
  daySpace: "Day of month, padded with a space",
  daySuffix: "Ordinal suffix (st, nd, rd, th)",
  dayOfYear: "Day of year (1 to 366)",
  dayOfYear3: "Day of year, 3 digits",
  dayOfYearSpace: "Day of year, padded with spaces",
  dayOfYear0: "Day of year from 0 (0 to 365)",
  weekdayShort: "Weekday name, short (Mon)",
  weekdayLong: "Weekday name (Monday)",
  weekdayIso: "Weekday number, Monday is 1",
  weekday0: "Weekday number, Sunday is 0",
  hour: "Hour, 24-hour (0 to 23)",
  hour2: "Hour, 24-hour, 2 digits",
  hourSpace: "Hour, 24-hour, padded with a space",
  hour12: "Hour, 12-hour (1 to 12)",
  hour12_2: "Hour, 12-hour, 2 digits",
  hour12Space: "Hour, 12-hour, padded with a space",
  minute: "Minute (0 to 59)",
  minute2: "Minute, 2 digits",
  second: "Second (0 to 59)",
  second2: "Second, 2 digits",
  ampm: "AM or PM",
  ampmLower: "am or pm",
  offset: "UTC offset (-0700)",
  offsetColon: "UTC offset (-07:00)",
  offsetHour: "UTC offset, hours only (-07)",
  offsetZ: "UTC offset, Z for UTC (-0700)",
  offsetColonZ: "UTC offset, Z for UTC (-07:00)",
  offsetHourZ: "UTC offset, Z for UTC (-07)",
  zoneAbbr: "Time zone abbreviation (MST)",
  zoneId: "Time zone ID (America/Denver)",
  unix: "Unix time in seconds",
  unixMs: "Unix time in milliseconds",
};

export type Part =
  | { kind: "literal"; text: string; src?: string }
  | { kind: "field"; field: FieldId; src?: string }
  /** Fractional seconds. `sep` is the "." or "," before the digits. `trim` drops trailing zeros. */
  | { kind: "fraction"; digits: number; trim: boolean; sep: string; src?: string }
  /** A token only the source dialect has, such as the era or a locale's date format. */
  | { kind: "raw"; dialect: Dialect; text: string; label: string; src?: string };

export interface ParseResult {
  parts: Part[];
  warnings: string[];
}

export interface EmitResult {
  format: string;
  warnings: string[];
}

/** One row of the token table: the source text and what it means. */
export const describePart = (part: Part): string => {
  switch (part.kind) {
    case "literal":
      return "Text";
    case "field":
      return FIELD_LABELS[part.field];
    case "fraction":
      return `Fractional seconds, ${part.digits} digit${part.digits === 1 ? "" : "s"}${part.trim ? ", trailing zeros removed" : ""}`;
    case "raw":
      return part.label;
  }
};

// ---------------------------------------------------------------------------------------------
// Parsing helpers

class PartList {
  parts: Part[] = [];
  warnings: string[] = [];

  literal(text: string, src = text) {
    if (!text && !src) return;
    const last = this.parts[this.parts.length - 1];
    if (last?.kind === "literal") {
      last.text += text;
      last.src = (last.src ?? "") + src;
    } else {
      this.parts.push({ kind: "literal", text, src });
    }
  }

  field(field: FieldId, src: string) {
    this.parts.push({ kind: "field", field, src });
  }

  fraction(digits: number, trim: boolean, src: string, sep = "") {
    this.parts.push({ kind: "fraction", digits, trim, sep, src });
  }

  raw(dialect: Dialect, text: string, label: string) {
    this.parts.push({ kind: "raw", dialect, text, label, src: text });
  }

  warn(message: string) {
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }

  /** Moves a "." or "," right before a fraction into the fraction, so Go can emit `.000`. */
  done(): ParseResult {
    const parts: Part[] = [];
    for (const part of this.parts) {
      const prev = parts[parts.length - 1];
      if (part.kind === "fraction" && !part.sep && prev?.kind === "literal" && /[.,]$/.test(prev.text)) {
        const sep = prev.text.slice(-1);
        prev.text = prev.text.slice(0, -1);
        prev.src = prev.src?.endsWith(sep) ? prev.src.slice(0, -1) : prev.src;
        if (!prev.text) parts.pop();
        parts.push({ ...part, sep, src: `${sep}${part.src ?? ""}` });
      } else {
        parts.push(part);
      }
    }
    return { parts, warnings: this.warnings };
  }
}

const isLetter = (c: string | undefined) => !!c && /[A-Za-z]/.test(c);
const isDigit = (c: string | undefined) => !!c && c >= "0" && c <= "9";

const runLength = (s: string, i: number) => {
  let j = i;
  while (s[j] === s[i]) j++;
  return j - i;
};

// ---------------------------------------------------------------------------------------------
// Go

const GO_PREFIX_TOKENS: [string, FieldId | null, string?][] = [
  ["January", "monthLong"],
  ["Jan", "monthShort"],
  ["Monday", "weekdayLong"],
  ["Mon", "weekdayShort"],
  ["MST", "zoneAbbr"],
  ["2006", "year"],
  ["002", "dayOfYear3"],
  ["01", "month2"],
  ["02", "day2"],
  ["03", "hour12_2"],
  ["04", "minute2"],
  ["05", "second2"],
  ["06", "year2"],
  ["15", "hour2"],
  ["__2", "dayOfYearSpace"],
  ["_2", "daySpace"],
  ["PM", "ampm"],
  ["pm", "ampmLower"],
  ["-070000", null, "UTC offset with seconds (-070000)"],
  ["-07:00:00", null, "UTC offset with seconds (-07:00:00)"],
  ["-0700", "offset"],
  ["-07:00", "offsetColon"],
  ["-07", "offsetHour"],
  ["Z070000", null, "UTC offset with seconds, Z for UTC (Z070000)"],
  ["Z07:00:00", null, "UTC offset with seconds, Z for UTC (Z07:00:00)"],
  ["Z0700", "offsetZ"],
  ["Z07:00", "offsetColonZ"],
  ["Z07", "offsetHourZ"],
  ["1", "month"],
  ["2", "day"],
  ["3", "hour12"],
  ["4", "minute"],
  ["5", "second"],
];

// Mirrors nextStdChunk in Go's time/format.go, including its order of checks.
function parseGo(layout: string): ParseResult {
  const out = new PartList();
  let i = 0;
  while (i < layout.length) {
    const c = layout[i];
    // "_2006" is a literal "_" and then the year.
    if (c === "_" && layout.startsWith("_2006", i)) {
      out.literal("_");
      i++;
      continue;
    }
    // "002" wins only when "0" is not followed by 1 to 6.
    if (c === "0" && layout[i + 1] >= "1" && layout[i + 1] <= "6") {
      const token = layout.slice(i, i + 2);
      out.field(GO_PREFIX_TOKENS.find(([t]) => t === token)![1]!, token);
      i += 2;
      continue;
    }
    if ((c === "." || c === ",") && (layout[i + 1] === "0" || layout[i + 1] === "9")) {
      const n = runLength(layout, i + 1);
      if (!isDigit(layout[i + 1 + n])) {
        const src = layout.slice(i, i + 1 + n);
        if (n > 9) out.warn(`Go supports at most 9 fractional digits. ${src} prints 9.`);
        out.fraction(Math.min(n, 9), layout[i + 1] === "9", src, c);
        i += 1 + n;
        continue;
      }
    }
    const match = GO_PREFIX_TOKENS.find(([token]) => layout.startsWith(token, i));
    if (match) {
      const [token, field, label] = match;
      if (field) out.field(field, token);
      else out.raw("go", token, label!);
      i += token.length;
      continue;
    }
    out.literal(c);
    i++;
  }
  return out.done();
}

// ---------------------------------------------------------------------------------------------
// strftime (C, Python, and Ruby share one parser; the emitters differ)

const STRFTIME_FIELDS: Record<string, { field: FieldId; minus?: FieldId; under?: FieldId; zero?: FieldId }> = {
  Y: { field: "year" },
  y: { field: "year2" },
  G: { field: "isoWeekYear" },
  V: { field: "isoWeek" },
  m: { field: "month2", minus: "month" },
  b: { field: "monthShort" },
  h: { field: "monthShort" },
  B: { field: "monthLong" },
  d: { field: "day2", minus: "day", under: "daySpace" },
  e: { field: "daySpace", minus: "day", zero: "day2" },
  j: { field: "dayOfYear3", minus: "dayOfYear", under: "dayOfYearSpace" },
  a: { field: "weekdayShort" },
  A: { field: "weekdayLong" },
  u: { field: "weekdayIso" },
  w: { field: "weekday0" },
  H: { field: "hour2", minus: "hour", under: "hourSpace" },
  k: { field: "hourSpace", minus: "hour", zero: "hour2" },
  I: { field: "hour12_2", minus: "hour12", under: "hour12Space" },
  l: { field: "hour12Space", minus: "hour12", zero: "hour12_2" },
  M: { field: "minute2", minus: "minute" },
  S: { field: "second2", minus: "second" },
  p: { field: "ampm" },
  P: { field: "ampmLower" },
  z: { field: "offset" },
  Z: { field: "zoneAbbr" },
  s: { field: "unix" },
  Q: { field: "unixMs" },
};

const STRFTIME_COMPOSITES: Record<string, string> = {
  F: "%Y-%m-%d",
  T: "%H:%M:%S",
  R: "%H:%M",
  D: "%m/%d/%y",
  r: "%I:%M:%S %p",
};

const STRFTIME_RAW: Record<string, string> = {
  c: "Locale date and time",
  x: "Locale date",
  X: "Locale time",
  C: "Century (20)",
  g: "ISO week-numbering year, 2 digits",
  U: "Week of year, Sunday first",
  W: "Week of year, Monday first",
  "+": "Date and time in date(1) format",
  v: "Date as 2-Jan-2006 (Ruby)",
};

function parseStrftime(format: string, dialect: Dialect): ParseResult {
  const out = new PartList();
  let i = 0;
  while (i < format.length) {
    const c = format[i];
    if (c !== "%") {
      out.literal(c);
      i++;
      continue;
    }
    const m = /^%([-_0^#]*)(\d*)(:{0,3})(.?)/s.exec(format.slice(i))!;
    const [src, flags, width, colons, conv] = m;
    i += src.length;
    if (!conv) {
      out.warn("The format ends with a lone %.");
      out.literal("%", src);
      continue;
    }
    if (flags.includes("^") || flags.includes("#")) {
      out.warn(`The ${flags.includes("^") ? "^" : "#"} flag in ${src} changes letter case. Other dialects cannot do that, so it was ignored.`);
    }
    if (conv === "%") {
      out.literal("%", src);
    } else if (conv === "n" || conv === "t") {
      out.literal(conv === "n" ? "\n" : "\t", src);
    } else if (conv === "z") {
      if (colons === "") out.field("offset", src);
      else if (colons === ":") out.field("offsetColon", src);
      else out.raw(dialect, src, "UTC offset with seconds (-07:00:00)");
    } else if (conv === "f") {
      out.fraction(6, false, src);
    } else if (conv === "L") {
      out.fraction(width ? Number(width) : 3, false, src);
    } else if (conv === "N") {
      out.fraction(width ? Number(width) : 9, false, src);
    } else if (STRFTIME_COMPOSITES[conv]) {
      const inner = parseStrftime(STRFTIME_COMPOSITES[conv], dialect).parts;
      for (const part of inner) {
        if (part.kind === "literal") out.literal(part.text);
        else out.parts.push(part);
      }
    } else if (STRFTIME_FIELDS[conv]) {
      const entry = STRFTIME_FIELDS[conv];
      let field = entry.field;
      if (flags.includes("-") && entry.minus) field = entry.minus;
      else if (flags.includes("_") && entry.under) field = entry.under;
      else if (flags.includes("0") && entry.zero) field = entry.zero;
      else if (/[-_0]/.test(flags)) out.warn(`The padding flag in ${src} has no effect on other dialects. It was ignored.`);
      if (width) out.warn(`The width in ${src} was ignored.`);
      out.field(field, src);
    } else if (STRFTIME_RAW[conv]) {
      out.raw(dialect, src, STRFTIME_RAW[conv]);
    } else {
      out.warn(`${src} is not a known strftime directive. It was read as text.`);
      out.literal(src);
    }
  }
  return out.done();
}

// ---------------------------------------------------------------------------------------------
// Java DateTimeFormatter and date-fns: Unicode-style letters, quoted text in '...'

type LetterRule = (count: number) => FieldId | { fraction: number } | { raw: string } | null;

const nameOrNumber = (count: number, num: FieldId, num2: FieldId) => (count === 1 ? num : count === 2 ? num2 : null);
const monthRule: LetterRule = (n) => (n === 1 ? "month" : n === 2 ? "month2" : n === 3 ? "monthShort" : n === 4 ? "monthLong" : { raw: "Month, narrow (J)" });
const textWeekday: LetterRule = (n) => (n <= 3 ? "weekdayShort" : n === 4 ? "weekdayLong" : { raw: "Weekday name, narrow" });

const JAVA_LETTERS: Partial<Record<string, LetterRule>> = {
  G: () => ({ raw: "Era (AD)" }),
  u: (n) => (n === 2 ? "year2" : "year"),
  y: (n) => (n === 2 ? "year2" : "year"),
  Y: (n) => (n === 2 ? { raw: "Week-based year, 2 digits" } : "isoWeekYear"),
  Q: (n) => (n === 1 ? "quarter" : { raw: n === 2 ? "Quarter, 2 digits (01)" : "Quarter as text (Q1)" }),
  q: (n) => (n === 1 ? "quarter" : { raw: n === 2 ? "Quarter, 2 digits (01)" : "Quarter as text (Q1)" }),
  M: monthRule,
  L: monthRule,
  w: (n) => (n <= 2 ? "isoWeek" : null),
  W: () => ({ raw: "Week of month" }),
  E: textWeekday,
  e: (n) => (n <= 2 ? "weekdayIso" : textWeekday(n - 1)),
  c: (n) => (n === 1 ? "weekdayIso" : textWeekday(n - 1)),
  F: () => ({ raw: "Aligned week of month" }),
  d: (n) => nameOrNumber(n, "day", "day2"),
  D: (n) => (n === 1 ? "dayOfYear" : n === 3 ? "dayOfYear3" : n === 2 ? { raw: "Day of year, at least 2 digits" } : null),
  a: (n) => (n === 1 ? "ampm" : null),
  B: () => ({ raw: "Day period (in the morning)" }),
  h: (n) => nameOrNumber(n, "hour12", "hour12_2"),
  K: (n) => (n <= 2 ? { raw: "Hour, 12-hour (0 to 11)" } : null),
  k: (n) => (n <= 2 ? { raw: "Hour, 24-hour (1 to 24)" } : null),
  H: (n) => nameOrNumber(n, "hour", "hour2"),
  m: (n) => nameOrNumber(n, "minute", "minute2"),
  s: (n) => nameOrNumber(n, "second", "second2"),
  S: (n) => (n <= 9 ? { fraction: n } : null),
  A: () => ({ raw: "Milliseconds of day" }),
  n: () => ({ raw: "Nanoseconds of second" }),
  N: () => ({ raw: "Nanoseconds of day" }),
  V: (n) => (n === 2 ? "zoneId" : null),
  v: () => ({ raw: "Generic time zone name" }),
  z: (n) => (n <= 3 ? "zoneAbbr" : n === 4 ? { raw: "Time zone name (Mountain Standard Time)" } : null),
  O: () => ({ raw: "Localized offset (GMT-7)" }),
  X: (n) => (n === 1 ? "offsetHourZ" : n === 2 ? "offsetZ" : n === 3 ? "offsetColonZ" : n <= 5 ? { raw: "UTC offset with seconds, Z for UTC" } : null),
  x: (n) => (n === 1 ? "offsetHour" : n === 2 ? "offset" : n === 3 ? "offsetColon" : n <= 5 ? { raw: "UTC offset with seconds" } : null),
  Z: (n) => (n <= 3 ? "offset" : n === 4 ? { raw: "Localized offset (GMT-07:00)" } : n === 5 ? "offsetColonZ" : null),
};

const DATEFNS_LETTERS: Partial<Record<string, LetterRule>> = {
  G: () => ({ raw: "Era (AD)" }),
  y: (n) => (n === 2 ? "year2" : "year"),
  Y: () => ({ raw: "Local week-numbering year" }),
  R: (n) => (n === 2 ? { raw: "ISO week-numbering year, 2 digits" } : "isoWeekYear"),
  u: () => ({ raw: "Extended year" }),
  Q: (n) => (n === 1 ? "quarter" : { raw: n === 2 ? "Quarter, 2 digits (01)" : "Quarter as text (Q1)" }),
  q: (n) => (n === 1 ? "quarter" : { raw: n === 2 ? "Quarter, 2 digits (01)" : "Quarter as text (Q1)" }),
  M: monthRule,
  L: monthRule,
  w: () => ({ raw: "Local week of year" }),
  I: (n) => (n <= 2 ? "isoWeek" : null),
  d: (n) => nameOrNumber(n, "day", "day2"),
  D: (n) => (n === 1 ? "dayOfYear" : n === 3 ? "dayOfYear3" : n === 2 ? { raw: "Day of year, at least 2 digits" } : null),
  E: textWeekday,
  i: (n) => (n === 1 ? "weekdayIso" : n === 2 ? { raw: "ISO weekday, 2 digits" } : textWeekday(n - 1)),
  e: (n) => (n <= 2 ? { raw: "Local weekday number" } : textWeekday(n - 1)),
  c: (n) => (n <= 2 ? { raw: "Local weekday number" } : textWeekday(n - 1)),
  a: (n) => (n <= 2 ? "ampm" : n === 3 ? "ampmLower" : { raw: "AM or PM, long (a.m.)" }),
  b: () => ({ raw: "AM, PM, noon, or midnight" }),
  B: () => ({ raw: "Day period (in the morning)" }),
  h: (n) => nameOrNumber(n, "hour12", "hour12_2"),
  K: (n) => (n <= 2 ? { raw: "Hour, 12-hour (0 to 11)" } : null),
  k: (n) => (n <= 2 ? { raw: "Hour, 24-hour (1 to 24)" } : null),
  H: (n) => nameOrNumber(n, "hour", "hour2"),
  m: (n) => nameOrNumber(n, "minute", "minute2"),
  s: (n) => nameOrNumber(n, "second", "second2"),
  S: (n) => ({ fraction: n }),
  X: (n) => (n === 1 ? "offsetHourZ" : n === 2 ? "offsetZ" : n === 3 ? "offsetColonZ" : { raw: "UTC offset with seconds, Z for UTC" }),
  x: (n) => (n === 1 ? "offsetHour" : n === 2 ? "offset" : n === 3 ? "offsetColon" : { raw: "UTC offset with seconds" }),
  O: () => ({ raw: "Localized offset (GMT-7)" }),
  z: (n) => (n <= 3 ? "zoneAbbr" : { raw: "Localized offset (GMT-07:00)" }),
  t: () => "unix",
  T: () => "unixMs",
  P: () => ({ raw: "Locale date" }),
  p: () => ({ raw: "Locale time" }),
};

// Letters that accept an "o" suffix in date-fns: 1st, 2nd, and so on.
const DATEFNS_ORDINAL = new Set(["y", "R", "Q", "q", "M", "L", "w", "I", "d", "D", "i", "e", "c", "h", "H", "K", "k", "m", "s"]);

function parseUnicode(format: string, dialect: "java" | "datefns"): ParseResult {
  const out = new PartList();
  const name = DIALECT_LABELS[dialect];
  const letters = dialect === "java" ? JAVA_LETTERS : DATEFNS_LETTERS;
  let i = 0;
  while (i < format.length) {
    const c = format[i];
    if (c === "'") {
      if (format[i + 1] === "'") {
        out.literal("'", "''");
        i += 2;
        continue;
      }
      let j = i + 1;
      let text = "";
      while (j < format.length) {
        if (format[j] === "'") {
          if (format[j + 1] === "'") {
            text += "'";
            j += 2;
            continue;
          }
          break;
        }
        text += format[j++];
      }
      if (j >= format.length) out.warn("A quote is not closed. The rest of the format was read as text.");
      out.literal(text, format.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (dialect === "java" && (c === "[" || c === "]")) {
      out.warn("Optional sections in [ ] only affect parsing. The brackets were removed.");
      out.literal("", c);
      i++;
      continue;
    }
    if (dialect === "java" && (c === "{" || c === "}" || c === "#")) {
      out.warn(`Java reserves ${c}. Quote it as '${c}'.`);
      out.literal(c);
      i++;
      continue;
    }
    if (!isLetter(c)) {
      out.literal(c);
      i++;
      continue;
    }
    // Java pad modifier: "ppd" is the day padded with spaces to width 2.
    if (dialect === "java" && c === "p") {
      const pads = runLength(format, i);
      const letter = format[i + pads];
      const n = isLetter(letter) ? runLength(format, i + pads) : 0;
      const src = format.slice(i, i + pads + n);
      const padded: Record<string, FieldId> = { d: "day", H: "hour", h: "hour12", D: "dayOfYear" };
      const spaced: Record<string, FieldId> = { d: "daySpace", H: "hourSpace", h: "hour12Space", D: "dayOfYearSpace" };
      const width = letter === "D" ? 3 : 2;
      if (n === 1 && padded[letter] && pads === width) out.field(spaced[letter], src);
      else out.raw("java", src, "Padded with spaces");
      i += pads + n;
      continue;
    }
    const n = runLength(format, i);
    let src = format.slice(i, i + n);
    i += n;
    if (dialect === "datefns" && format[i] === "o" && DATEFNS_ORDINAL.has(c) && n === 1) {
      src += "o";
      i++;
      if (c === "d") {
        out.field("day", src);
        out.field("daySuffix", "");
      } else {
        out.raw("datefns", src, "Ordinal number (1st)");
      }
      continue;
    }
    const rule = letters[c];
    const result = rule ? rule(n) : null;
    if (dialect === "datefns" && (src === "YY" || src === "YYYY")) out.warn(`date-fns throws on ${src} unless you pass useAdditionalWeekYearTokens: true. For the calendar year, use ${src.toLowerCase()}.`);
    if (dialect === "datefns" && (src === "D" || src === "DD")) out.warn(`date-fns throws on ${src} unless you pass useAdditionalDayOfYearTokens: true. For the day of month, use ${src.toLowerCase()}.`);
    if (result === null) {
      out.warn(
        rule
          ? `${name} does not accept ${src} (too many letters).`
          : dialect === "java"
            ? `Java rejects the unquoted letter ${c}. Quote text as '${src}'.`
            : `date-fns throws on the unquoted letter ${c}. Quote text as '${src}'.`,
      );
      out.literal(src);
    } else if (typeof result === "string") {
      out.field(result, src);
    } else if ("fraction" in result) {
      out.fraction(result.fraction, false, src);
    } else {
      out.raw(dialect, src, result.raw);
    }
  }
  return out.done();
}

// ---------------------------------------------------------------------------------------------
// Moment.js and Day.js: tokens as in moment's formattingTokens, text in [...]

const MOMENT_TOKENS: [string, FieldId | { raw: string } | { fraction: number } | "Do"][] = [
  ["YYYYYY", { raw: "Year, 6 digits with sign" }],
  ["YYYY", "year"],
  ["YY", "year2"],
  ["GGGG", "isoWeekYear"],
  ["GG", { raw: "ISO week-numbering year, 2 digits" }],
  ["gggg", { raw: "Local week-numbering year" }],
  ["gg", { raw: "Local week-numbering year, 2 digits" }],
  ["MMMM", "monthLong"],
  ["MMM", "monthShort"],
  ["MM", "month2"],
  ["Mo", { raw: "Month, ordinal (1st)" }],
  ["M", "month"],
  ["Qo", { raw: "Quarter, ordinal (1st)" }],
  ["Q", "quarter"],
  ["DDDDo", { raw: "Day of year, ordinal" }],
  ["DDDD", "dayOfYear3"],
  ["DDDo", { raw: "Day of year, ordinal" }],
  ["DDD", "dayOfYear"],
  ["Do", "Do"],
  ["DD", "day2"],
  ["D", "day"],
  ["dddd", "weekdayLong"],
  ["ddd", "weekdayShort"],
  ["dd", { raw: "Weekday name, 2 letters (Mo)" }],
  ["do", { raw: "Weekday number, ordinal" }],
  ["d", "weekday0"],
  ["E", "weekdayIso"],
  ["e", { raw: "Local weekday number" }],
  ["WW", "isoWeek"],
  ["Wo", { raw: "ISO week, ordinal" }],
  ["W", "isoWeek"],
  ["ww", { raw: "Local week of year" }],
  ["wo", { raw: "Local week, ordinal" }],
  ["w", { raw: "Local week of year" }],
  ["HH", "hour2"],
  ["H", "hour"],
  ["hh", "hour12_2"],
  ["h", "hour12"],
  ["kk", { raw: "Hour, 24-hour (1 to 24), 2 digits" }],
  ["k", { raw: "Hour, 24-hour (1 to 24)" }],
  ["mm", "minute2"],
  ["m", "minute"],
  ["ss", "second2"],
  ["s", "second"],
  ["A", "ampm"],
  ["a", "ampmLower"],
  ["ZZ", "offset"],
  ["Z", "offsetColon"],
  ["zz", "zoneAbbr"],
  ["z", "zoneAbbr"],
  ["X", "unix"],
  ["x", "unixMs"],
  ["N", { raw: "Era (AD)" }],
  ["y", { raw: "Era year" }],
];

function parseMoment(format: string): ParseResult {
  const out = new PartList();
  let i = 0;
  while (i < format.length) {
    const c = format[i];
    if (c === "[") {
      const end = format.indexOf("]", i + 1);
      const nextOpen = format.indexOf("[", i + 1);
      if (end > i && (nextOpen === -1 || nextOpen > end)) {
        out.literal(format.slice(i + 1, end), format.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    if (c === "\\" && i + 1 < format.length) {
      out.literal(format[i + 1], format.slice(i, i + 2));
      i += 2;
      continue;
    }
    if (c === "S") {
      const n = Math.min(runLength(format, i), 9);
      out.fraction(n, false, format.slice(i, i + n));
      i += n;
      continue;
    }
    const match = MOMENT_TOKENS.find(([token]) => format.startsWith(token, i));
    if (!match) {
      out.literal(c);
      i++;
      continue;
    }
    const [token, meaning] = match;
    i += token.length;
    if (meaning === "Do") {
      out.field("day", token);
      out.field("daySuffix", "");
    } else if (typeof meaning === "string") {
      out.field(meaning, token);
    } else if ("raw" in meaning) {
      out.raw("moment", token, meaning.raw);
    } else {
      out.fraction(meaning.fraction, false, token);
    }
  }
  return out.done();
}

// ---------------------------------------------------------------------------------------------
// PHP date(): one letter per token, backslash escapes

const PHP_FIELDS: Record<string, FieldId> = {
  d: "day2", D: "weekdayShort", j: "day", l: "weekdayLong", N: "weekdayIso", S: "daySuffix", w: "weekday0", z: "dayOfYear0",
  W: "isoWeek", F: "monthLong", m: "month2", M: "monthShort", n: "month", o: "isoWeekYear", Y: "year", y: "year2",
  a: "ampmLower", A: "ampm", g: "hour12", G: "hour", h: "hour12_2", H: "hour2", i: "minute2", s: "second2",
  e: "zoneId", O: "offset", P: "offsetColon", p: "offsetColonZ", T: "zoneAbbr", U: "unix",
};

const PHP_RAW: Record<string, string> = {
  t: "Days in the month",
  L: "Leap year (1 or 0)",
  X: "Year with sign, at least 4 digits",
  x: "Year, at least 4 digits, sign when needed",
  B: "Swatch Internet time",
  I: "Daylight saving time (1 or 0)",
  Z: "UTC offset in seconds",
};

const PHP_COMPOSITES: Record<string, string> = { c: "Y-m-d\\TH:i:sP", r: "D, d M Y H:i:s O" };

function parsePhp(format: string): ParseResult {
  const out = new PartList();
  let i = 0;
  while (i < format.length) {
    const c = format[i];
    if (c === "\\") {
      if (i + 1 < format.length) out.literal(format[i + 1], format.slice(i, i + 2));
      else out.literal("\\");
      i += 2;
      continue;
    }
    i++;
    if (PHP_FIELDS[c]) out.field(PHP_FIELDS[c], c);
    else if (c === "u") out.fraction(6, false, c);
    else if (c === "v") out.fraction(3, false, c);
    else if (PHP_RAW[c]) out.raw("php", c, PHP_RAW[c]);
    else if (PHP_COMPOSITES[c]) {
      for (const part of parsePhp(PHP_COMPOSITES[c]).parts) {
        if (part.kind === "literal") out.literal(part.text);
        else out.parts.push({ ...part, src: part.src });
      }
    } else out.literal(c);
  }
  return out.done();
}

// ---------------------------------------------------------------------------------------------
// .NET custom date and time format strings

function parseDotnet(format: string, whole = true): ParseResult {
  const out = new PartList();
  if (whole && format.length === 1 && isLetter(format)) {
    out.warn(`A single letter such as ${format} is a .NET standard format, not a custom one. Write %${format} for the custom specifier.`);
    out.raw("dotnet", format, "Standard format string");
    return out.done();
  }
  let i = 0;
  while (i < format.length) {
    const c = format[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      let text = "";
      while (j < format.length && format[j] !== c) {
        if (format[j] === "\\" && j + 1 < format.length) j++;
        text += format[j++];
      }
      if (j >= format.length) out.warn("A quote is not closed. The rest of the format was read as text.");
      out.literal(text, format.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (c === "\\") {
      if (i + 1 < format.length) out.literal(format[i + 1], format.slice(i, i + 2));
      i += 2;
      continue;
    }
    if (c === "%") {
      out.literal("", "%");
      i++;
      continue;
    }
    if (!"dfFghHKmMstyz".includes(c)) {
      out.literal(c);
      i++;
      continue;
    }
    const n = runLength(format, i);
    const src = format.slice(i, i + n);
    i += n;
    const pick = (...fields: (FieldId | null)[]) => fields[Math.min(n, fields.length) - 1];
    let field: FieldId | null = null;
    switch (c) {
      case "d": field = pick("day", "day2", "weekdayShort", "weekdayLong"); break;
      case "M": field = pick("month", "month2", "monthShort", "monthLong"); break;
      case "y": field = n === 1 ? null : n === 2 ? "year2" : "year"; break;
      case "h": field = pick("hour12", "hour12_2"); break;
      case "H": field = pick("hour", "hour2"); break;
      case "m": field = pick("minute", "minute2"); break;
      case "s": field = pick("second", "second2"); break;
      case "t": field = n === 1 ? null : "ampm"; break;
      case "z": field = n === 1 ? null : n === 2 ? "offsetHour" : "offsetColon"; break;
      case "K": field = "offsetColonZ"; break;
      case "f":
      case "F":
        if (n > 7) out.warn(".NET supports at most 7 fractional digits.");
        out.fraction(Math.min(n, 7), c === "F", src);
        continue;
    }
    if (field) out.field(field, src);
    else if (c === "y") out.raw("dotnet", src, "Year, 2 digits without padding");
    else if (c === "t") out.raw("dotnet", src, "First letter of AM or PM");
    else if (c === "z") out.raw("dotnet", src, "UTC offset, hours without padding (-7)");
    else out.raw("dotnet", src, "Era (A.D.)");
  }
  return out.done();
}

// ---------------------------------------------------------------------------------------------
// Public parsing entry points

export function parseFormat(format: string, dialect: Dialect): ParseResult {
  switch (dialect) {
    case "go":
      return parseGo(format);
    case "c":
    case "python":
    case "ruby":
      return parseStrftime(format, dialect);
    case "java":
    case "datefns":
      return parseUnicode(format, dialect);
    case "moment":
      return parseMoment(format);
    case "php":
      return parsePhp(format);
    case "dotnet":
      return parseDotnet(format);
  }
}

const unquoted = (format: string, open: string, close: string) => {
  let result = "";
  let depth = false;
  for (const c of format) {
    if (!depth && c === open) depth = true;
    else if (depth && c === close) depth = false;
    else if (!depth) result += c;
  }
  return result;
};

/** Guesses the dialect of a format string. Falls back to Java, the most common Unicode style. */
export function detectDialect(format: string): Dialect {
  if (/%[-_0^#]*\d*:{0,3}[A-Za-z+]/.test(format)) {
    if (/%\d*[LNQ]/.test(format)) return "ruby";
    if (/%f/.test(format)) return "python";
    return "c";
  }
  const quotedSingle = unquoted(format, "'", "'");
  const plain = unquoted(quotedSingle, '"', '"');
  const bare = unquoted(format, "[", "]");
  if (/[yYdDHhMms]/.test(bare) === false || /2006|15:04|:04|04:05|Z07|-07:?00|January|Monday|\bJan\b|\bMon\b|MST|01\/02|\b_2\b|\.000|\.999/.test(format)) {
    if (!/[yY]{2}|[dD]{2}|HH|mm|ss/.test(plain) && /\d|January|Jan|Monday|Mon|MST|PM|pm/.test(format)) return "go";
  }
  if (/\\[A-Za-z]/.test(format) && !/[yd]{2}/.test(plain)) return "php";
  if (/\[[^\]]*\]/.test(format) && /YY|DD|HH|mm/.test(bare)) return "moment";
  if (/YYYY|YY/.test(plain) && /DD|\bD\b|Do/.test(plain)) return "moment";
  if (/\bDo\b|\bA\b/.test(plain) && /YY|MM|DD/.test(plain)) return "moment";
  // PHP: letters never repeat, and at least one PHP-only letter appears.
  const phpLetters = format.replace(/\\./g, "");
  if (!/['[]/.test(format) && !/([A-Za-z])\1/.test(phpLetters) &&/[YijnGgFlNUocr]/.test(phpLetters) && /[A-Za-z]/.test(phpLetters)) return "php";
  if (/f|F|tt|K/.test(plain) || /"/.test(format)) return "dotnet";
  if (/\bdo\b|aaa|RRRR|II|\bi\b/.test(quotedSingle)) return "datefns";
  return "java";
}

// ---------------------------------------------------------------------------------------------
// Emitting

/** A token table entry: the closest token, and a warning when it is not exact. */
type Mapping = string | { t: string | null; w: string };

const goNoToken = (what: string, code: string): Mapping => ({ t: null, w: `Go has no ${what} layout value. Use ${code} in code.` });

const GO_MAP: Record<FieldId, Mapping> = {
  year: "2006", year2: "06",
  isoWeekYear: goNoToken("ISO week-numbering year", "t.ISOWeek()"),
  isoWeek: goNoToken("ISO week", "t.ISOWeek()"),
  quarter: goNoToken("quarter", "(t.Month()+2)/3"),
  month: "1", month2: "01", monthShort: "Jan", monthLong: "January",
  day: "2", day2: "02", daySpace: "_2",
  daySuffix: goNoToken("ordinal suffix", "a helper function"),
  dayOfYear: { t: "002", w: "Go has no unpadded day of year. Used 002 (3 digits, Go 1.20 or later)." },
  dayOfYear3: { t: "002", w: "002 needs Go 1.20 or later. Older versions: use t.YearDay()." },
  dayOfYearSpace: { t: "__2", w: "__2 needs Go 1.20 or later. Older versions: use t.YearDay()." },
  dayOfYear0: { t: "002", w: "Go counts the day of year from 1, not 0. 002 needs Go 1.20 or later." },
  weekdayShort: "Mon", weekdayLong: "Monday",
  weekdayIso: goNoToken("weekday number", "int(t.Weekday())"),
  weekday0: goNoToken("weekday number", "int(t.Weekday())"),
  hour: { t: "15", w: "Go has no unpadded 24-hour hour. Used 15 (2 digits)." },
  hour2: "15",
  hourSpace: { t: "15", w: "Go has no space-padded hour. Used 15 (2 digits)." },
  hour12: "3", hour12_2: "03",
  hour12Space: { t: "3", w: "Go has no space-padded hour. Used 3 (no padding)." },
  minute: "4", minute2: "04", second: "5", second2: "05",
  ampm: "PM", ampmLower: "pm",
  offset: "-0700", offsetColon: "-07:00", offsetHour: "-07",
  offsetZ: "Z0700", offsetColonZ: "Z07:00", offsetHourZ: "Z07",
  zoneAbbr: "MST",
  zoneId: goNoToken("time zone ID", "t.Location().String()"),
  unix: goNoToken("Unix time", "t.Unix()"),
  unixMs: goNoToken("Unix time", "t.UnixMilli()"),
};

/** Notes for strftime extensions that are not in C99, per dialect. */
const strftimeExtension = (dialect: "c" | "python" | "ruby", token: string, what = "a GNU and BSD extension"): Mapping => {
  if (dialect === "ruby") return token;
  if (dialect === "python") return { t: token, w: `Python passes ${token} to the C library. It works on Linux and macOS, not on Windows.` };
  return { t: token, w: `${token} is ${what}. Windows does not support it.` };
};

function strftimeMap(dialect: "c" | "python" | "ruby"): Record<FieldId, Mapping> {
  const ext = (token: string) => strftimeExtension(dialect, token);
  const noToken = (what: string): Mapping => ({ t: null, w: `strftime has no ${what} directive. It was left out.` });
  const offsetColon: Mapping =
    dialect === "ruby" ? "%:z"
    : dialect === "python" ? { t: "%:z", w: "%:z needs Python 3.12 or later. Older versions only have %z (-0700)." }
    : { t: "%z", w: "C strftime has no colon offset. Used %z (-0700). GNU date supports %:z." };
  const colonToken = typeof offsetColon === "string" ? offsetColon : offsetColon.t!;
  const zWarning = (token: string) => `strftime prints +0000 for UTC, never Z. Used ${token}.`;
  return {
    year: "%Y", year2: "%y", isoWeekYear: "%G", isoWeek: "%V", quarter: noToken("quarter"),
    month: ext("%-m"), month2: "%m", monthShort: "%b", monthLong: "%B",
    day: ext("%-d"), day2: "%d", daySpace: "%e", daySuffix: noToken("ordinal suffix"),
    dayOfYear: ext("%-j"), dayOfYear3: "%j", dayOfYearSpace: ext("%_j"),
    dayOfYear0: { t: "%j", w: "strftime counts the day of year from 1, not 0." },
    weekdayShort: "%a", weekdayLong: "%A", weekdayIso: "%u", weekday0: "%w",
    hour: ext("%-H"), hour2: "%H", hourSpace: ext("%k"), hour12: ext("%-I"), hour12_2: "%I", hour12Space: ext("%l"),
    minute: ext("%-M"), minute2: "%M", second: ext("%-S"), second2: "%S",
    ampm: "%p",
    ampmLower: dialect === "ruby" ? "%P" : { t: "%P", w: "%P is a glibc extension. macOS and Windows do not support it." },
    offset: "%z",
    offsetColon,
    offsetHour: { t: "%z", w: "strftime has no hours-only offset. Used %z (-0700)." },
    offsetZ: { t: "%z", w: zWarning("%z") },
    offsetColonZ: { t: colonToken, w: typeof offsetColon === "string" ? zWarning(colonToken) : `${offsetColon.w} ${zWarning(colonToken)}` },
    offsetHourZ: { t: "%z", w: zWarning("%z") },
    zoneAbbr: "%Z",
    zoneId: { t: "%Z", w: "strftime has no time zone ID directive. Used %Z (abbreviation)." },
    unix: ext("%s"),
    unixMs: dialect === "ruby" ? "%Q" : { t: "%s", w: "strftime has no millisecond timestamp. Used %s (seconds)." },
  };
}

const JAVA_WEEK_NOTE = "Java YYYY and ww follow the locale's week rules. They match ISO weeks in locales such as Locale.UK. For exact ISO weeks, use IsoFields.";
const JAVA_PAD_NOTE = "The p pad modifier is Java only. Swift and ICU do not support it.";

const JAVA_MAP: Record<FieldId, Mapping> = {
  year: "yyyy", year2: "yy",
  isoWeekYear: { t: "YYYY", w: JAVA_WEEK_NOTE }, isoWeek: { t: "ww", w: JAVA_WEEK_NOTE },
  quarter: "Q",
  month: "M", month2: "MM", monthShort: "MMM", monthLong: "MMMM",
  day: "d", day2: "dd", daySpace: { t: "ppd", w: JAVA_PAD_NOTE },
  daySuffix: { t: null, w: "Java patterns have no ordinal suffix. It was left out." },
  dayOfYear: "D", dayOfYear3: "DDD", dayOfYearSpace: { t: "pppD", w: JAVA_PAD_NOTE },
  dayOfYear0: { t: "D", w: "Java counts the day of year from 1, not 0." },
  weekdayShort: "EEE", weekdayLong: "EEEE",
  weekdayIso: { t: "e", w: "e depends on the locale. Monday is 1 only where weeks start on Monday." },
  weekday0: { t: "e", w: "Java has no Sunday-is-0 weekday number. e is 1 to 7 and depends on the locale." },
  hour: "H", hour2: "HH", hourSpace: { t: "ppH", w: JAVA_PAD_NOTE },
  hour12: "h", hour12_2: "hh", hour12Space: { t: "pph", w: JAVA_PAD_NOTE },
  minute: "m", minute2: "mm", second: "s", second2: "ss",
  ampm: "a", ampmLower: { t: "a", w: "Java prints AM and PM in uppercase. Lowercase the result in code." },
  offset: "xx", offsetColon: "xxx", offsetHour: "x", offsetZ: "XX", offsetColonZ: "XXX", offsetHourZ: "X",
  zoneAbbr: "z", zoneId: "VV",
  unix: { t: null, w: "Java patterns have no Unix time letter. Use toEpochSecond() in code." },
  unixMs: { t: null, w: "Java patterns have no Unix time letter. Use toInstant().toEpochMilli() in code." },
};

const DATEFNS_MAP: Record<FieldId, Mapping> = {
  year: "yyyy", year2: "yy", isoWeekYear: "RRRR", isoWeek: "II", quarter: "Q",
  month: "M", month2: "MM", monthShort: "MMM", monthLong: "MMMM",
  day: "d", day2: "dd", daySpace: { t: "d", w: "date-fns has no space-padded day. Used d." },
  daySuffix: { t: null, w: "date-fns has an ordinal suffix only as part of do. It was left out." },
  dayOfYear: { t: "D", w: "date-fns throws on D unless you pass useAdditionalDayOfYearTokens: true." },
  dayOfYear3: "DDD",
  dayOfYearSpace: { t: "DDD", w: "date-fns has no space-padded day of year. Used DDD (3 digits)." },
  dayOfYear0: { t: "DDD", w: "date-fns counts the day of year from 1, not 0." },
  weekdayShort: "EEE", weekdayLong: "EEEE", weekdayIso: "i",
  weekday0: { t: "i", w: "date-fns has no Sunday-is-0 weekday number. Used i (Monday is 1, Sunday is 7)." },
  hour: "H", hour2: "HH", hourSpace: { t: "H", w: "date-fns has no space-padded hour. Used H." },
  hour12: "h", hour12_2: "hh", hour12Space: { t: "h", w: "date-fns has no space-padded hour. Used h." },
  minute: "m", minute2: "mm", second: "s", second2: "ss",
  ampm: "a", ampmLower: "aaa",
  offset: "xx", offsetColon: "xxx", offsetHour: "x", offsetZ: "XX", offsetColonZ: "XXX", offsetHourZ: "X",
  zoneAbbr: { t: "zzz", w: "date-fns prints GMT-7 for zzz. For names such as MST, use formatInTimeZone from date-fns-tz." },
  zoneId: { t: null, w: "date-fns has no time zone ID token. Use Intl.DateTimeFormat().resolvedOptions().timeZone." },
  unix: "t", unixMs: "T",
};

const MOMENT_Z_NOTE = "Moment.js and Day.js print +00:00 for UTC, never Z.";

const MOMENT_MAP: Record<FieldId, Mapping> = {
  year: "YYYY", year2: "YY", isoWeekYear: "GGGG", isoWeek: "WW", quarter: "Q",
  month: "M", month2: "MM", monthShort: "MMM", monthLong: "MMMM",
  day: "D", day2: "DD", daySpace: { t: "D", w: "Moment.js has no space-padded day. Used D." },
  daySuffix: { t: null, w: "Moment.js has an ordinal suffix only as part of Do. It was left out." },
  dayOfYear: "DDD", dayOfYear3: "DDDD",
  dayOfYearSpace: { t: "DDDD", w: "Moment.js has no space-padded day of year. Used DDDD (3 digits)." },
  dayOfYear0: { t: "DDD", w: "Moment.js counts the day of year from 1, not 0." },
  weekdayShort: "ddd", weekdayLong: "dddd", weekdayIso: "E", weekday0: "d",
  hour: "H", hour2: "HH", hourSpace: { t: "H", w: "Moment.js has no space-padded hour. Used H." },
  hour12: "h", hour12_2: "hh", hour12Space: { t: "h", w: "Moment.js has no space-padded hour. Used h." },
  minute: "m", minute2: "mm", second: "s", second2: "ss",
  ampm: "A", ampmLower: "a",
  offset: "ZZ", offsetColon: "Z",
  offsetHour: { t: "Z", w: "Moment.js has no hours-only offset. Used Z (-07:00)." },
  offsetZ: { t: "ZZ", w: MOMENT_Z_NOTE }, offsetColonZ: { t: "Z", w: MOMENT_Z_NOTE },
  offsetHourZ: { t: "Z", w: `Moment.js has no hours-only offset. Used Z (-07:00). ${MOMENT_Z_NOTE}` },
  zoneAbbr: { t: "z", w: "z needs moment-timezone. Day.js needs the timezone and advancedFormat plugins." },
  zoneId: { t: null, w: "Moment.js has no time zone ID token. Use moment.tz.guess() in code." },
  unix: "X", unixMs: "x",
};

// Day.js supports these tokens without plugins. AdvancedFormat adds the second set.
const DAYJS_CORE = new Set(["YY", "YYYY", "M", "MM", "MMM", "MMMM", "D", "DD", "d", "dd", "ddd", "dddd", "H", "HH", "h", "hh", "m", "mm", "s", "ss", "SSS", "Z", "ZZ", "A", "a"]);
const DAYJS_ADVANCED = new Set(["Q", "Do", "k", "kk", "X", "x", "w", "ww", "W", "WW", "gggg", "GGGG", "z", "zzz"]);

const PHP_DAY_OF_YEAR_NOTE = "PHP z counts the day of year from 0 (January 1 is 0). Add 1 in code.";

const PHP_MAP: Record<FieldId, Mapping> = {
  year: "Y", year2: "y", isoWeekYear: "o", isoWeek: "W",
  quarter: { t: null, w: "PHP date() has no quarter character. Use ceil(date('n') / 3) in code." },
  month: "n", month2: "m", monthShort: "M", monthLong: "F",
  day: "j", day2: "d", daySpace: { t: "j", w: "PHP has no space-padded day. Used j." }, daySuffix: "S",
  dayOfYear: { t: "z", w: PHP_DAY_OF_YEAR_NOTE }, dayOfYear3: { t: "z", w: `${PHP_DAY_OF_YEAR_NOTE} z has no padding.` },
  dayOfYearSpace: { t: "z", w: `${PHP_DAY_OF_YEAR_NOTE} z has no padding.` }, dayOfYear0: "z",
  weekdayShort: "D", weekdayLong: "l", weekdayIso: "N", weekday0: "w",
  hour: "G", hour2: "H", hourSpace: { t: "G", w: "PHP has no space-padded hour. Used G." },
  hour12: "g", hour12_2: "h", hour12Space: { t: "g", w: "PHP has no space-padded hour. Used g." },
  minute: { t: "i", w: "PHP has no unpadded minute. Used i (2 digits)." }, minute2: "i",
  second: { t: "s", w: "PHP has no unpadded second. Used s (2 digits)." }, second2: "s",
  ampm: "A", ampmLower: "a",
  offset: "O", offsetColon: "P",
  offsetHour: { t: "O", w: "PHP has no hours-only offset. Used O (-0700)." },
  offsetZ: { t: "O", w: "PHP prints +0000 for UTC with O. Only p prints Z, and it has a colon." },
  offsetColonZ: { t: "p", w: "p needs PHP 8.0 or later. Older versions: use P (prints +00:00)." },
  offsetHourZ: { t: "O", w: "PHP has no hours-only offset. Used O (-0700)." },
  zoneAbbr: "T", zoneId: "e", unix: "U",
  unixMs: { t: "Uv", w: "PHP has no millisecond timestamp. Uv prints the seconds and then the milliseconds. date() prints 000 for v, so use DateTime::format()." },
};

const dotnetNoToken = (what: string, code: string): Mapping => ({ t: null, w: `.NET has no ${what} specifier. Use ${code} in code.` });

const DOTNET_MAP: Record<FieldId, Mapping> = {
  year: "yyyy", year2: "yy",
  isoWeekYear: dotnetNoToken("ISO week-numbering year", "ISOWeek.GetYear()"),
  isoWeek: dotnetNoToken("ISO week", "ISOWeek.GetWeekOfYear()"),
  quarter: dotnetNoToken("quarter", "(date.Month + 2) / 3"),
  month: "M", month2: "MM", monthShort: "MMM", monthLong: "MMMM",
  day: "d", day2: "dd", daySpace: { t: "d", w: ".NET has no space-padded day. Used d." },
  daySuffix: dotnetNoToken("ordinal suffix", "a helper method"),
  dayOfYear: dotnetNoToken("day of year", "date.DayOfYear"),
  dayOfYear3: dotnetNoToken("day of year", "date.DayOfYear.ToString(\"D3\")"),
  dayOfYearSpace: dotnetNoToken("day of year", "date.DayOfYear"),
  dayOfYear0: dotnetNoToken("day of year", "date.DayOfYear - 1"),
  weekdayShort: "ddd", weekdayLong: "dddd",
  weekdayIso: dotnetNoToken("weekday number", "(int)date.DayOfWeek"),
  weekday0: dotnetNoToken("weekday number", "(int)date.DayOfWeek"),
  hour: "H", hour2: "HH", hourSpace: { t: "H", w: ".NET has no space-padded hour. Used H." },
  hour12: "h", hour12_2: "hh", hour12Space: { t: "h", w: ".NET has no space-padded hour. Used h." },
  minute: "m", minute2: "mm", second: "s", second2: "ss",
  ampm: "tt", ampmLower: { t: "tt", w: ".NET prints AM and PM in uppercase. Lowercase the result in code." },
  offset: { t: "zzz", w: ".NET has no offset without a colon. Used zzz (-07:00)." },
  offsetColon: "zzz", offsetHour: "zz",
  offsetZ: { t: "K", w: "K prints Z only for DateTimeKind.Utc values, and its offset has a colon." },
  offsetColonZ: { t: "K", w: "K prints Z only for DateTimeKind.Utc values. For DateTimeOffset it prints the offset." },
  offsetHourZ: { t: "zz", w: ".NET zz never prints Z. Used zz (-07)." },
  zoneAbbr: dotnetNoToken("time zone abbreviation", "TimeZoneInfo"),
  zoneId: dotnetNoToken("time zone ID", "TimeZoneInfo.Local.Id"),
  unix: dotnetNoToken("Unix time", "DateTimeOffset.ToUnixTimeSeconds()"),
  unixMs: dotnetNoToken("Unix time", "DateTimeOffset.ToUnixTimeMilliseconds()"),
};

const FIELD_MAPS: Record<Dialect, Record<FieldId, Mapping>> = {
  go: GO_MAP,
  c: strftimeMap("c"),
  python: strftimeMap("python"),
  ruby: strftimeMap("ruby"),
  java: JAVA_MAP,
  datefns: DATEFNS_MAP,
  moment: MOMENT_MAP,
  php: PHP_MAP,
  dotnet: DOTNET_MAP,
};

/** The token a dialect uses for a field, or null when it has none. For the reference table. */
export const tokenFor = (field: FieldId, dialect: Dialect): string | null => {
  const mapping = FIELD_MAPS[dialect][field];
  return typeof mapping === "string" ? mapping : mapping.t;
};

function emitFraction(part: Extract<Part, { kind: "fraction" }>, dialect: Dialect, warn: (w: string) => void): string | null {
  const { digits: n, trim } = part;
  const fixed = (name: string, token: string) => trim && warn(`${name} has no fraction that drops trailing zeros. Used ${token} (fixed digits).`);
  switch (dialect) {
    case "go":
      return (trim ? "9" : "0").repeat(n);
    case "c":
      warn("C strftime has no fractional seconds. They were left out. GNU date supports %N.");
      return null;
    case "python":
      if (n !== 6) warn(`Python %f always prints 6 digits (microseconds), not ${n}.`);
      fixed("Python", "%f");
      return "%f";
    case "ruby": {
      const token = n === 3 ? "%L" : n === 9 ? "%N" : `%${n}N`;
      fixed("Ruby", token);
      return token;
    }
    case "java":
    case "datefns":
    case "moment": {
      const token = "S".repeat(n);
      fixed(DIALECT_LABELS[dialect], token);
      return token;
    }
    case "php": {
      const token = n <= 3 ? "v" : "u";
      if (n !== 3 && n !== 6) warn(`PHP prints 3 (v) or 6 (u) fractional digits, not ${n}. Used ${token}.`);
      fixed("PHP", token);
      warn(`date() always prints zeros for ${token}. Use DateTime::format() instead.`);
      return token;
    }
    case "dotnet":
      if (n > 7) warn(".NET supports at most 7 fractional digits.");
      return (trim ? "F" : "f").repeat(Math.min(n, 7));
  }
}

const quoteRuns = (text: string, needsQuote: (c: string) => boolean, quote: (run: string) => string, plain: (c: string) => string = (c) => c) => {
  let out = "";
  let run = "";
  for (const c of text) {
    if (needsQuote(c)) {
      run += c;
    } else {
      if (run) out += quote(run);
      run = "";
      out += plain(c);
    }
  }
  if (run) out += quote(run);
  return out;
};

function emitLiteral(text: string, dialect: Dialect, warn: (w: string) => void): string {
  switch (dialect) {
    case "go":
      return text;
    case "c":
    case "python":
    case "ruby":
      return text.replace(/%/g, "%%");
    case "java":
    case "datefns": {
      // A quote inside quoted text doubles. A run of only quotes needs no quoting: '' is one quote.
      const special = dialect === "java" ? "'[]{}#" : "'";
      const quote = (run: string) => (/^'+$/.test(run) ? run.replace(/'/g, "''") : `'${run.replace(/'/g, "''")}'`);
      return quoteRuns(text, (c) => isLetter(c) || special.includes(c), quote);
    }
    case "moment":
      if (/[[\]]/.test(text)) warn("Moment.js and Day.js cannot print [ or ] reliably. Check the result.");
      return quoteRuns(text, isLetter, (run) => `[${run}]`);
    case "php":
      return text.replace(/[A-Za-z\\]/g, (c) => `\\${c}`);
    case "dotnet":
      if (text.includes("/")) warn(".NET replaces / with the culture's date separator. Pass CultureInfo.InvariantCulture for fixed output.");
      return quoteRuns(text, isLetter, (run) => `'${run}'`, (c) => ("'\"\\%".includes(c) ? `\\${c}` : c));
  }
}

const tokenKey = (part: Part) =>
  part.kind === "field" ? part.field : part.kind === "fraction" ? `fraction:${part.digits}:${part.trim}` : part.kind === "raw" ? `raw:${part.text}` : "";

const tokenKeys = (parts: Part[]) => parts.map(tokenKey).filter(Boolean);

export function emitFormat(parts: Part[], dialect: Dialect): EmitResult {
  const warnings: string[] = [];
  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  const map = FIELD_MAPS[dialect];
  // Each piece is a token or escaped literal text. Tokens are kept apart to check the result.
  const pieces: { text: string; token: boolean }[] = [];
  const push = (text: string, token: boolean) => pieces.push({ text, token });
  let lastDay: number | null = null;

  for (const part of parts) {
    if (part.kind === "literal") {
      if (part.text) push(emitLiteral(part.text, dialect, warn), false);
      lastDay = null;
      continue;
    }
    if (part.kind === "raw") {
      if (part.dialect === dialect || (["c", "python", "ruby"].includes(part.dialect) && ["c", "python", "ruby"].includes(dialect))) {
        push(part.text, true);
      } else {
        warn(`${DIALECT_LABELS[dialect]} has no equivalent for ${part.text} (${part.label}). It was left out.`);
      }
      lastDay = null;
      continue;
    }
    if (part.kind === "fraction") {
      const token = emitFraction(part, dialect, warn);
      if (token !== null) {
        if (dialect === "go") {
          if (!part.sep) warn("Go prints fractional seconds only after a dot or comma. Added a dot.");
          push(`${part.sep || "."}${token}`, true);
        } else {
          if (part.sep) push(emitLiteral(part.sep, dialect, warn), false);
          push(token, true);
        }
      }
      lastDay = null;
      continue;
    }
    // Moment.js and date-fns write the ordinal suffix as one token with the day: Do and do.
    if (part.field === "daySuffix" && (dialect === "moment" || dialect === "datefns") && lastDay !== null) {
      const token = dialect === "moment" ? "Do" : "do";
      if (pieces[lastDay].text !== (dialect === "moment" ? "D" : "d")) warn(`${token} does not pad the day with a zero.`);
      pieces[lastDay] = { text: token, token: true };
      lastDay = null;
      continue;
    }
    const mapping = map[part.field];
    const token = typeof mapping === "string" ? mapping : mapping.t;
    if (typeof mapping !== "string") warn(mapping.w);
    if (token !== null) push(token, true);
    lastDay = token !== null && (part.field === "day" || part.field === "day2" || part.field === "daySpace") ? pieces.length - 1 : null;
  }

  let format = pieces.map((p) => p.text).join("");
  if (dialect === "dotnet" && pieces.length === 1 && pieces[0].token && pieces[0].text.length === 1) format = `%${format}`;

  if (dialect === "moment") {
    const tokens = pieces.filter((p) => p.token).map((p) => p.text);
    const plugin = tokens.filter((t) => DAYJS_ADVANCED.has(t));
    const missing = tokens.filter((t) => !DAYJS_CORE.has(t) && !DAYJS_ADVANCED.has(t));
    if (plugin.length) warn(`Day.js needs the AdvancedFormat plugin for ${[...new Set(plugin)].join(", ")}.`);
    if (missing.length) warn(`Day.js does not support ${[...new Set(missing)].join(", ")}. Moment.js does.`);
  }

  // Read the result back. A difference means literal text merged into a token.
  const reparse = (text: string) => (dialect === "dotnet" ? parseDotnet(text, false) : parseFormat(text, dialect));
  const expected = pieces.filter((p) => p.token).flatMap((p) => tokenKeys(reparse(p.text).parts));
  const actual = tokenKeys(reparse(format).parts);
  if (expected.join(" ") !== actual.join(" ")) {
    warn(
      dialect === "go"
        ? "Go layouts have no escape syntax. Literal text that looks like a layout value (such as 1, 2, Jan, or Mon) is read as a value. Check the result."
        : "Some text sits next to a token and is read as part of it. Check the result.",
    );
  }
  return { format, warnings };
}

export interface Translation {
  source: Dialect;
  detected: boolean;
  parts: Part[];
  warnings: string[];
  targets: Record<Dialect, EmitResult>;
}

/** Parses `format` in `source` (or the detected dialect) and emits it in every dialect. */
export function translateFormat(format: string, source: Dialect | "auto" = "auto"): Translation {
  const dialect = source === "auto" ? detectDialect(format) : source;
  const { parts, warnings } = parseFormat(format, dialect);
  const targets = Object.fromEntries(
    DIALECTS.map(({ id }) => [id, id === dialect ? { format, warnings: [] } : emitFormat(parts, id)]),
  ) as Record<Dialect, EmitResult>;
  return { source: dialect, detected: source === "auto", parts, warnings, targets };
}

// ---------------------------------------------------------------------------------------------
// Rendering a preview

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface RenderOptions {
  /** Render in UTC instead of the local time zone. */
  utc?: boolean;
}

const pad = (n: number, width: number, fill = "0") => String(n).padStart(width, fill);

const localZone = (date: Date) => {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value;
    return { abbr: name ?? "", id: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "" };
  } catch {
    return { abbr: "", id: "" };
  }
};

function dateFields(date: Date, utc: boolean) {
  const y = utc ? date.getUTCFullYear() : date.getFullYear();
  const mo = utc ? date.getUTCMonth() : date.getMonth();
  const d = utc ? date.getUTCDate() : date.getDate();
  const wd = utc ? date.getUTCDay() : date.getDay();
  const h = utc ? date.getUTCHours() : date.getHours();
  const mi = utc ? date.getUTCMinutes() : date.getMinutes();
  const s = utc ? date.getUTCSeconds() : date.getSeconds();
  const ms = utc ? date.getUTCMilliseconds() : date.getMilliseconds();
  const offset = utc ? 0 : -date.getTimezoneOffset();
  const dayOfYear = (Date.UTC(y, mo, d) - Date.UTC(y, 0, 1)) / 86_400_000 + 1;
  const thursday = new Date(Date.UTC(y, mo, d + 4 - (wd || 7)));
  const isoYear = thursday.getUTCFullYear();
  const isoWeek = Math.ceil(((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / 86_400_000 + 1) / 7);
  const zone = utc ? { abbr: "UTC", id: "UTC" } : localZone(date);
  return { y, mo, d, wd, h, mi, s, ms, offset, dayOfYear, isoYear, isoWeek, zone, time: date.getTime() };
}

const formatOffset = (minutes: number, colon: boolean, hoursOnly: boolean, z: boolean) => {
  if (z && minutes === 0) return "Z";
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = pad(Math.floor(abs / 60), 2);
  if (hoursOnly) return `${sign}${hh}`;
  return `${sign}${hh}${colon ? ":" : ""}${pad(abs % 60, 2)}`;
};

const ordinalSuffix = (n: number) => {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
};

/** Renders parsed parts for a date, in English. */
export function renderParts(parts: Part[], date: Date, options: RenderOptions = {}): string {
  const f = dateFields(date, !!options.utc);
  const h12 = f.h % 12 || 12;
  const value = (field: FieldId): string => {
    switch (field) {
      case "year": return pad(f.y, 4);
      case "year2": return pad(f.y % 100, 2);
      case "isoWeekYear": return pad(f.isoYear, 4);
      case "isoWeek": return pad(f.isoWeek, 2);
      case "quarter": return String(Math.floor(f.mo / 3) + 1);
      case "month": return String(f.mo + 1);
      case "month2": return pad(f.mo + 1, 2);
      case "monthShort": return MONTHS[f.mo].slice(0, 3);
      case "monthLong": return MONTHS[f.mo];
      case "day": return String(f.d);
      case "day2": return pad(f.d, 2);
      case "daySpace": return pad(f.d, 2, " ");
      case "daySuffix": return ordinalSuffix(f.d);
      case "dayOfYear": return String(f.dayOfYear);
      case "dayOfYear3": return pad(f.dayOfYear, 3);
      case "dayOfYearSpace": return pad(f.dayOfYear, 3, " ");
      case "dayOfYear0": return String(f.dayOfYear - 1);
      case "weekdayShort": return WEEKDAYS[f.wd].slice(0, 3);
      case "weekdayLong": return WEEKDAYS[f.wd];
      case "weekdayIso": return String(f.wd || 7);
      case "weekday0": return String(f.wd);
      case "hour": return String(f.h);
      case "hour2": return pad(f.h, 2);
      case "hourSpace": return pad(f.h, 2, " ");
      case "hour12": return String(h12);
      case "hour12_2": return pad(h12, 2);
      case "hour12Space": return pad(h12, 2, " ");
      case "minute": return String(f.mi);
      case "minute2": return pad(f.mi, 2);
      case "second": return String(f.s);
      case "second2": return pad(f.s, 2);
      case "ampm": return f.h < 12 ? "AM" : "PM";
      case "ampmLower": return f.h < 12 ? "am" : "pm";
      case "offset": return formatOffset(f.offset, false, false, false);
      case "offsetColon": return formatOffset(f.offset, true, false, false);
      case "offsetHour": return formatOffset(f.offset, false, true, false);
      case "offsetZ": return formatOffset(f.offset, false, false, true);
      case "offsetColonZ": return formatOffset(f.offset, true, false, true);
      case "offsetHourZ": return formatOffset(f.offset, false, true, true);
      case "zoneAbbr": return f.zone.abbr;
      case "zoneId": return f.zone.id;
      case "unix": return String(Math.floor(f.time / 1000));
      case "unixMs": return String(f.time);
    }
  };
  return parts
    .map((part) => {
      switch (part.kind) {
        case "literal":
          return part.text;
        case "field":
          return value(part.field);
        case "fraction": {
          let digits = pad(f.ms, 3).padEnd(part.digits, "0").slice(0, part.digits);
          if (part.trim) digits = digits.replace(/0+$/, "");
          return digits ? `${part.sep}${digits}` : "";
        }
        case "raw":
          return part.text;
      }
    })
    .join("");
}

/** Renders a format string, as the given dialect reads it, for a date. */
export const renderFormat = (format: string, dialect: Dialect, date: Date, options: RenderOptions = {}) =>
  renderParts(parseFormat(format, dialect).parts, date, options);
