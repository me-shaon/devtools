import { describe, expect, it } from "vitest";
import {
  canonicalTimeZone,
  dayShift,
  formatWallClockInput,
  parseWallClockInput,
  resolveWallClock,
} from "@/utils/time-zone";

const clock = (text: string) => parseWallClockInput(text)!;
const iso = (ms: number) => new Date(ms).toISOString();

describe("parseWallClockInput", () => {
  it("reads datetime-local values with and without seconds", () => {
    expect(parseWallClockInput("2024-03-10T02:30")).toEqual({ year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 0 });
    expect(parseWallClockInput("2024-03-10T02:30:15")?.second).toBe(15);
  });

  it("rejects empty and impossible values", () => {
    expect(parseWallClockInput("")).toBeNull();
    expect(parseWallClockInput("2024-02-30T10:00")).toBeNull();
    expect(parseWallClockInput("2024-01-01T24:00")).toBeNull();
  });

  it("round-trips through formatWallClockInput", () => {
    expect(formatWallClockInput(clock("2024-03-10T02:30:15"))).toBe("2024-03-10T02:30:15");
    expect(formatWallClockInput(clock("2024-03-10T02:30"))).toBe("2024-03-10T02:30:00");
  });
});

describe("resolveWallClock", () => {
  it("converts a plain time in a named zone", () => {
    expect(resolveWallClock(clock("2024-01-15T09:00"), "America/New_York")).toEqual({
      kind: "exact",
      ms: Date.parse("2024-01-15T14:00:00Z"),
    });
    expect(iso(resolveWallClock(clock("2024-07-15T09:00"), "America/New_York").ms)).toBe("2024-07-15T13:00:00.000Z");
    expect(iso(resolveWallClock(clock("2024-01-15T09:00"), "UTC").ms)).toBe("2024-01-15T09:00:00.000Z");
  });

  it("handles half-hour and quarter-hour offsets", () => {
    expect(iso(resolveWallClock(clock("2024-01-15T09:00"), "Asia/Kolkata").ms)).toBe("2024-01-15T03:30:00.000Z");
    expect(iso(resolveWallClock(clock("2024-01-15T09:00"), "Asia/Kathmandu").ms)).toBe("2024-01-15T03:15:00.000Z");
  });

  it("moves a time in a spring-forward gap ahead by the gap", () => {
    const result = resolveWallClock(clock("2024-03-10T02:30"), "America/New_York");
    expect(result).toMatchObject({ kind: "gap", gapMinutes: 60 });
    expect(iso(result.ms)).toBe("2024-03-10T07:30:00.000Z"); // 03:30 EDT
  });

  it("returns both times in a fall-back overlap, earlier first", () => {
    const result = resolveWallClock(clock("2024-11-03T01:30"), "America/New_York");
    expect(result.kind).toBe("overlap");
    expect(iso(result.ms)).toBe("2024-11-03T05:30:00.000Z"); // 01:30 EDT
    expect(result.kind === "overlap" && iso(result.laterMs)).toBe("2024-11-03T06:30:00.000Z"); // 01:30 EST
  });

  it("handles the 30-minute daylight saving shift on Lord Howe Island", () => {
    const gap = resolveWallClock(clock("2024-10-06T02:15"), "Australia/Lord_Howe");
    expect(gap).toMatchObject({ kind: "gap", gapMinutes: 30 });
    const overlap = resolveWallClock(clock("2024-04-07T01:45"), "Australia/Lord_Howe");
    expect(overlap.kind).toBe("overlap");
    expect(overlap.kind === "overlap" && overlap.laterMs - overlap.ms).toBe(30 * 60_000);
  });
});

describe("dayShift", () => {
  it("compares calendar dates across zones", () => {
    const ms = Date.parse("2024-01-15T22:00:00Z");
    expect(dayShift(ms, "UTC", "Asia/Tokyo")).toBe(1);
    expect(dayShift(ms, "UTC", "Europe/London")).toBe(0);
    expect(dayShift(Date.parse("2024-01-15T02:00:00Z"), "UTC", "America/Los_Angeles")).toBe(-1);
    expect(dayShift(Date.parse("2024-12-31T20:00:00Z"), "UTC", "Pacific/Kiritimati")).toBe(1);
  });
});

describe("canonicalTimeZone", () => {
  const options = ["Asia/Tokyo", "Europe/Berlin"];

  it("uses the listed spelling and rejects unknown names", () => {
    expect(canonicalTimeZone(" asia/tokyo ", options)).toBe("Asia/Tokyo");
    expect(canonicalTimeZone("UTC", options)).toBe("UTC");
    expect(canonicalTimeZone("Mars/Base", options)).toBeNull();
    expect(canonicalTimeZone("", options)).toBeNull();
  });
});
