/**
 * Converts a date and time on the clock in one time zone to the same moment in other zones.
 * All zone data comes from Intl, so the conversion works offline.
 */

import { getWallClock, isValidTimeZone, utcFromWallClock, type WallClock } from "@/utils/timestamp";

/**
 * The moment for a wall-clock time in a zone. A time in a spring-forward gap does not exist,
 * so it moves ahead by the gap. A time in a fall-back overlap happens twice, so both moments are given.
 */
export type ZonedResolution =
  | { kind: "exact"; ms: number }
  | { kind: "gap"; ms: number; gapMinutes: number }
  | { kind: "overlap"; ms: number; laterMs: number };

const DAY_MS = 86_400_000;

const sameClock = (a: WallClock, b: WallClock) =>
  a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute && a.second === b.second;

/** The zone's UTC offset at `ms`, in milliseconds. */
function offsetAt(ms: number, timeZone: string): number {
  return utcFromWallClock(getWallClock(ms, timeZone)) - Math.floor(ms / 1000) * 1000;
}

export function resolveWallClock(clock: WallClock, timeZone: string): ZonedResolution {
  const asUtc = utcFromWallClock(clock);
  // Offsets change at most once in a day, so the offsets a day apart cover both sides of a change
  const before = offsetAt(asUtc - DAY_MS, timeZone);
  const after = offsetAt(asUtc + DAY_MS, timeZone);

  const matches = Array.from(new Set([before, after, offsetAt(asUtc, timeZone)]))
    .map((offset) => asUtc - offset)
    .filter((ms) => sameClock(getWallClock(ms, timeZone), clock))
    .sort((a, b) => a - b);

  if (matches.length >= 2) return { kind: "overlap", ms: matches[0], laterMs: matches[matches.length - 1] };
  if (matches.length === 1) return { kind: "exact", ms: matches[0] };
  // With the offset from before the gap, the time lands after the gap, moved ahead by its length
  return { kind: "gap", ms: asUtc - before, gapMinutes: Math.round(Math.abs(after - before) / 60_000) };
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const daysInMonth = (year: number, month: number) => (month === 2 && isLeap(year) ? 29 : MONTH_DAYS[month - 1]);

/** Reads a `datetime-local` value such as `2024-03-10T02:30` or `2024-03-10T02:30:15`. */
export function parseWallClockInput(value: string): WallClock | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second = 0] = match.slice(1).map((part) => Number(part ?? 0));
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { year, month, day, hour, minute, second };
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** Formats a wall clock as a `datetime-local` value with seconds. */
export function formatWallClockInput(clock: WallClock): string {
  return `${pad(clock.year, 4)}-${pad(clock.month)}-${pad(clock.day)}T${pad(clock.hour)}:${pad(clock.minute)}:${pad(clock.second)}`;
}

/** How many calendar days the date in `toZone` is ahead of the date in `fromZone` at `ms`. */
export function dayShift(ms: number, fromZone: string, toZone: string): number {
  const dateMs = (zone: string) => {
    const { year, month, day } = getWallClock(ms, zone);
    return utcFromWallClock({ year, month, day, hour: 0, minute: 0, second: 0 });
  };
  return Math.round((dateMs(toZone) - dateMs(fromZone)) / DAY_MS);
}

/** The listed spelling of a typed zone name, so "asia/tokyo" becomes "Asia/Tokyo". Null for an unknown name. */
export function canonicalTimeZone(typed: string, options: readonly string[]): string | null {
  const name = typed.trim();
  if (!isValidTimeZone(name)) return null;
  return options.find((option) => option.toLowerCase() === name.toLowerCase()) ?? name;
}
