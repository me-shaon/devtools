/**
 * Timestamp converter utility functions
 */

/**
 * Convert Unix timestamp to Date
 */
export function timestampToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

/**
 * Convert Date to Unix timestamp
 */
export function dateToTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Convert Unix timestamp to formatted date string
 */
export function timestampToFormattedString(timestamp: number, locale = "en-US"): string {
  const date = timestampToDate(timestamp);
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Convert date string to Unix timestamp
 */
export function dateStringToTimestamp(dateString: string): number {
  const date = new Date(dateString);
  return dateToTimestamp(date);
}

/**
 * Get current Unix timestamp
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Get current date as formatted string
 */
export function getCurrentDateString(locale = "en-US"): string {
  return timestampToFormattedString(getCurrentTimestamp(), locale);
}

/**
 * Validate Unix timestamp
 */
export function isValidTimestamp(timestamp: number): boolean {
  const date = timestampToDate(timestamp);
  return !isNaN(date.getTime()) && timestamp > 0;
}

/**
 * Format date to various formats
 */
export function formatDateFormats(date: Date) {
  return {
    iso: date.toISOString(),
    locale: date.toLocaleString(),
    utc: date.toUTCString(),
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString(),
  };
}

export type EpochUnit = "seconds" | "milliseconds" | "microseconds" | "nanoseconds";

export type TimeParseResult =
  | {
      ok: true;
      ms: number;
      /** How the base value was read: the current time, an epoch number, or a date string. */
      source: "now" | EpochUnit | "date";
      /** For date strings: where the time zone came from. */
      zone?: "utc" | "local" | "explicit";
      /** Sum of the `+ 1h` style offsets, in milliseconds. */
      offsetMs: number;
    }
  | { ok: false; error: string };

/** The largest distance from the epoch that a JavaScript Date can hold. */
const MAX_DATE_MS = 8.64e15;

const OFFSET_UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
const OFFSET_TERM = /\s*([+-])?\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?\s*/iy;
const EPOCH_SUFFIX: Record<string, EpochUnit> = { s: "seconds", ms: "milliseconds", us: "microseconds", "µs": "microseconds", ns: "nanoseconds" };
const NUMBER_BASE = /^(-?\d+)(?:\.(\d+))?\s*(ns|us|µs|ms|s)?(?=\s+[+-]|\s*$)/i;
const DATE_WITH_OFFSETS = /^(.*?\S)((?:\s+[+-]\s*\d+(?:\.\d+)?\s*(?:ms|s|m|h|d|w)(?:\s*\d+(?:\.\d+)?\s*(?:ms|s|m|h|d|w))*)+)\s*$/i;

const INVALID_INPUT = "Enter a Unix timestamp, a date such as 2024-01-15T12:00:00Z, or an expression such as now - 1d.";
const OUT_OF_RANGE = "This value is outside the range of dates that JavaScript supports.";

/**
 * Reads offsets such as `+ 3600`, `- 1d`, or `+1h30m`. A bare number means seconds.
 * A term without a sign continues the previous one. Returns null if the text is not only offsets.
 */
function parseOffsets(text: string): number | null {
  let total = 0;
  let sign = 0;
  let lastHadUnit = false;
  OFFSET_TERM.lastIndex = 0;
  while (OFFSET_TERM.lastIndex < text.length) {
    const match = OFFSET_TERM.exec(text);
    if (!match) return null;
    if (match[1]) sign = match[1] === "-" ? -1 : 1;
    else if (!sign || !lastHadUnit) return null;
    const unit = (match[3] ?? "s").toLowerCase();
    lastHadUnit = Boolean(match[3]);
    total += sign * Number(match[2]) * OFFSET_UNIT_MS[unit];
  }
  return Math.round(total);
}

/** Guesses the unit of an epoch number from its digit count. Seconds cover the years 1973 to 5138. */
export function detectEpochUnit(integerDigits: string): EpochUnit {
  const length = integerDigits.replace(/^-/, "").length;
  if (length <= 11) return "seconds";
  if (length <= 14) return "milliseconds";
  if (length <= 17) return "microseconds";
  return "nanoseconds";
}

function epochToMs(integer: string, fraction: string | undefined, unit: EpochUnit): number {
  const decimal = Number(fraction ? `${integer}.${fraction}` : integer);
  if (unit === "seconds") return Math.round(decimal * 1000);
  if (unit === "milliseconds") return Math.round(decimal);
  // BigInt keeps 16 to 19 digit values exact before they shrink to milliseconds.
  return Number(BigInt(integer) / (unit === "microseconds" ? 1000n : 1_000_000n));
}

function normalizeDateString(text: string): string {
  // WebKit only reads ISO dates with a "T" and a "+hh:mm" offset.
  let value = text.replace(/^(\d{4}-\d{2}-\d{2})\s+(?=\d{1,2}:)/, "$1T");
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    value = value
      .replace(/\s*(?:UTC|GMT|Z)$/i, "Z")
      .replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
      .replace(/\s+([+-]\d{2}:\d{2})$/, "$1");
  }
  return value;
}

