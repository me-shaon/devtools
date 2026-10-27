import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "@/app/toolRegistry";
import { searchTools } from "@/utils/tool-search";
import {
  DIALECTS,
  detectDialect,
  emitFormat,
  parseFormat,
  renderFormat,
  renderParts,
  translateFormat,
  type Dialect,
  type Part,
} from "@/utils/date-format";

// Tuesday 5 March 2024, 07:08:09.012 UTC. Day 65 of the year, ISO week 10.
const DATE = new Date(Date.UTC(2024, 2, 5, 7, 8, 9, 12));
const PM = new Date(Date.UTC(2024, 10, 21, 19, 4, 5, 300));
const render = (format: string, dialect: Dialect, date = DATE) => renderFormat(format, dialect, date, { utc: true });
const fields = (parts: Part[]) => parts.filter((p) => p.kind !== "literal").map((p) => (p.kind === "field" ? p.field : p.kind === "fraction" ? `frac${p.digits}${p.trim ? "t" : ""}${p.sep}` : `raw:${p.text}`));
const to = (format: string, from: Dialect, target: Dialect) => emitFormat(parseFormat(format, from).parts, target);

describe("Go layouts", () => {
  it("reads the reference time values", () => {
    expect(fields(parseFormat("Mon Jan 2 15:04:05 MST 2006", "go").parts)).toEqual(["weekdayShort", "monthShort", "day", "hour2", "minute2", "second2", "zoneAbbr", "year"]);
    expect(fields(parseFormat("Monday January 1 3:4:5 PM pm 06", "go").parts)).toEqual(["weekdayLong", "monthLong", "month", "hour12", "minute", "second", "ampm", "ampmLower", "year2"]);
  });

  it("tells padded day forms apart", () => {
    expect(fields(parseFormat("_2 __2 002 02", "go").parts)).toEqual(["daySpace", "dayOfYearSpace", "dayOfYear3", "day2"]);
    // "_2006" is a literal underscore and the year.
    const parts = parseFormat("_2006", "go").parts;
    expect(parts).toEqual([{ kind: "literal", text: "_", src: "_" }, { kind: "field", field: "year", src: "2006" }]);
  });

  it("reads fixed and trimmed fractions with their separator", () => {
    expect(fields(parseFormat("05.000", "go").parts)).toEqual(["second2", "frac3."]);
    expect(fields(parseFormat("05.999999", "go").parts)).toEqual(["second2", "frac6t."]);
    expect(fields(parseFormat("05,000", "go").parts)).toEqual(["second2", "frac3,"]);
    // A digit after the run means it is not a fraction: Go reads ".00" as text, then 01.
    expect(fields(parseFormat(".0001", "go").parts)).toEqual(["month2"]);
  });

  it("tells Z offsets from numeric offsets", () => {
    expect(fields(parseFormat("Z07:00 -07:00 Z0700 -0700 Z07 -07", "go").parts)).toEqual(["offsetColonZ", "offsetColon", "offsetZ", "offset", "offsetHourZ", "offsetHour"]);
  });

  it("renders like Go", () => {
    expect(render("2006-01-02T15:04:05.000Z07:00", "go")).toBe("2024-03-05T07:08:09.012Z");
    expect(render("Mon Jan _2 3:04PM", "go")).toBe("Tue Mar  5 7:08AM");
    expect(render("05.999", "go", new Date(Date.UTC(2024, 0, 1, 0, 0, 1, 0)))).toBe("01");
    expect(render("05.999", "go", PM)).toBe("05.3");
  });
});

