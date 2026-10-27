import { describe, expect, it } from "vitest";
import {
  CRON_EXAMPLES,
  describeCron,
  describeCronField,
  formatTimeUntil,
  nextCronRuns,
  parseCron,
  readCronInput,
  replaceCronField,
  type CronSchedule,
} from "@/utils/cron";

const schedule = (expression: string, aws = false): CronSchedule => {
  const result = parseCron(expression, { aws });
  if (!result.ok) throw new Error(result.error);
  return result.schedule;
};

const errorOf = (expression: string) => {
  const result = parseCron(expression);
  if (result.ok) throw new Error(`expected an error for ${expression}`);
  return result;
};

const runs = (expression: string, from: string, count = 3, timeZone = "UTC") =>
  nextCronRuns(schedule(expression), new Date(from), count, timeZone).map((date) => date.toISOString());

describe("parseCron", () => {
  it("reads the standard 5-field layout", () => {
    const parsed = schedule("0 */6 * * 1-5");
    expect(parsed.dialect).toBe("standard");
    expect(parsed.fields.map((field) => field.name)).toEqual(["minute", "hour", "dayOfMonth", "month", "dayOfWeek"]);
    expect(parsed.fields[1].values).toEqual([0, 6, 12, 18]);
    expect(parsed.fields[4].values).toEqual([1, 2, 3, 4, 5]);
  });

  it("reads lists, ranges with steps, and start/step values", () => {
    expect(schedule("0 9,12,15 * * *").fields[1].values).toEqual([9, 12, 15]);
    expect(schedule("0-30/10 * * * *").fields[0].values).toEqual([0, 10, 20, 30]);
    expect(schedule("5/20 * * * *").fields[0].values).toEqual([5, 25, 45]);
  });

  it("reads month and day names in any case", () => {
    const parsed = schedule("0 0 * jan-MAR mon,Wed,FRI");
    expect(parsed.fields[3].values).toEqual([1, 2, 3]);
    expect(parsed.fields[4].values).toEqual([1, 3, 5]);
  });

  it("treats 7 as Sunday in standard cron", () => {
    expect(schedule("0 0 * * 7").fields[4].values).toEqual([0]);
    expect(schedule("0 0 * * 5-7").fields[4].values).toEqual([0, 5, 6]);
  });

  it("reads 6 fields as seconds first", () => {
    const parsed = schedule("30 0 9 * * MON-FRI");
    expect(parsed.dialect).toBe("seconds");
    expect(parsed.fields[0].name).toBe("second");
    expect(parsed.fields[0].values).toEqual([30]);
  });

  it("reads Quartz expressions with ? and 1 as Sunday", () => {
    const parsed = schedule("0 0 12 ? * 2");
    expect(parsed.dialect).toBe("quartz");
    expect(parsed.fields[5].values).toEqual([1]);
    expect(schedule("0 0 12 ? * MON-FRI 2030").fields[6].values).toEqual([2030]);
  });

  it("reads AWS expressions as minute first with a year", () => {
    const parsed = schedule("0 12 * * ? *", true);
    expect(parsed.dialect).toBe("aws");
    expect(parsed.fields.map((field) => field.name)).toEqual(["minute", "hour", "dayOfMonth", "month", "dayOfWeek", "year"]);
  });

  it("expands macros", () => {
    const parsed = schedule("@daily");
    expect(parsed.macro).toBe("@daily");
    expect(parsed.expanded).toBe("0 0 * * *");
    expect(schedule("@hourly").expanded).toBe("0 * * * *");
    expect(schedule("@annually").expanded).toBe("0 0 1 1 *");
  });

  it("explains @reboot instead of failing silently", () => {
    expect(errorOf("@reboot").error).toMatch(/runs once when cron starts/);
  });

  it("points at the bad field with a precise message", () => {
    expect(errorOf("0 24 * * *")).toMatchObject({ fieldIndex: 1, error: "Hour: 24 is out of range. Use 0 to 23." });
    expect(errorOf("0 9 * * FRY")).toMatchObject({ fieldIndex: 4, error: 'Day of week: "FRY" is not a day name. Use SUN to SAT, or 0 to 7 (0 and 7 are Sunday).' });
    expect(errorOf("0 9 * JNA *")).toMatchObject({ fieldIndex: 3 });
    expect(errorOf("*/0 * * * *").error).toBe('Minute: the step in "*/0" must be a whole number of 1 or more.');
    expect(errorOf("0 17-9 * * *").error).toMatch(/^Hour: the range 17-9 goes backward/);
    expect(errorOf("0 9am * * *").error).toBe('Hour: "9am" is not a number. Use 0 to 23.');
    expect(errorOf("? * * * *").error).toBe('Minute: "?" only works in the day-of-month and day-of-week fields.');
    expect(errorOf("L * * * *").error).toMatch(/^Minute: "L" uses L, W, or #/);
    expect(errorOf("0 0 * * 1#6").error).toMatch(/^Day of week:/);
    expect(errorOf("0 0 32 * *")).toMatchObject({ fieldIndex: 2, error: "Day of month: 32 is out of range. Use 1 to 31." });
  });

  it("explains a wrong field count", () => {
    expect(errorOf("0 0").error).toBe("Expected 5 fields (minute hour day-of-month month day-of-week), or 6 to 7 with seconds first. Found 2.");
    expect(errorOf("@dayly").error).toMatch(/^Unknown macro "@dayly"/);
    expect(errorOf("").error).toMatch(/Enter a cron expression/);
  });
});

describe("describeCron", () => {
  it("lists exact times when there are only a few", () => {
    expect(describeCron(schedule("0 */6 * * 1-5"))).toBe("At 00:00, 06:00, 12:00 and 18:00, on Monday through Friday");
    expect(describeCron(schedule("30 9 * * *"))).toBe("At 09:30, every day");
    expect(describeCron(schedule("@daily"))).toBe("At 00:00, every day");
  });

  it("describes repeating times", () => {
    expect(describeCron(schedule("* * * * *"))).toBe("Every minute");
    expect(describeCron(schedule("*/15 * * * *"))).toBe("Every 15 minutes");
    expect(describeCron(schedule("*/15 9-17 * * *"))).toBe("Every 15 minutes, between 09:00 and 17:59");
    expect(describeCron(schedule("5 * * * *"))).toBe("At minute 5 of every hour");
    expect(describeCron(schedule("*/10 * * * * *"))).toBe("Every 10 seconds");
  });

  it("describes day, month, and special day rules", () => {
    expect(describeCron(schedule("0 0 1 */3 *"))).toBe("At 00:00, on day 1 of the month, every 3 months");
    expect(describeCron(schedule("0 0 L * ?"))).toBe("At 00:00, on the last day of the month");
    expect(describeCron(schedule("0 0 12 ? * 6#3"))).toBe("At 12:00, on the third Friday of the month");
    expect(describeCron(schedule("0 0 0 ? * 6L"))).toBe("At 00:00, on the last Friday of the month");
    expect(describeCron(schedule("0 0 0 15W * ?"))).toBe("At 00:00, on the weekday nearest day 15 of the month");
  });

  it("makes the standard cron day-of-month OR day-of-week rule explicit", () => {
    expect(describeCron(schedule("0 0 13 * 5"))).toBe("At 00:00, on day 13 of the month or on Friday");
  });
});

describe("describeCronField", () => {
  it("explains each field on its own", () => {
    const fields = schedule("0 */6 * JAN,JUL 1-5").fields;
    expect(describeCronField(fields[0])).toBe("minute 0");
    expect(describeCronField(fields[1])).toBe("every 6 hours");
    expect(describeCronField(fields[2])).toBe("every day");
    expect(describeCronField(fields[3])).toBe("January and July");
    expect(describeCronField(fields[4])).toBe("Monday through Friday");
  });
});

describe("nextCronRuns", () => {
  it("finds the next runs after a moment", () => {
    expect(runs("0 */6 * * 1-5", "2024-01-05T19:00:00Z")).toEqual([
      "2024-01-08T00:00:00.000Z",
      "2024-01-08T06:00:00.000Z",
      "2024-01-08T12:00:00.000Z",
    ]);
    expect(runs("* * * * *", "2024-01-01T10:30:30Z", 2)).toEqual(["2024-01-01T10:31:00.000Z", "2024-01-01T10:32:00.000Z"]);
  });

  it("supports seconds", () => {
    expect(runs("*/20 * * * * *", "2024-01-01T10:30:30Z")).toEqual([
      "2024-01-01T10:30:40.000Z",
      "2024-01-01T10:31:00.000Z",
      "2024-01-01T10:31:20.000Z",
    ]);
  });

  it("runs on either day when both day fields are set in standard cron", () => {
    // 2024-09-13 is a Friday. Day 13 or any Friday matches.
    expect(runs("0 0 13 * 5", "2024-09-01T00:00:00Z")).toEqual([
      "2024-09-06T00:00:00.000Z",
      "2024-09-13T00:00:00.000Z",
      "2024-09-20T00:00:00.000Z",
    ]);
    // With seconds first, both day fields must match.
    expect(runs("0 0 0 13 * 5", "2024-01-01T00:00:00Z", 1)).toEqual(["2024-09-13T00:00:00.000Z"]);
  });

  it("handles last day, nearest weekday, and nth weekday rules", () => {
    expect(runs("0 0 L 2 *", "2024-01-01T00:00:00Z", 2)).toEqual(["2024-02-29T00:00:00.000Z", "2025-02-28T00:00:00.000Z"]);
    // 2024-06-15 is a Saturday, so 15W runs on Friday the 14th.
    expect(runs("0 0 0 15W 6 ?", "2024-01-01T00:00:00Z", 1)).toEqual(["2024-06-14T00:00:00.000Z"]);
    // Second Monday (Quartz 2 = Monday) of January 2024 is the 8th.
    expect(runs("0 0 9 ? 1 2#2", "2024-01-01T00:00:00Z", 1)).toEqual(["2024-01-08T09:00:00.000Z"]);
  });

  it("uses the time zone", () => {
    // 09:00 in New York is 14:00 UTC in winter and 13:00 UTC in summer.
    expect(runs("0 9 * * *", "2024-03-08T00:00:00Z", 3, "America/New_York")).toEqual([
      "2024-03-08T14:00:00.000Z",
      "2024-03-09T14:00:00.000Z",
      "2024-03-10T13:00:00.000Z",
    ]);
  });

  it("skips wall times that do not exist because of daylight saving time", () => {
    // 02:30 does not exist in New York on 2024-03-10.
    expect(runs("30 2 * * *", "2024-03-09T12:00:00Z", 2, "America/New_York")).toEqual([
      "2024-03-11T06:30:00.000Z",
      "2024-03-12T06:30:00.000Z",
    ]);
  });

  it("returns nothing for a schedule that never happens", () => {
    expect(runs("0 0 30 2 *", "2024-01-01T00:00:00Z")).toEqual([]);
  });

  it("respects the year field", () => {
    expect(runs("0 0 0 1 1 ? 2030", "2024-01-01T00:00:00Z", 2)).toEqual(["2030-01-01T00:00:00.000Z"]);
  });
});

describe("readCronInput", () => {
  it("strips a crontab command", () => {
    expect(readCronInput("0 2 * * * /usr/bin/backup.sh --full")).toMatchObject({ expression: "0 2 * * *", command: "/usr/bin/backup.sh --full" });
    expect(readCronInput("0 2 * * * root run-parts /etc/cron.daily")).toMatchObject({ expression: "0 2 * * *", command: "root run-parts /etc/cron.daily" });
    expect(readCronInput("@daily php artisan schedule:run")).toMatchObject({ expression: "@daily", command: "php artisan schedule:run" });
  });

  it("strips YAML keys and quotes from GitHub Actions and Kubernetes", () => {
    expect(readCronInput("- cron: '0 */6 * * 1-5'").expression).toBe("0 */6 * * 1-5");
    expect(readCronInput('schedule: "*/5 * * * *"').expression).toBe("*/5 * * * *");
  });

  it("reads a time zone prefix and the AWS wrapper", () => {
    expect(readCronInput("CRON_TZ=Europe/Berlin 0 9 * * *")).toMatchObject({ expression: "0 9 * * *", timeZone: "Europe/Berlin" });
    expect(readCronInput("cron(0 12 * * ? *)")).toMatchObject({ expression: "0 12 * * ? *", aws: true });
  });

  it("keeps a typo inside the expression so the error points at it", () => {
    expect(readCronInput("0 9 * * MOM").expression).toBe("0 9 * * MOM");
  });
});

describe("replaceCronField", () => {
  it("edits one field and keeps the rest of the text", () => {
    expect(replaceCronField("0 */6 * * 1-5", 1, "*/4")).toBe("0 */4 * * 1-5");
    expect(replaceCronField("- cron: '0 2 * * *'", 0, "30")).toBe("- cron: '30 2 * * *'");
    expect(replaceCronField("0 2 * * * /bin/job", 4, "MON")).toBe("0 2 * * MON /bin/job");
  });

  it("expands a macro before it edits a field", () => {
    expect(replaceCronField("@daily", 1, "6")).toBe("0 6 * * *");
  });
});

describe("helpers", () => {
  it("formats the time until a run", () => {
    expect(formatTimeUntil(30_000)).toBe("in 30 s");
    expect(formatTimeUntil(5 * 60_000)).toBe("in 5 min");
    expect(formatTimeUntil(3 * 3_600_000 + 20 * 60_000)).toBe("in 3 h 20 min");
    expect(formatTimeUntil(3 * 86_400_000 + 3_600_000)).toBe("in 3 days");
  });

  it("ships examples that all parse", () => {
    expect(CRON_EXAMPLES.length).toBeGreaterThanOrEqual(8);
    for (const example of CRON_EXAMPLES) {
      expect(parseCron(example.expression).ok, example.expression).toBe(true);
    }
  });
});