function dateZone(text: string): "utc" | "local" | "explicit" {
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return "utc";
  if (/(?:Z|[+-]\d{2}:?\d{2}|\b(?:UTC|GMT)(?:[+-]\d{1,4})?)$/i.test(text)) return "explicit";
  return "local";
}

function parseDate(text: string, offsetMs: number): TimeParseResult | null {
  const ms = new Date(normalizeDateString(text)).getTime();
  if (Number.isNaN(ms)) return null;
  return { ok: true, ms: ms + offsetMs, source: "date", zone: dateZone(text), offsetMs };
}

function withinRange(result: TimeParseResult): TimeParseResult {
  if (result.ok && !(Math.abs(result.ms) <= MAX_DATE_MS)) return { ok: false, error: OUT_OF_RANGE };
  return result;
}

/**
 * Reads what a developer types or pastes into the Timestamp tool: an epoch number in any
 * common unit, a date string, or `now`. Each may end with offsets such as `+ 3600` or `- 1d`.
 * Empty input means now.
 */
export function parseTimeInput(input: string, nowMs: number): TimeParseResult {
  const text = input.trim();
  if (!text) return { ok: true, ms: nowMs, source: "now", offsetMs: 0 };

  const now = /^now\b/i.exec(text);
  if (now) {
    const offsetMs = parseOffsets(text.slice(now[0].length));
    if (offsetMs === null) return { ok: false, error: INVALID_INPUT };
    return withinRange({ ok: true, ms: nowMs + offsetMs, source: "now", offsetMs });
  }

  const number = NUMBER_BASE.exec(text);
  if (number) {
    const offsetMs = parseOffsets(text.slice(number[0].length));
    if (offsetMs === null) return { ok: false, error: INVALID_INPUT };
    const unit = number[3] ? EPOCH_SUFFIX[number[3].toLowerCase()] : detectEpochUnit(number[1]);
    const ms = epochToMs(number[1], number[2], unit) + offsetMs;
    return withinRange({ ok: true, ms, source: unit, offsetMs });
  }

  const whole = parseDate(text, 0);
  if (whole) return withinRange(whole);
  const split = DATE_WITH_OFFSETS.exec(text);
  const offsetMs = split ? parseOffsets(split[2]) : null;
  const shifted = split && offsetMs !== null ? parseDate(split[1], offsetMs) : null;
  return shifted ? withinRange(shifted) : { ok: false, error: INVALID_INPUT };
}

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

function wallClockFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? "";
  let formatter = wallClockFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      era: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    wallClockFormatters.set(key, formatter);
  }
  return formatter;
}

