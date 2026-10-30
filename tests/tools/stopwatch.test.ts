import { describe, it, expect } from "vitest";
import {
  emptyStopwatch,
  elapsedAt,
  stopwatchAction,
  formatElapsed,
} from "@/utils/stopwatch";
describe("stopwatch", () => {
  it("uses elapsed wall time across delayed frames and sleep", () => {
    const s = stopwatchAction(emptyStopwatch(), "start", 1000);
    expect(elapsedAt(s, 3601000)).toBe(3600000);
    expect(stopwatchAction(s, "start", 2000)).toEqual(s);
  });
  it("pauses, resumes, records cumulative laps, and resets", () => {
    let s = stopwatchAction(emptyStopwatch(), "start", 1000);
    s = stopwatchAction(s, "lap", 2500);
    s = stopwatchAction(s, "pause", 3000);
    expect(elapsedAt(s, 10000)).toBe(2000);
    s = stopwatchAction(s, "start", 10000);
    s = stopwatchAction(s, "lap", 12000);
    expect(s.laps).toEqual([1500, 4000]);
    expect(stopwatchAction(s, "reset", 13000)).toEqual(emptyStopwatch());
  });
  it("formats hours, minutes, seconds and centiseconds", () =>
    expect(formatElapsed(3661234)).toBe("01:01:01.23"));
});