describe("strftime", () => {
  it("reads directives, flags, and composites", () => {
    expect(fields(parseFormat("%F %T", "c").parts)).toEqual(["year", "month2", "day2", "hour2", "minute2", "second2"]);
    expect(fields(parseFormat("%-d %_d %e %0e %-H %k %l %-I", "c").parts)).toEqual(["day", "daySpace", "daySpace", "day2", "hour", "hourSpace", "hour12Space", "hour12"]);
    expect(fields(parseFormat("%j %-j %u %w %G %V %s %Q", "ruby").parts)).toEqual(["dayOfYear3", "dayOfYear", "weekdayIso", "weekday0", "isoWeekYear", "isoWeek", "unix", "unixMs"]);
  });

  it("reads offsets and fractions", () => {
    expect(fields(parseFormat("%z %:z", "python").parts)).toEqual(["offset", "offsetColon"]);
    expect(fields(parseFormat("%S.%f", "python").parts)).toEqual(["second2", "frac6."]);
    expect(fields(parseFormat("%L %N %3N", "ruby").parts)).toEqual(["frac3", "frac9", "frac3"]);
  });

  it("treats %% as a literal percent sign", () => {
    const { parts } = parseFormat("100%% %Y", "c");
    expect(parts[0]).toMatchObject({ kind: "literal", text: "100% " });
    expect(render("100%% %Y", "c")).toBe("100% 2024");
  });

  it("warns about unknown directives and case flags", () => {
    expect(parseFormat("%q", "c").warnings[0]).toMatch(/not a known strftime directive/);
    expect(parseFormat("%^a", "c").warnings[0]).toMatch(/\^ flag/);
    expect(parseFormat("%Y%", "c").warnings[0]).toMatch(/lone %/);
  });

  it("keeps locale directives as raw tokens", () => {
    expect(fields(parseFormat("%c", "c").parts)).toEqual(["raw:%c"]);
    expect(to("%c", "c", "python").format).toBe("%c");
    expect(to("%c", "c", "go").warnings[0]).toMatch(/no equivalent for %c/);
  });
});

