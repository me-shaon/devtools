/**
 * Cron expression parsing, plain-English descriptions, and next-run search.
 *
 * Dialects:
 * - standard: 5 fields (minute hour day-of-month month day-of-week). 0 and 7 are Sunday.
 *   When both day fields are restricted, a day that matches either one runs (Vixie cron rule).
 * - seconds: 6 fields with seconds first (Spring, node-cron). Both day fields must match.
 * - quartz: 6 or 7 fields with seconds first and an optional year. Uses `?`, and 1 is Sunday.
 * - aws: EventBridge `cron(...)`: minute hour day-of-month month day-of-week year. 1 is Sunday.
 */

export type CronDialect = "standard" | "seconds" | "quartz" | "aws";
export type CronFieldName = "second" | "minute" | "hour" | "dayOfMonth" | "month" | "dayOfWeek" | "year";

export type CronItem =
  | { kind: "all"; any: boolean }
  | { kind: "value"; value: number }
  | { kind: "range"; from: number; to: number }
  | { kind: "step"; from: number; to: number; step: number; star: boolean }
  | { kind: "last" }
  | { kind: "lastOffset"; offset: number }
  | { kind: "nearestWeekday"; day: number }
  | { kind: "lastWeekday" }
  | { kind: "lastDayOfWeek"; day: number }
  | { kind: "nthDayOfWeek"; day: number; nth: number };

export interface CronField {
  name: CronFieldName;
  label: string;
  text: string;
  items: CronItem[];
  /** Plain matching values, sorted. Day of week is normalized to 0-6 with 0 as Sunday. */
  values: number[];
  /** True when the field is `*` or `?`. */
  wildcard: boolean;
}

export interface CronSchedule {
  dialect: CronDialect;
  fields: CronField[];
  /** The macro as typed, such as `@daily`. */
  macro?: string;
  /** The 5-field form of a macro. */
  expanded?: string;
  /** Standard cron runs on a day that matches either day field when both are restricted. */
  dayOr: boolean;
}

export type CronParseResult =
  | { ok: true; schedule: CronSchedule }
  | { ok: false; error: string; fieldIndex?: number; layout?: CronFieldName[] };