/** The calendar date and clock time at `ms` in a time zone. Leave `timeZone` out for local time. */
export function getWallClock(ms: number, timeZone?: string): WallClock {
  const parts: Record<string, string> = {};
  for (const part of wallClockFormatter(timeZone).formatToParts(new Date(ms))) parts[part.type] = part.value;
  const year = Number(parts.year);
  return {
    year: parts.era === "BC" || parts.era === "B" ? 1 - year : year,
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** The UTC milliseconds that show this wall clock in UTC. */
export function utcFromWallClock(clock: WallClock): number {
  const date = new Date(Date.UTC(2000, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second));
  date.setUTCFullYear(clock.year, clock.month - 1, clock.day);
  return date.getTime();
}

const pad = (value: number, length = 2) => String(Math.abs(value)).padStart(length, "0");

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  return `${sign}${pad(Math.trunc(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
}

function formatYear(year: number): string {
  return year < 0 ? `-${pad(year, 6)}` : pad(year, 4);
}

/** Formats `ms` as `YYYY-MM-DD HH:mm:ss` in a time zone, with that zone's UTC offset as `+hh:mm`. */
export function formatInTimeZone(ms: number, timeZone?: string): { dateTime: string; offset: string } {
  const clock = getWallClock(ms, timeZone);
  const offsetMinutes = Math.round((utcFromWallClock(clock) - Math.floor(ms / 1000) * 1000) / 60_000);
  const date = `${formatYear(clock.year)}-${pad(clock.month)}-${pad(clock.day)}`;
  const time = `${pad(clock.hour)}:${pad(clock.minute)}:${pad(clock.second)}`;
  return { dateTime: `${date} ${time}`, offset: formatOffset(offsetMinutes) };
}

/** Formats `ms` as ISO 8601 in a time zone, for example `2024-01-15T17:30:00.000+05:30`. */
export function formatIsoWithOffset(ms: number, timeZone?: string): string {
  const { dateTime, offset } = formatInTimeZone(ms, timeZone);
  const millis = ((ms % 1000) + 1000) % 1000;
  return `${dateTime.replace(" ", "T")}.${pad(millis, 3)}${offset}`;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1000],
];

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Describes `ms` relative to `nowMs` in the largest whole unit, such as "3 hours ago" or "in 2 days". */
export function formatRelativeTime(ms: number, nowMs: number): string {
  const diff = ms - nowMs;
  const [unit, size] = RELATIVE_UNITS.find(([, unitMs]) => Math.abs(diff) >= unitMs) ?? RELATIVE_UNITS[RELATIVE_UNITS.length - 1];
  return relativeFormatter.format(Math.trunc(diff / size) || 0, unit);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface CalendarInfo {
  weekday: string;
  dayOfYear: number;
  daysInYear: number;
  isoWeek: number;
  isoWeekYear: number;
}

/** Weekday, day of year, and ISO 8601 week for the calendar date at `ms` in a time zone. */
export function getCalendarInfo(ms: number, timeZone?: string): CalendarInfo {
  const { year, month, day } = getWallClock(ms, timeZone);
  const dayMs = utcFromWallClock({ year, month, day, hour: 0, minute: 0, second: 0 });
  const startOfYear = utcFromWallClock({ year, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const weekdayIndex = new Date(dayMs).getUTCDay();

  // ISO weeks start on Monday. Week 1 holds the year's first Thursday.
  const thursday = new Date(dayMs + (3 - ((weekdayIndex + 6) % 7)) * 86_400_000);
  const isoWeekYear = thursday.getUTCFullYear();
  const isoYearStart = utcFromWallClock({ year: isoWeekYear, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
  const isoWeek = Math.floor((thursday.getTime() - isoYearStart) / (7 * 86_400_000)) + 1;

  return {
    weekday: WEEKDAYS[weekdayIndex],
    dayOfYear: Math.round((dayMs - startOfYear) / 86_400_000) + 1,
    daysInYear: leap ? 366 : 365,
    isoWeek,
    isoWeekYear,
  };
}

/** True for a time zone name that `Intl` knows, such as `Europe/Berlin`. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** All IANA time zone names the platform knows, or an empty list on older engines. */
export function listTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  try {
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

export const TIME_ZONES_STORAGE_KEY = "devtools-timestamp-zones";

/** Reads the time zones the user added. Drops names this platform does not know. */
export function loadSavedTimeZones(storage: Pick<Storage, "getItem"> | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(TIME_ZONES_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((zone): zone is string => typeof zone === "string" && isValidTimeZone(zone));
  } catch {
    return [];
  }
}

export function saveTimeZones(storage: Pick<Storage, "setItem"> | undefined, zones: string[]): void {
  try {
    storage?.setItem(TIME_ZONES_STORAGE_KEY, JSON.stringify(zones));
  } catch {
    // The list still works for this session.
  }
}

/** The local IANA time zone name, such as `Europe/Berlin`. */
export function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";
}