describe("Java and Unicode patterns", () => {
  it("reads letters and quoted text", () => {
    const { parts } = parseFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "java");
    expect(fields(parts)).toEqual(["year", "month2", "day2", "hour2", "minute2", "second2", "frac3.", "offsetColonZ"]);
    expect(render("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "java")).toBe("2024-03-05T07:08:09.012Z");
  });

  it("reads doubled quotes as one quote, inside and outside quoted text", () => {
    expect(render("h 'o''clock'", "java")).toBe("7 o'clock");
    expect(render("''yy", "java")).toBe("'24");
  });

  it("warns about an unclosed quote", () => {
    expect(parseFormat("yyyy 'at", "java").warnings[0]).toMatch(/not closed/);
  });

  it("reads offsets in X, x, and Z forms", () => {
    expect(fields(parseFormat("X XX XXX x xx xxx Z ZZZZZ", "java").parts)).toEqual(["offsetHourZ", "offsetZ", "offsetColonZ", "offsetHour", "offset", "offsetColon", "offset", "offsetColonZ"]);
  });

  it("reads the pad modifier", () => {
    expect(fields(parseFormat("ppd ppH pppD", "java").parts)).toEqual(["daySpace", "hourSpace", "dayOfYearSpace"]);
  });

  it("warns about unquoted letters Java rejects", () => {
    expect(parseFormat("yyyy-MM-ddTHH", "java").warnings[0]).toMatch(/rejects the unquoted letter T/);
  });

  it("drops optional section brackets with a warning", () => {
    const result = parseFormat("HH:mm[:ss]", "java");
    expect(fields(result.parts)).toEqual(["hour2", "minute2", "second2"]);
    expect(result.warnings[0]).toMatch(/Optional sections/);
  });
});

describe("date-fns", () => {
  it("reads date-fns specific tokens", () => {
    expect(fields(parseFormat("do aaa a t T RRRR II i", "datefns").parts)).toEqual(["day", "daySuffix", "ampmLower", "ampm", "unix", "unixMs", "isoWeekYear", "isoWeek", "weekdayIso"]);
    expect(render("do MMMM", "datefns")).toBe("5th March");
  });

  it("warns about the tokens date-fns throws on", () => {
    expect(parseFormat("YYYY-MM-DD", "datefns").warnings.join(" ")).toMatch(/useAdditionalWeekYearTokens.*useAdditionalDayOfYearTokens/);
  });
});

describe("Moment.js and Day.js", () => {
  it("reads tokens, brackets, and backslash escapes", () => {
    const { parts } = parseFormat("YYYY-MM-DD[T]HH:mm:ss.SSSZ", "moment");
    expect(fields(parts)).toEqual(["year", "month2", "day2", "hour2", "minute2", "second2", "frac3.", "offsetColon"]);
    expect(render("[Today is] dddd \\at Do", "moment")).toBe("Today is Tuesday at 5th");
  });

  it("reads moment day and week tokens", () => {
    expect(fields(parseFormat("DDD DDDD d E W GGGG X x ZZ", "moment").parts)).toEqual(["dayOfYear", "dayOfYear3", "weekday0", "weekdayIso", "isoWeek", "isoWeekYear", "unix", "unixMs", "offset"]);
    expect(render("DDDD", "moment")).toBe("065");
  });
});

describe("PHP date()", () => {
  it("reads letters and backslash escapes", () => {
    expect(render("jS F Y \\a\\t g:ia", "php", PM)).toBe("21st November 2024 at 7:04pm");
    expect(render("D, d M y H:i:s", "php")).toBe("Tue, 05 Mar 24 07:08:09");
  });

  it("expands c and r", () => {
    expect(render("c", "php")).toBe("2024-03-05T07:08:09+00:00");
    expect(render("r", "php")).toBe("Tue, 05 Mar 2024 07:08:09 +0000");
  });

  it("counts z from 0", () => {
    expect(render("z", "php")).toBe("64");
  });
});

describe(".NET", () => {
  it("reads specifiers, quotes, and escapes", () => {
    expect(render("yyyy-MM-dd'T'HH:mm:ss.fffzzz", "dotnet")).toBe("2024-03-05T07:08:09.012+00:00");
    expect(render("\"Day\" d \\a\\t h tt", "dotnet")).toBe("Day 5 at 7 AM");
    expect(render("ss.FFF", "dotnet", new Date(Date.UTC(2024, 0, 1)))).toBe("00");
  });

  it("reads a single letter as a standard format", () => {
    expect(parseFormat("d", "dotnet").warnings[0]).toMatch(/standard format/);
    expect(fields(parseFormat("%d", "dotnet").parts)).toEqual(["day"]);
  });
});

describe("emitFormat", () => {
  const ISO_JAVA = "yyyy-MM-dd'T'HH:mm:ss.SSSXXX";
  const expected: Record<Dialect, string> = {
    go: "2006-01-02T15:04:05.000Z07:00",
    c: "%Y-%m-%dT%H:%M:%S%z",
    python: "%Y-%m-%dT%H:%M:%S.%f%:z",
    ruby: "%Y-%m-%dT%H:%M:%S.%L%:z",
    java: ISO_JAVA,
    datefns: ISO_JAVA,
    moment: "YYYY-MM-DD[T]HH:mm:ss.SSSZ",
    php: "Y-m-d\\TH:i:s.vp",
    dotnet: "yyyy-MM-dd'T'HH:mm:ss.fffK",
  };

  it.each(DIALECTS.map((d) => d.id))("translates ISO 8601 with milliseconds to %s", (dialect) => {
    expect(to(ISO_JAVA, "java", dialect).format).toBe(expected[dialect]);
  });

  it("warns when a target has no fractional seconds or no Z", () => {
    const c = to(ISO_JAVA, "java", "c");
    expect(c.warnings.join(" ")).toMatch(/no fractional seconds/);
    expect(c.warnings.join(" ")).toMatch(/never Z/);
    expect(to(ISO_JAVA, "java", "python").warnings.join(" ")).toMatch(/always prints 6 digits/);
    expect(to(ISO_JAVA, "java", "moment").warnings.join(" ")).toMatch(/\+00:00 for UTC/);
  });

  it("escapes literal text in each dialect", () => {
    const parts = parseFormat("Y \\a\\t H \\o'\\c\\l\\o\\c\\k 100%", "php").parts;
    expect(emitFormat(parts, "java").format).toBe("yyyy 'at' HH 'o''clock' 100%");
    expect(emitFormat(parts, "datefns").format).toBe("yyyy 'at' HH 'o''clock' 100%");
    expect(emitFormat(parts, "moment").format).toBe("YYYY [at] HH [o]'[clock] 100%");
    expect(emitFormat(parts, "c").format).toBe("%Y at %H o'clock 100%%");
    expect(emitFormat(parts, "php").format).toBe("Y \\a\\t H \\o'\\c\\l\\o\\c\\k 100%");
    expect(emitFormat(parts, "dotnet").format).toBe("yyyy 'at' HH 'o'\\''clock' 100\\%");
    expect(emitFormat(parts, "go").format).toBe("2006 at 15 o'clock 100%");
  });

  it("keeps escaped text intact through each dialect", () => {
    const parts = parseFormat("yyyy 'at' HH 'o''clock' 100%", "java").parts;
    const want = "2024 at 07 o'clock 100%";
    for (const { id } of DIALECTS) {
      // Go has no escapes, so "100" reads as a month. The Go row warns about it.
      if (id === "go") continue;
      expect(renderFormat(emitFormat(parts, id).format, id, DATE, { utc: true }), id).toBe(want);
    }
    expect(emitFormat(parts, "go").warnings.join(" ")).toMatch(/no escape syntax/);
  });

  it("warns when Go reads literal text as a layout value", () => {
    const result = to("EEEE 'Monday' yyyy", "java", "go");
    expect(result.format).toBe("Monday Monday 2006");
    expect(result.warnings.join(" ")).toMatch(/no escape syntax/);
    expect(to("yyyy-MM-dd", "java", "go").warnings).toEqual([]);
  });

  it("uses the closest token with a warning when there is no exact one", () => {
    expect(to("%j", "c", "go")).toEqual({ format: "002", warnings: [expect.stringMatching(/Go 1.20/)] });
    expect(to("%-H", "c", "go").warnings[0]).toMatch(/no unpadded 24-hour/);
    expect(to("%j", "c", "php")).toEqual({ format: "z", warnings: [expect.stringMatching(/from 0/)] });
    expect(to("z", "php", "c")).toEqual({ format: "%j", warnings: [expect.stringMatching(/from 1/)] });
    expect(to("%s", "c", "go")).toEqual({ format: "", warnings: [expect.stringMatching(/t\.Unix\(\)/)] });
    expect(to("%a %e", "c", "java").format).toBe("EEE ppd");
    expect(to("x", "moment", "php").format).toBe("Uv");
  });

  it("joins the day and ordinal suffix for Moment.js and date-fns", () => {
    expect(to("jS", "php", "moment").format).toBe("Do");
    expect(to("jS", "php", "datefns").format).toBe("do");
    const padded = to("dS", "php", "moment");
    expect(padded.format).toBe("Do");
    expect(padded.warnings.join(" ")).toMatch(/does not pad/);
    expect(to("Do", "moment", "go").warnings[0]).toMatch(/ordinal suffix/);
  });

  it("emits fractions for each dialect", () => {
    expect(to("05.999", "go", "dotnet").format).toBe("ss.FFF");
    expect(to("05.999", "go", "java").warnings[0]).toMatch(/drops trailing zeros/);
    expect(to("%S.%6N", "ruby", "php").format).toBe("s.u");
    expect(to("%S.%6N", "ruby", "go").format).toBe("05.000000");
    expect(to("ssSSS", "java", "go")).toMatchObject({ format: "05.000", warnings: [expect.stringMatching(/Added a dot/)] });
  });

  it("names Day.js plugins and gaps", () => {
    const result = to("GGGG-[W]WW DDDD", "moment", "moment");
    expect(result.warnings.join(" ")).toMatch(/AdvancedFormat plugin for GGGG, WW/);
    expect(result.warnings.join(" ")).toMatch(/does not support DDDD/);
  });

  it("prefixes a lone .NET specifier with %", () => {
    expect(to("%-d", "c", "dotnet").format).toBe("%d");
  });

  it("flags strftime extensions per language", () => {
    expect(to("d", "java", "c").warnings[0]).toMatch(/GNU and BSD extension/);
    expect(to("d", "java", "python").warnings[0]).toMatch(/not on Windows/);
    expect(to("d", "java", "ruby").warnings).toEqual([]);
    expect(to("xxx", "java", "python").warnings[0]).toMatch(/Python 3.12/);
  });
});

describe("round trips", () => {
  const formats: [string, Dialect][] = [
    ["2006-01-02T15:04:05.000Z07:00", "go"],
    ["Mon, 02 Jan 2006 15:04:05 -0700", "go"],
    ["%Y-%m-%d %H:%M:%S %Z", "ruby"],
    ["yyyy-MM-dd HH:mm:ss", "java"],
    ["EEEE, MMMM d, yyyy h:mm a", "java"],
    ["YYYY-MM-DD HH:mm:ss ZZ", "moment"],
    ["l jS \\o\\f F Y h:i:s A", "php"],
  ];

  it.each(formats)("renders %s the same in every exact target", (format, source) => {
    const { parts } = parseFormat(format, source);
    const want = renderParts(parts, PM, { utc: true });
    for (const { id } of DIALECTS) {
      const result = emitFormat(parts, id);
      if (result.warnings.length) continue;
      expect(renderFormat(result.format, id, PM, { utc: true }), `${id}: ${result.format}`).toBe(want);
    }
  });
});

describe("renderParts", () => {
  it("renders calendar fields", () => {
    expect(render("%j %u %w %V %G %a %A %b %B", "c")).toBe("065 2 2 10 2024 Tue Tuesday Mar March");
    expect(render("Q", "moment", PM)).toBe("4");
    expect(render("hh:mm A a", "moment", PM)).toBe("07:04 PM pm");
  });

  it("renders ISO weeks across a year boundary", () => {
    // 1 January 2021 is a Friday in ISO week 53 of 2020.
    expect(render("%G-W%V-%u", "c", new Date(Date.UTC(2021, 0, 1)))).toBe("2020-W53-5");
  });

  it("renders Unix time", () => {
    expect(render("X x", "moment")).toBe(`${Math.floor(DATE.getTime() / 1000)} ${DATE.getTime()}`);
  });

  it("renders ordinal suffixes", () => {
    const day = (d: number) => render("jS", "php", new Date(Date.UTC(2024, 0, d)));
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(day)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd"]);
  });
});

describe("detectDialect", () => {
  it.each([
    ["2006-01-02T15:04:05Z07:00", "go"],
    ["3:04PM", "go"],
    ["02 Jan 06 15:04 MST", "go"],
    ["%Y-%m-%d", "c"],
    ["%Y-%m-%dT%H:%M:%S.%f", "python"],
    ["%Y-%m-%d %H:%M:%S.%L", "ruby"],
    ["yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "java"],
    ["dd/MM/yyyy", "java"],
    ["h 'o''clock'", "java"],
    ["YYYY-MM-DD", "moment"],
    ["MMM D, YYYY", "moment"],
    ["YYYY-MM-DD[T]HH:mm:ss", "moment"],
    ["Y-m-d H:i:s", "php"],
    ["d.m.Y", "php"],
    ["D, d M Y", "php"],
    ["yyyy-MM-ddTHH:mm:ss.fffzzz", "dotnet"],
    ["MM/dd/yyyy hh:mm tt", "dotnet"],
    ["do MMMM yyyy", "datefns"],
  ] as [string, Dialect][])("detects %s as %s", (format, dialect) => {
    expect(detectDialect(format)).toBe(dialect);
  });

  it("reports the detected source in translateFormat", () => {
    const result = translateFormat("Y-m-d");
    expect(result.source).toBe("php");
    expect(result.detected).toBe(true);
    expect(result.targets.php.format).toBe("Y-m-d");
    expect(result.targets.go.format).toBe("2006-01-02");
    expect(translateFormat("Y-m-d", "java").source).toBe("java");
  });
});

describe("tool search", () => {
  it.each(["strftime", "golang time format", "simpledateformat", "moment format", "php date"])("finds the tool by %s", (query) => {
    expect(searchTools([...ALL_TOOLS], query)[0]?.id).toBe("date-format");
  });
});