export const CRON_FIELD_LABELS: Record<CronFieldName, string> = {
  second: "Second",
  minute: "Minute",
  hour: "Hour",
  dayOfMonth: "Day of month",
  month: "Month",
  dayOfWeek: "Day of week",
  year: "Year",
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_CODES = MONTH_NAMES.map((name) => name.slice(0, 3).toUpperCase());
const DAY_CODES = DAY_NAMES.map((name) => name.slice(0, 3).toUpperCase());
const ORDINALS = ["first", "second", "third", "fourth", "fifth"];

const LAYOUTS: Record<CronDialect, CronFieldName[]> = {
  standard: ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"],
  seconds: ["second", "minute", "hour", "dayOfMonth", "month", "dayOfWeek"],
  quartz: ["second", "minute", "hour", "dayOfMonth", "month", "dayOfWeek", "year"],
  aws: ["minute", "hour", "dayOfMonth", "month", "dayOfWeek", "year"],
};

export const CRON_DIALECT_LABELS: Record<CronDialect, string> = {
  standard: "Standard cron (5 fields)",
  seconds: "Seconds first (6 fields, as in Spring and node-cron)",
  quartz: "Quartz (seconds first, 1 is Sunday)",
  aws: "AWS EventBridge (with year, 1 is Sunday)",
};

const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

/** Allowed values as typed, per field. Day of week depends on the dialect. */
interface FieldSpec {
  min: number;
  max: number;
  /** Range that `*` covers. */
  starMin: number;
  starMax: number;
  hint: string;
}

const sundayIsOne = (dialect: CronDialect) => dialect === "quartz" || dialect === "aws";

function fieldSpec(name: CronFieldName, dialect: CronDialect): FieldSpec {
  const plain = (min: number, max: number): FieldSpec => ({ min, max, starMin: min, starMax: max, hint: `${min} to ${max}` });
  switch (name) {
    case "second":
    case "minute":
      return plain(0, 59);
    case "hour":
      return plain(0, 23);
    case "dayOfMonth":
      return plain(1, 31);
    case "month":
      return { ...plain(1, 12), hint: "JAN to DEC, or 1 to 12" };
    case "year":
      return plain(1970, 2099);
    case "dayOfWeek":
      return sundayIsOne(dialect)
        ? { min: 1, max: 7, starMin: 1, starMax: 7, hint: "SUN to SAT, or 1 to 7 (1 is Sunday)" }
        : { min: 0, max: 7, starMin: 0, starMax: 6, hint: "SUN to SAT, or 0 to 7 (0 and 7 are Sunday)" };
  }
}

/** Map a typed day-of-week number to 0-6 with 0 as Sunday. */
const normalizeDay = (value: number, dialect: CronDialect) => (sundayIsOne(dialect) ? value - 1 : value % 7);

class FieldError extends Error {}

function parseNumber(text: string, name: CronFieldName, dialect: CronDialect): number {
  const label = CRON_FIELD_LABELS[name];
  const spec = fieldSpec(name, dialect);
  if (/^\d+$/.test(text)) {
    const value = Number(text);
    if (value < spec.min || value > spec.max) {
      const range = name === "month" ? "1 to 12" : name === "dayOfWeek" ? spec.hint.replace("SUN to SAT, or ", "") : spec.hint;
      throw new FieldError(`${label}: ${value} is out of range. Use ${range}.`);
    }
    return value;
  }
  const upper = text.toUpperCase();
  if (name === "month") {
    const index = MONTH_CODES.indexOf(upper);
    if (index === -1) throw new FieldError(`${label}: "${text}" is not a month name. Use ${spec.hint}.`);
    return index + 1;
  }
  if (name === "dayOfWeek") {
    const index = DAY_CODES.indexOf(upper);
    if (index === -1) throw new FieldError(`${label}: "${text}" is not a day name. Use ${spec.hint}.`);
    return sundayIsOne(dialect) ? index + 1 : index;
  }
  throw new FieldError(`${label}: "${text}" is not a number. Use ${spec.hint}.`);
}

function parseItem(text: string, name: CronFieldName, dialect: CronDialect): CronItem {
  const label = CRON_FIELD_LABELS[name];
  const isDayField = name === "dayOfMonth" || name === "dayOfWeek";
  const spec = fieldSpec(name, dialect);
  const upper = text.toUpperCase();

  if (text === "*") return { kind: "all", any: false };
  if (text === "?") {
    if (!isDayField) throw new FieldError(`${label}: "?" only works in the day-of-month and day-of-week fields.`);
    return { kind: "all", any: true };
  }
  if (text === "") throw new FieldError(`${label}: a list has an empty item. Remove the extra comma.`);

  if (name === "dayOfMonth") {
    if (upper === "L") return { kind: "last" };
    if (upper === "LW") return { kind: "lastWeekday" };
    const offset = /^L-(\d+)$/i.exec(text);
    if (offset) {
      const value = Number(offset[1]);
      if (value < 1 || value > 30) throw new FieldError(`${label}: the offset in "${text}" must be 1 to 30.`);
      return { kind: "lastOffset", offset: value };
    }
    const weekday = /^(\d+)W$/i.exec(text);
    if (weekday) return { kind: "nearestWeekday", day: parseNumber(weekday[1], name, dialect) };
  }
  if (name === "dayOfWeek") {
    // Quartz reads a lone L in this field as Saturday.
    if (upper === "L") return { kind: "value", value: sundayIsOne(dialect) ? 7 : 6 };
    const last = /^(\w+)L$/i.exec(text);
    if (last) return { kind: "lastDayOfWeek", day: normalizeDay(parseNumber(last[1], name, dialect), dialect) };
    const nth = /^(\w+)#(\d+)$/.exec(text);
    if (nth) {
      const count = Number(nth[2]);
      if (count < 1 || count > 5) throw new FieldError(`${label}: the number after "#" in "${text}" must be 1 to 5.`);
      return { kind: "nthDayOfWeek", day: normalizeDay(parseNumber(nth[1], name, dialect), dialect), nth: count };
    }
  }
  if (!isDayField && name !== "month" && /[LW#]/i.test(text)) {
    throw new FieldError(`${label}: "${text}" uses L, W, or #. These only work in the day-of-month and day-of-week fields.`);
  }

  const slash = text.split("/");
  if (slash.length > 2) throw new FieldError(`${label}: "${text}" has more than one "/".`);
  if (slash.length === 2) {
    const [base, stepText] = slash;
    const step = /^\d+$/.test(stepText) ? Number(stepText) : 0;
    if (step < 1) throw new FieldError(`${label}: the step in "${text}" must be a whole number of 1 or more.`);
    if (base === "*" || base === "?") return { kind: "step", from: spec.starMin, to: spec.starMax, step, star: true };
    if (base.includes("-")) {
      const range = parseRange(base, name, dialect);
      return { kind: "step", from: range.from, to: range.to, step, star: false };
    }
    return { kind: "step", from: parseNumber(base, name, dialect), to: spec.starMax, step, star: false };
  }
  if (text.includes("-")) return parseRange(text, name, dialect);
  return { kind: "value", value: parseNumber(text, name, dialect) };
}

function parseRange(text: string, name: CronFieldName, dialect: CronDialect): { kind: "range"; from: number; to: number } {
  const label = CRON_FIELD_LABELS[name];
  const parts = text.split("-");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new FieldError(`${label}: "${text}" is not a valid range. Write it as start-end, as in 1-5.`);
  const from = parseNumber(parts[0], name, dialect);
  const to = parseNumber(parts[1], name, dialect);
  if (from > to) {
    throw new FieldError(`${label}: the range ${parts[0]}-${parts[1]} goes backward. Write the smaller value first, or split it into two ranges.`);
  }
  return { kind: "range", from, to };
}

function parseField(text: string, name: CronFieldName, dialect: CronDialect): CronField {
  const items = text.split(",").map((part) => parseItem(part, name, dialect));
  const set = new Set<number>();
  const spec = fieldSpec(name, dialect);
  const add = (value: number) => set.add(name === "dayOfWeek" ? normalizeDay(value, dialect) : value);
  for (const item of items) {
    if (item.kind === "all") for (let v = spec.starMin; v <= spec.starMax; v++) add(v);
    else if (item.kind === "value") add(item.value);
    else if (item.kind === "range") for (let v = item.from; v <= item.to; v++) add(v);
    else if (item.kind === "step") for (let v = item.from; v <= item.to; v += item.step) add(v);
  }
  // Store day-of-week items in 0-6 form so descriptions can name them directly.
  const normalized = name === "dayOfWeek" ? items.map((item) => normalizeDayItem(item, dialect)) : items;
  return {
    name,
    label: CRON_FIELD_LABELS[name],
    text,
    items: normalized,
    values: [...set].sort((a, b) => a - b),
    wildcard: items.length === 1 && items[0].kind === "all",
  };
}

function normalizeDayItem(item: CronItem, dialect: CronDialect): CronItem {
  switch (item.kind) {
    case "value":
      return { kind: "value", value: normalizeDay(item.value, dialect) };
    case "range":
      return { kind: "range", from: normalizeDay(item.from, dialect), to: normalizeDay(item.to, dialect) };
    default:
      return item;
  }
}

function detectLayout(tokens: string[], aws: boolean): CronFieldName[] | null {
  const dialect = detectDialect(tokens, aws);
  return dialect ? LAYOUTS[dialect].slice(0, tokens.length) : null;
}

function detectDialect(tokens: string[], aws: boolean): CronDialect | null {
  if (aws) return tokens.length === 6 ? "aws" : null;
  if (tokens.length === 5) return "standard";
  if (tokens.length === 6) return tokens.some((token) => token.includes("?")) ? "quartz" : "seconds";
  if (tokens.length === 7) return "quartz";
  return null;
}

/** Parse a cron expression. Pass `aws` for the inside of an EventBridge `cron(...)` wrapper. */
export function parseCron(expression: string, options: { aws?: boolean } = {}): CronParseResult {
  const trimmed = expression.trim();
  if (!trimmed) return { ok: false, error: "Enter a cron expression, such as 0 9 * * 1-5 or @daily." };

  if (trimmed.startsWith("@")) {
    const macro = trimmed.toLowerCase();
    if (macro === "@reboot") {
      return { ok: false, error: "@reboot runs once when cron starts. It has no time schedule, so there are no next runs to show." };
    }
    const expanded = MACROS[macro];
    if (!expanded) {
      return { ok: false, error: `Unknown macro "${trimmed}". Use @yearly, @annually, @monthly, @weekly, @daily, @midnight, or @hourly.` };
    }
    const result = parseCron(expanded);
    if (result.ok) result.schedule = { ...result.schedule, macro: trimmed, expanded };
    return result;
  }

  const tokens = trimmed.split(/\s+/);
  const dialect = detectDialect(tokens, options.aws ?? false);
  if (!dialect) {
    const error = options.aws
      ? `AWS cron expressions have 6 fields (minute hour day-of-month month day-of-week year). Found ${tokens.length}.`
      : `Expected 5 fields (minute hour day-of-month month day-of-week), or 6 to 7 with seconds first. Found ${tokens.length}.`;
    return { ok: false, error };
  }
  const layout = LAYOUTS[dialect].slice(0, tokens.length);

  const fields: CronField[] = [];
  for (let index = 0; index < tokens.length; index++) {
    try {
      fields.push(parseField(tokens[index], layout[index], dialect));
    } catch (error) {
      if (error instanceof FieldError) return { ok: false, error: error.message, fieldIndex: index, layout };
      throw error;
    }
  }

  const dayOfMonth = fields[layout.indexOf("dayOfMonth")];
  const dayOfWeek = fields[layout.indexOf("dayOfWeek")];
  const starred = (field: CronField) => field.text.startsWith("*") || field.text.startsWith("?");
  const dayOr = dialect === "standard" && !starred(dayOfMonth) && !starred(dayOfWeek);
  return { ok: true, schedule: { dialect, fields, dayOr } };
}

/** The field names for the typed tokens, or null when the token count fits no dialect. */
export function cronLayout(expression: string, aws = false): CronFieldName[] | null {
  const trimmed = expression.trim();
  if (trimmed.startsWith("@")) return MACROS[trimmed.toLowerCase()] ? LAYOUTS.standard : null;
  return trimmed ? detectLayout(trimmed.split(/\s+/), aws) : null;
}

/* ------------------------------------------------------------------------- */
/* Reading pasted text                                                       */
/* ------------------------------------------------------------------------- */

export interface CronInput {
  /** The cron expression without keys, quotes, prefixes, or a command. */
  expression: string;
  /** Offsets of the expression inside the original text. */
  start: number;
  end: number;
  /** The command that follows the schedule in a crontab line. */
  command?: string;
  /** A `CRON_TZ=` or `TZ=` prefix. */
  timeZone?: string;
  /** True for an AWS EventBridge `cron(...)` wrapper. */
  aws: boolean;
}

const CRON_PIECE = new RegExp(`^(?:\\*|\\?|\\d+|L|W|LW|\\d+[LW]|${[...MONTH_CODES, ...DAY_CODES].join("|")})$`, "i");
const looksLikeCronField = (token: string) => token.split(/[,\-/#]/).every((piece) => CRON_PIECE.test(piece));

/**
 * Find the cron expression in pasted text. Accepts crontab lines with a command, GitHub Actions
 * and Kubernetes YAML lines (`- cron: '...'`, `schedule: "..."`), `CRON_TZ=` prefixes, and AWS `cron(...)`.
 */
export function readCronInput(text: string): CronInput {
  let start = 0;
  let end = text.length;
  const skipSpace = () => {
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
  };
  skipSpace();

  const key = /^(?:-\s*)?(?:cron|schedule)\s*:\s*/i.exec(text.slice(start, end));
  if (key) start += key[0].length;
  const quote = text[start];
  if ((quote === "'" || quote === '"') && text.indexOf(quote, start + 1) > start) {
    end = text.indexOf(quote, start + 1);
    start++;
    skipSpace();
  }

  let aws = false;
  const wrapper = /^cron\((.*)\)$/i.exec(text.slice(start, end));
  if (wrapper) {
    aws = true;
    start += 5;
    end -= 1;
    skipSpace();
  }

  let timeZone: string | undefined;
  const zone = /^(?:CRON_TZ|TZ)=(\S+)\s+/.exec(text.slice(start, end));
  if (zone) {
    timeZone = zone[1];
    start += zone[0].length;
  }

  // Tokens with their offsets, so the command can be split off.
  const tokens: { value: string; start: number; end: number }[] = [];
  const pattern = /\S+/g;
  const body = text.slice(start, end);
  for (let match = pattern.exec(body); match; match = pattern.exec(body)) {
    tokens.push({ value: match[0], start: start + match.index, end: start + match.index + match[0].length });
  }

  let count = tokens.length;
  if (tokens[0]?.value.startsWith("@")) {
    count = 1;
  } else if (!aws) {
    let leading = 0;
    while (leading < tokens.length && leading < 7 && looksLikeCronField(tokens[leading].value)) leading++;
    if (leading >= 5) count = leading;
  }

  const fieldEnd = count > 0 ? tokens[count - 1].end : start;
  const command = count < tokens.length ? text.slice(tokens[count].start, end) : undefined;
  return { expression: text.slice(start, fieldEnd), start, end: fieldEnd, command, timeZone, aws };
}

/** Replace one field of the expression inside `text`. A macro becomes its 5-field form first. */
export function replaceCronField(text: string, index: number, value: string): string {
  const input = readCronInput(text);
  const macro = MACROS[input.expression.toLowerCase()];
  const tokens = (macro ?? input.expression).split(/\s+/);
  tokens[index] = value;
  return text.slice(0, input.start) + tokens.join(" ") + text.slice(input.end);
}

/* ------------------------------------------------------------------------- */
/* Descriptions                                                              */
/* ------------------------------------------------------------------------- */

const pad = (value: number) => String(value).padStart(2, "0");

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const UNITS: Record<CronFieldName, [string, string]> = {
  second: ["second", "seconds"],
  minute: ["minute", "minutes"],
  hour: ["hour", "hours"],
  dayOfMonth: ["day", "days"],
  month: ["month", "months"],
  dayOfWeek: ["day of the week", "days of the week"],
  year: ["year", "years"],
};

function valueName(name: CronFieldName, value: number): string {
  if (name === "month") return MONTH_NAMES[value - 1];
  if (name === "dayOfWeek") return DAY_NAMES[value];
  return String(value);
}

const named = (name: CronFieldName) => name === "month" || name === "dayOfWeek" || name === "year";

function describeItem(name: CronFieldName, item: CronItem): string {
  const [unit, units] = UNITS[name];
  const show = (value: number) => (named(name) ? valueName(name, value) : `${unit} ${value}`);
  switch (item.kind) {
    case "all":
      return item.any ? "any day" : `every ${unit}`;
    case "value":
      return show(item.value);
    case "range":
      return named(name) ? `${valueName(name, item.from)} through ${valueName(name, item.to)}` : `${units} ${item.from} through ${item.to}`;
    case "step": {
      const every = `every ${item.step} ${item.step === 1 ? unit : units}`;
      if (item.star) return every;
      return `${every} from ${named(name) ? valueName(name, item.from) : item.from} through ${named(name) ? valueName(name, item.to) : item.to}`;
    }
    case "last":
      return "the last day of the month";
    case "lastOffset":
      return `${item.offset} ${item.offset === 1 ? "day" : "days"} before the last day of the month`;
    case "nearestWeekday":
      return `the weekday nearest day ${item.day} of the month`;
    case "lastWeekday":
      return "the last weekday of the month";
    case "lastDayOfWeek":
      return `the last ${DAY_NAMES[item.day]} of the month`;
    case "nthDayOfWeek":
      return `the ${ORDINALS[item.nth - 1]} ${DAY_NAMES[item.day]} of the month`;
  }
}

/** Describe one field on its own, for the field breakdown. */
export function describeCronField(field: CronField): string {
  const { name, items } = field;
  if (items.every((item) => item.kind === "value")) {
    const values = items.map((item) => (item as { value: number }).value);
    if (named(name)) return joinList(values.map((value) => valueName(name, value)));
    const [unit, units] = UNITS[name];
    return `${values.length === 1 ? unit : units} ${joinList(values.map(String))}`;
  }
  return joinList(items.map((item) => describeItem(name, item)));
}

function dayOfMonthPhrase(field: CronField): string {
  const items = field.items;
  if (items.every((item) => item.kind === "value" || item.kind === "range")) return `on ${describeCronField(field)} of the month`;
  return `on ${describeCronField(field)}`;
}

/** Describe the whole schedule in one plain-English sentence. */
export function describeCron(schedule: CronSchedule): string {
  const get = (name: CronFieldName) => schedule.fields.find((field) => field.name === name);
  const second = get("second");
  const minute = get("minute")!;
  const hour = get("hour")!;
  const dayOfMonth = get("dayOfMonth")!;
  const month = get("month")!;
  const dayOfWeek = get("dayOfWeek")!;
  const year = get("year");

  const onlyValues = (field: CronField | undefined) => !field || field.items.every((item) => item.kind === "value");
  const seconds = second ? second.values : [0];
  const trivialSeconds = seconds.length === 1 && seconds[0] === 0;
  const parts: string[] = [];
  let exactTimes = false;

  const combos = seconds.length * minute.values.length * hour.values.length;
  if (onlyValues(second) && onlyValues(minute) && !hour.wildcard && combos <= 6 && hour.values.length <= 6) {
    const times: string[] = [];
    for (const h of hour.values) {
      for (const m of minute.values) {
        for (const s of seconds) times.push(trivialSeconds ? `${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(s)}`);
      }
    }
    parts.push(`at ${joinList(times)}`);
    exactTimes = true;
  } else {
    let timeText = "";
    if (second && !trivialSeconds) {
      if (second.wildcard) timeText = "every second";
      else if (second.items.every((item) => item.kind === "step" && item.star)) timeText = describeCronField(second);
      else timeText = `at ${describeCronField(second)}${minute.wildcard ? " of every minute" : ""}`;
    }
    if (!minute.wildcard || !timeText) {
      const minuteText = minute.wildcard
        ? "every minute"
        : onlyValues(minute)
          ? `at ${describeCronField(minute)}${hour.wildcard ? " of every hour" : ""}`
          : describeCronField(minute);
      timeText = timeText ? `${timeText}, ${minuteText}` : minuteText;
    }
    parts.push(timeText);
    if (!hour.wildcard) {
      const single = hour.items.length === 1 ? hour.items[0] : undefined;
      if (single?.kind === "range") parts.push(`between ${pad(single.from)}:00 and ${pad(single.to)}:59`);
      else if (hour.items.every((item) => item.kind === "step")) parts.push(describeCronField(hour));
      else parts.push(`during ${describeCronField(hour)}`);
    }
  }

  const domRestricted = !dayOfMonth.wildcard;
  const dowRestricted = !dayOfWeek.wildcard;
  if (domRestricted && dowRestricted) {
    const joiner = schedule.dayOr ? " or " : " if it is ";
    const dow = describeCronField(dayOfWeek);
    parts.push(`${dayOfMonthPhrase(dayOfMonth)}${joiner}${schedule.dayOr ? `on ${dow}` : `a ${dow}`}`);
  } else if (domRestricted) {
    parts.push(dayOfMonthPhrase(dayOfMonth));
  } else if (dowRestricted) {
    parts.push(`on ${describeCronField(dayOfWeek)}`);
  }

  if (!month.wildcard) {
    parts.push(month.items.every((item) => item.kind === "step") ? describeCronField(month) : `in ${describeCronField(month)}`);
  }
  if (year && !year.wildcard) parts.push(`in ${describeCronField(year)}`);
  if (exactTimes && !domRestricted && !dowRestricted && month.wildcard) parts.push("every day");

  const sentence = parts.join(", ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Compact list of matching values for a field, such as `0, 6, 12, 18` or `MON-FRI`. */
export function formatCronValues(field: CronField): string {
  const values = field.values;
  const show = (value: number) =>
    field.name === "month" ? MONTH_CODES[value - 1] : field.name === "dayOfWeek" ? DAY_CODES[value] : String(value);
  const ranges: string[] = [];
  for (let i = 0; i < values.length; i++) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++;
    ranges.push(j - i >= 2 ? `${show(values[i])}-${show(values[j])}` : j > i ? `${show(values[i])}, ${show(values[j])}` : show(values[i]));
    i = j;
  }
  return ranges.join(", ");
}

/* ------------------------------------------------------------------------- */
/* Next runs                                                                 */
/* ------------------------------------------------------------------------- */

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? "";
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

function wallTime(instant: number, timeZone: string | undefined): WallTime {
  const parts: Record<string, number> = {};
  for (const part of wallFormatter(timeZone).formatToParts(new Date(instant))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour % 24, minute: parts.minute, second: parts.second };
}

const wallAsUtc = (wall: WallTime) => Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);

/** Convert a wall-clock time in a zone to an instant. Returns null for times skipped by daylight saving time. */
function wallToInstant(wall: WallTime, timeZone: string | undefined): number | null {
  const guess = wallAsUtc(wall);
  const offset = wallAsUtc(wallTime(guess, timeZone)) - guess;
  let instant = guess - offset;
  const corrected = wallAsUtc(wallTime(instant, timeZone)) - instant;
  if (corrected !== offset) instant = guess - corrected;
  return wallAsUtc(wallTime(instant, timeZone)) === guess ? instant : null;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function dayOfMonthMatches(field: CronField, day: number, daysInMonth: number, weekdayOf: (day: number) => number): boolean {
  for (const item of field.items) {
    switch (item.kind) {
      case "last":
        if (day === daysInMonth) return true;
        break;
      case "lastOffset":
        if (day === daysInMonth - item.offset) return true;
        break;
      case "lastWeekday": {
        let target = daysInMonth;
        while (weekdayOf(target) === 0 || weekdayOf(target) === 6) target--;
        if (day === target) return true;
        break;
      }
      case "nearestWeekday": {
        let target = Math.min(item.day, daysInMonth);
        const weekday = weekdayOf(target);
        if (weekday === 6) target = target === 1 ? 3 : target - 1;
        else if (weekday === 0) target = target === daysInMonth ? target - 2 : target + 1;
        if (day === target) return true;
        break;
      }
      default:
        break;
    }
  }
  return field.values.includes(day);
}

function dayOfWeekMatches(field: CronField, day: number, weekday: number, daysInMonth: number): boolean {
  for (const item of field.items) {
    if (item.kind === "lastDayOfWeek" && weekday === item.day && day + 7 > daysInMonth) return true;
    if (item.kind === "nthDayOfWeek" && weekday === item.day && Math.ceil(day / 7) === item.nth) return true;
  }
  return field.values.includes(weekday);
}

const DAY_MS = 86_400_000;
const SEARCH_YEARS = 30;

/**
 * Find the next `count` runs after `from`. Times follow the wall clock in `timeZone`
 * (the local zone when it is undefined). Wall times skipped by daylight saving time do not run.
 */
export function nextCronRuns(schedule: CronSchedule, from: Date, count: number, timeZone?: string): Date[] {
  const get = (name: CronFieldName) => schedule.fields.find((field) => field.name === name);
  const seconds = get("second")?.values ?? [0];
  const minutes = get("minute")!.values;
  const hours = get("hour")!.values;
  const dayOfMonth = get("dayOfMonth")!;
  const months = new Set(get("month")!.values);
  const dayOfWeek = get("dayOfWeek")!;
  const yearField = get("year");
  const years = yearField && !yearField.wildcard ? new Set(yearField.values) : null;

  const runs: Date[] = [];
  const start = wallTime(from.getTime(), timeZone);
  const lastYear = years ? Math.max(...years) : start.year + SEARCH_YEARS;
  let last = from.getTime();
  let cursor = Date.UTC(start.year, start.month - 1, start.day);
  const firstDay = cursor;

  while (runs.length < count) {
    const date = new Date(cursor);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    if (year > lastYear) break;
    if (years && !years.has(year)) {
      cursor = Date.UTC(year + 1, 0, 1);
      continue;
    }
    if (!months.has(month)) {
      cursor = Date.UTC(year, month, 1);
      continue;
    }
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const weekdayOf = (d: number) => new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    const domMatch = dayOfMonth.wildcard || dayOfMonthMatches(dayOfMonth, day, daysInMonth, weekdayOf);
    const dowMatch = dayOfWeek.wildcard || dayOfWeekMatches(dayOfWeek, day, date.getUTCDay(), daysInMonth);
    const matches = schedule.dayOr ? domMatch || dowMatch : domMatch && dowMatch;

    if (matches) {
      const today = cursor === firstDay;
      const startSeconds = start.hour * 3600 + start.minute * 60 + start.second;
      for (const hour of hours) {
        if (today && hour < start.hour) continue;
        for (const minute of minutes) {
          for (const second of seconds) {
            if (today && hour * 3600 + minute * 60 + second <= startSeconds) continue;
            const instant = wallToInstant({ year, month, day, hour, minute, second }, timeZone);
            if (instant === null || instant <= last) continue;
            runs.push(new Date(instant));
            last = instant;
            if (runs.length === count) return runs;
          }
        }
      }
    }
    cursor += DAY_MS;
  }
  return runs;
}

/** Short time until a run, such as `in 5 min` or `in 3 h 20 min`. */
export function formatTimeUntil(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `in ${totalSeconds} s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `in ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) {
    const minutes = totalMinutes % 60;
    return minutes ? `in ${hours} h ${minutes} min` : `in ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

export interface CronExample {
  label: string;
  expression: string;
}

export const CRON_EXAMPLES: CronExample[] = [
  { label: "Every minute", expression: "* * * * *" },
  { label: "Every 5 minutes", expression: "*/5 * * * *" },
  { label: "Every 15 minutes during work hours", expression: "*/15 9-17 * * 1-5" },
  { label: "Every hour", expression: "0 * * * *" },
  { label: "Every 6 hours on weekdays", expression: "0 */6 * * 1-5" },
  { label: "Every day at midnight", expression: "@daily" },
  { label: "Weekdays at 09:00", expression: "0 9 * * MON-FRI" },
  { label: "Every Sunday at 03:30", expression: "30 3 * * SUN" },
  { label: "First day of every month", expression: "0 0 1 * *" },
  { label: "Last day of every month", expression: "0 0 L * *" },
  { label: "Every 30 seconds (Spring)", expression: "*/30 * * * * *" },
  { label: "Second Monday of the month (Quartz)", expression: "0 0 9 ? * MON#2" },
];
