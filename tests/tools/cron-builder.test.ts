import { describe, it, expect } from "vitest";
import { cronFieldValue } from "@/utils/cron-builder";
import { parseCron, readCronInput, replaceCronField } from "@/utils/cron";
describe("cron builder", () => {
  it("builds patterns and rejects bad ranges", () => {
    expect(cronFieldValue("interval", "5", "10")).toBe("5/10");
    expect(cronFieldValue("specific", "1,3,5", "")).toBe("1,3,5");
    expect(() => cronFieldValue("range", "10", "2")).toThrow();
    expect(() => cronFieldValue("interval", "0", "0")).toThrow();
  });
  it("preserves command and timezone around edits", () => {
    const text = replaceCronField(
      "CRON_TZ=UTC 0 9 * * MON-FRI /bin/run",
      0,
      "*/5",
    );
    expect(text).toBe("CRON_TZ=UTC */5 9 * * MON-FRI /bin/run");
    expect(parseCron(readCronInput(text).expression).ok).toBe(true);
  });
  it("preserves advanced Quartz fields when another field changes", () =>
    expect(replaceCronField("0 0 9 ? * MON#2", 1, "10")).toBe(
      "0 10 9 ? * MON#2",
    ));
});
