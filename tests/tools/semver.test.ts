import { describe, expect, it } from "vitest";
import {
  compareVersions,
  composerStability,
  describeComparators,
  evaluateRange,
  nextVersions,
  normalizeComposerVersion,
  parseCargoRange,
  phpVersionCompare,
  splitVersions,
  type VersionDialect,
} from "@/utils/semver";

/** Maps each version to its status for a range. */
const statuses = (dialect: VersionDialect, range: string, versions: string[]) => {
  const result = evaluateRange(dialect, range, versions);
  if (!result.ok) throw new Error(result.error);
  return Object.fromEntries(result.checks.map((check) => [check.input, check.status ?? check.error]));
};

const normalized = (dialect: VersionDialect, range: string) => {
  const result = evaluateRange(dialect, range, []);
  return result.ok ? result.explanation.normalized : `error: ${result.error}`;
};

describe("splitVersions", () => {
  it("reads one version per line and also splits on commas and spaces", () => {
    expect(splitVersions("1.0.0\n 1.2.0 , 2.0.0\n\n3.0.0 4.0.0")).toEqual(["1.0.0", "1.2.0", "2.0.0", "3.0.0", "4.0.0"]);
  });
});

describe("npm ranges", () => {
  it("normalizes caret, tilde, and OR to comparators", () => {
    expect(normalized("npm", "^1.2 || ~2.0")).toBe(">=1.2.0 <2.0.0-0 || >=2.0.0 <2.1.0-0");
    expect(normalized("npm", "~0.3.1")).toBe(">=0.3.1 <0.4.0-0");
    expect(normalized("npm", "^0.0.3")).toBe(">=0.0.3 <0.0.4-0");
    expect(normalized("npm", "1.2.3 - 2.3")).toBe(">=1.2.3 <2.4.0-0");
    expect(normalized("npm", "*")).toBe("*");
  });

  it("checks versions and finds the highest match", () => {
    const result = evaluateRange("npm", "^1.2 || ~2.0", ["1.1.9", "1.4.2", "1.9.0-beta.1", "2.0.5", "2.1.0"]);
    expect(result.ok && result.checks.map((check) => check.status)).toEqual(["miss", "match", "prerelease", "match", "miss"]);
    expect(result.ok && result.highest).toBe("2.0.5");
    expect(result.ok && result.checks[3].highest).toBe(true);
  });

  it("lets a pre-release in only for a version that a comparator names", () => {
    expect(statuses("npm", ">=2.0.0-beta.2 <2.0.0", ["2.0.0-beta.11", "2.0.0-rc.1", "2.0.0-beta.1", "1.9.0"])).toEqual({
      "2.0.0-beta.11": "match",
      "2.0.0-rc.1": "match",
      "2.0.0-beta.1": "miss",
      "1.9.0": "miss",
    });
    const result = evaluateRange("npm", "^2.0.0-rc.1", []);
    expect(result.ok && result.explanation.notes[0]).toBe("Pre-releases match only for 2.0.0, because a comparator names a pre-release of that version.");
  });

  it("explains the range in plain English", () => {
    const result = evaluateRange("npm", "^1.2 || 1.5.0", []);
    expect(result.ok && result.explanation.sentences).toEqual(["At least 1.2.0 and below 2.0.0.", "Exactly 1.5.0."]);
  });

  it("reports invalid ranges and versions", () => {
    expect(normalized("npm", ">=1.2 <")).toBe("error: Invalid comparator: <. Check the operators and versions.");
    expect(evaluateRange("npm", "^1", ["1.2"]).ok && evaluateRange("npm", "^1", ["1.2"]).checks[0].error).toMatch(/Not a valid SemVer version/);
  });

  it("explains when only pre-releases fall inside the bounds", () => {
    const result = evaluateRange("npm", "^1.2", ["1.3.0-beta.1", "1.1.0"]);
    expect(result.ok && result.highest).toBeUndefined();
    expect(result.ok && result.highestNote).toMatch(/The highest is 1.3.0-beta.1/);
  });
});

describe("Cargo ranges", () => {
  it("reads a bare version as a caret requirement", () => {
    expect(normalized("cargo", "1.2")).toBe(">=1.2.0, <2.0.0");
    expect(normalized("cargo", "0.3.1")).toBe(">=0.3.1, <0.4.0");
    expect(normalized("cargo", "0.0.3")).toBe(">=0.0.3, <0.0.4");
    expect(normalized("cargo", "0")).toBe(">=0.0.0, <1.0.0");
    expect(normalized("cargo", "0.0")).toBe(">=0.0.0, <0.1.0");
    expect(statuses("cargo", "1.2", ["1.2.0", "1.9.9", "2.0.0", "1.1.0"])).toEqual({ "1.2.0": "match", "1.9.9": "match", "2.0.0": "miss", "1.1.0": "miss" });
  });

  it("joins comma-separated comparators with AND", () => {
    expect(normalized("cargo", ">=1.2, <1.5")).toBe(">=1.2.0, <1.5.0");
    expect(statuses("cargo", ">= 1.2, < 1.5", ["1.4.9", "1.5.0"])).toEqual({ "1.4.9": "match", "1.5.0": "miss" });
  });

  it("expands tilde, exact, wildcard, and partial comparators", () => {
    expect(normalized("cargo", "~1.2.3")).toBe(">=1.2.3, <1.3.0");
    expect(normalized("cargo", "~1")).toBe(">=1.0.0, <2.0.0");
    expect(normalized("cargo", "=1.2.3")).toBe("=1.2.3");
    expect(normalized("cargo", "=1.2")).toBe(">=1.2.0, <1.3.0");
    expect(normalized("cargo", "1.*")).toBe(">=1.0.0, <2.0.0");
    expect(normalized("cargo", "1.2.*")).toBe(">=1.2.0, <1.3.0");
    expect(normalized("cargo", ">1.2")).toBe(">=1.3.0");
    expect(normalized("cargo", "<=1.2")).toBe("<1.3.0");
    expect(normalized("cargo", "*")).toBe("*");
    expect(statuses("cargo", "=1.2", ["1.2.7", "1.3.0"])).toEqual({ "1.2.7": "match", "1.3.0": "miss" });
  });

  it("matches a pre-release only when a comparator names one with the same version", () => {
    expect(statuses("cargo", ">=1.2.3-alpha.1, <2", ["1.2.3-alpha.2", "1.2.3-alpha.0", "1.3.0-beta", "1.5.0"])).toEqual({
      "1.2.3-alpha.2": "match",
      "1.2.3-alpha.0": "miss",
      "1.3.0-beta": "prerelease",
      "1.5.0": "match",
    });
    // A wildcard compares the pre-release as an exact match, so it never lets one in.
    expect(statuses("cargo", "1.*", ["1.3.0-beta"])).toEqual({ "1.3.0-beta": "miss" });
  });

  it("rejects syntax that Cargo rejects", () => {
    expect(parseCargoRange("^1.2 || ^2")).toMatchObject({ ok: false, error: expect.stringContaining("does not support ||") });
    expect(parseCargoRange(">=1.2 <1.5")).toMatchObject({ ok: false, error: expect.stringContaining("Cargo separates comparators with commas") });
    expect(parseCargoRange("*, >=1")).toMatchObject({ ok: false, error: expect.stringContaining("must be the only comparator") });
    expect(parseCargoRange("1.*.3")).toMatchObject({ ok: false, error: expect.stringContaining("cannot follow a wildcard") });
    expect(parseCargoRange("1.2-beta")).toMatchObject({ ok: false, error: expect.stringContaining("needs a full version") });
    expect(parseCargoRange("01.2")).toMatchObject({ ok: false, error: expect.stringContaining("leading zero") });
  });

  it("rejects a v prefix on versions", () => {
    const result = evaluateRange("cargo", "1", ["v1.2.3"]);
    expect(result.checks[0].error).toBe("Not a valid Cargo version. Cargo versions have no v or = prefix.");
  });
});

describe("Composer constraints", () => {
  // The expected values come from composer/semver 3.4 (VersionParser::parseConstraints and Semver::satisfies).
  it("normalizes constraints like composer/semver", () => {
    expect(normalized("composer", "^1.2 || ^2.0")).toBe(">=1.2.0.0-dev <2.0.0.0-dev || >=2.0.0.0-dev <3.0.0.0-dev");
    expect(normalized("composer", "~1.2")).toBe(">=1.2.0.0-dev <2.0.0.0-dev");
    expect(normalized("composer", "~1.2.3")).toBe(">=1.2.3.0-dev <1.3.0.0-dev");
    expect(normalized("composer", "^0.0.3")).toBe(">=0.0.3.0-dev <0.0.4.0-dev");
    expect(normalized("composer", "1.2.*")).toBe(">=1.2.0.0-dev <1.3.0.0-dev");
    expect(normalized("composer", "0.*")).toBe("<1.0.0.0-dev");
    expect(normalized("composer", "1.0 - 2.0")).toBe(">=1.0.0.0-dev <2.1.0.0-dev");
    expect(normalized("composer", "1.0.0 - 2.1.0")).toBe(">=1.0.0.0-dev <=2.1.0.0");
    expect(normalized("composer", "1.2")).toBe("==1.2.0.0");
    expect(normalized("composer", ">=1.0,<1.5")).toBe(">=1.0.0.0-dev <1.5.0.0-dev");
    expect(normalized("composer", ">= 1.2, < 1.4")).toBe(">=1.2.0.0-dev <1.4.0.0-dev");
    expect(normalized("composer", ">=1.0@beta")).toBe(">=1.0.0.0-beta");
    expect(normalized("composer", "<>1.4.0")).toBe("!=1.4.0.0");
    expect(normalized("composer", "*")).toBe("*");
  });

  it("matches pre-releases inside the bounds but marks them as unstable", () => {
    expect(statuses("composer", "^1.2", ["1.2.0-beta1", "1.3.0", "2.0.0-RC1", "1.1.0"])).toEqual({
      "1.2.0-beta1": "unstable",
      "1.3.0": "match",
      "2.0.0-RC1": "miss",
      "1.1.0": "miss",
    });
    expect(statuses("composer", "^2.0@beta", ["2.0.0-beta.2", "2.0.0-alpha1", "2.1.0"])).toEqual({
      "2.0.0-beta.2": "match",
      "2.0.0-alpha1": "unstable",
      "2.1.0": "match",
    });
  });

  it("treats a plain version as an exact match", () => {
    expect(statuses("composer", "1.2", ["1.2.0", "1.2.1"])).toEqual({ "1.2.0": "match", "1.2.1": "miss" });
  });

  it("normalizes versions and compares them like PHP version_compare", () => {
    expect(normalizeComposerVersion("v1.2.3")).toBe("1.2.3.0");
    expect(normalizeComposerVersion("1.0.0-beta.2")).toBe("1.0.0.0-beta2");
    expect(normalizeComposerVersion("1.0.0-rc2")).toBe("1.0.0.0-RC2");
    expect(normalizeComposerVersion("2.0.0-p1")).toBe("2.0.0.0-patch1");
    expect(normalizeComposerVersion("1.0.0+build")).toBe("1.0.0.0");
    expect(() => normalizeComposerVersion("dev-main")).toThrow(/Branch versions/);
    expect(() => normalizeComposerVersion("1.0.0-alpha.beta")).toThrow(/Invalid version string/);
    expect(phpVersionCompare("2.0.0.0-RC1", "2.0.0.0-beta2")).toBe(1);
    expect(phpVersionCompare("2.0.0.0", "2.0.0.0-patch1")).toBe(-1);
    expect(phpVersionCompare("2.0.0.0-dev", "2.0.0.0-alpha1")).toBe(-1);
    expect(phpVersionCompare("1.10.0.0", "1.9.0.0")).toBe(1);
    expect(composerStability("2.0.0.0-patch1")).toBe("stable");
    expect(composerStability("2.0.0.0-RC1")).toBe("RC");
  });

  it("rejects ~> and branch constraints with a clear message", () => {
    expect(normalized("composer", "~>1.2")).toBe('error: Invalid operator "~>" in "~>1.2". Use the ~ operator.');
    expect(normalized("composer", "dev-main")).toMatch(/Branch versions/);
  });

  it("explains -dev bounds in plain English", () => {
    const result = evaluateRange("composer", "^1.2", []);
    expect(result.ok && result.explanation.sentences).toEqual(["At least 1.2.0 (1.2.0 pre-releases count) and below 2.0.0 (no 2.0.0 pre-releases)."]);
  });
});

describe("Python specifiers", () => {
  // The expected values come from the packaging library (SpecifierSet.contains).
  it("expands ~= into a lower bound and a prefix match", () => {
    expect(normalized("python", "~=1.4.2")).toBe(">=1.4.2, ==1.4.*");
    expect(normalized("python", "~=1.4")).toBe(">=1.4, ==1.*");
    expect(statuses("python", "~=1.4.2", ["1.4.1", "1.4.2", "1.4.9", "1.5.0", "1.4.2.post1"])).toEqual({
      "1.4.1": "miss",
      "1.4.2": "match",
      "1.4.9": "match",
      "1.5.0": "miss",
      "1.4.2.post1": "match",
    });
  });

  it("matches prefixes, exclusions, and bounds", () => {
    expect(statuses("python", "==1.4.*", ["1.4", "1.4.5", "1.40", "1.4+local"])).toEqual({ "1.4": "match", "1.4.5": "match", "1.40": "miss", "1.4+local": "match" });
    expect(statuses("python", ">=1.2, <2, !=1.5.0", ["1.5", "1.10", "2.0a1", "2.0"])).toEqual({ "1.5": "miss", "1.10": "match", "2.0a1": "miss", "2.0": "miss" });
    expect(statuses("python", ">1.4", ["1.4.post1", "1.4.1", "1.4+local"])).toEqual({ "1.4.post1": "miss", "1.4.1": "match", "1.4+local": "miss" });
    expect(statuses("python", "==1.4", ["1.4.0", "1.4.0+local"])).toEqual({ "1.4.0": "match", "1.4.0+local": "match" });
    expect(statuses("python", "==1.4.0+local", ["1.4", "1.4+local"])).toEqual({ "1.4": "miss", "1.4+local": "match" });
  });

  it("lets pre-releases match only when a specifier names one", () => {
    expect(statuses("python", "<2.0", ["2.0a1", "1.9", "1.9rc1"])).toEqual({ "2.0a1": "miss", "1.9": "match", "1.9rc1": "prerelease" });
    expect(statuses("python", ">=2.0b1", ["2.0a1", "2.0b2", "2.0rc1", "2.0"])).toEqual({ "2.0a1": "miss", "2.0b2": "match", "2.0rc1": "match", "2.0": "match" });
  });

  it("notes the pre-release fallback when no final release matches", () => {
    const result = evaluateRange("python", ">=2.5", ["3.0b1", "2.4"]);
    expect(result.ok && result.highestNote).toBe("No final release matches. PEP 440 lets an installer fall back to a pre-release then. The highest is 3.0b1.");
  });

  it("normalizes versions and orders them by PEP 440", () => {
    const result = evaluateRange("python", ">=0", ["1.0-alpha1", "1.0_post1", "v1.4.2", "1.0-1", "1.0c1", "1!0.1"]);
    expect(result.checks.map((check) => check.normalized)).toEqual(["1.0a1", "1.0.post1", "1.4.2", "1.0.post1", "1.0rc1", "1!0.1"]);
    expect(compareVersions("python", "1.0.dev1", "1.0a1")).toMatchObject({ order: -1, bump: "pre-release" });
    expect(compareVersions("python", "1.0", "1.0.0")).toMatchObject({ order: 0, note: expect.stringContaining("Trailing zeros") });
    expect(compareVersions("python", "1.0.post1", "1.0")).toMatchObject({ order: 1, bump: "post-release" });
  });

  it("rejects npm syntax with a hint", () => {
    expect(normalized("python", "^1.2")).toBe('error: "^1.2": PEP 440 has no ^ or ~ operator. Use ~=, as in ~=1.4.2.');
    expect(normalized("python", "1.4")).toBe('error: "1.4" needs an operator, such as ==1.4 or >=1.4.');
    expect(normalized("python", ">=1.0 || <0.5")).toMatch(/PEP 440 has no OR/);
    expect(normalized("python", "~=1")).toMatch(/at least two release numbers/);
    expect(normalized("python", ">=1.4.*")).toMatch(/only == and != can end with .\*/);
  });
});

describe("compareVersions", () => {
  it("orders SemVer pre-releases and names the bump", () => {
    expect(compareVersions("npm", "2.0.0-rc.1", "2.0.0-beta.11")).toEqual({ ok: true, order: 1, left: "2.0.0-rc.1", right: "2.0.0-beta.11", bump: "prerelease", note: undefined });
    expect(compareVersions("npm", "1.2.3", "2.0.0")).toMatchObject({ order: -1, bump: "major" });
    expect(compareVersions("npm", "1.2.3", "1.3.0")).toMatchObject({ bump: "minor" });
    expect(compareVersions("npm", "1.2.3+a", "1.2.3+b")).toMatchObject({ order: 0, note: "Build metadata (+...) does not change the order." });
    expect(compareVersions("cargo", "v1.2.3", "1.2.3")).toMatchObject({ ok: false, side: "left" });
  });

  it("compares Composer versions by stability", () => {
    expect(compareVersions("composer", "2.0.0-RC1", "2.0.0")).toMatchObject({ order: -1, bump: "stability" });
    expect(compareVersions("composer", "1.2.3", "1.2.4")).toMatchObject({ order: -1, bump: "patch" });
  });
});

describe("nextVersions", () => {
  it("lists SemVer bumps with a pre-release id", () => {
    expect(nextVersions("npm", "1.2.3", "rc")).toEqual([
      { label: "Major", version: "2.0.0" },
      { label: "Minor", version: "1.3.0" },
      { label: "Patch", version: "1.2.4" },
      { label: "Pre-major", version: "2.0.0-rc.0" },
      { label: "Pre-minor", version: "1.3.0-rc.0" },
      { label: "Pre-patch", version: "1.2.4-rc.0" },
      { label: "Pre-release", version: "1.2.4-rc.0" },
    ]);
    expect(nextVersions("npm", "2.0.0-rc.1", "rc").find((item) => item.label === "Pre-release")?.version).toBe("2.0.0-rc.2");
    expect(nextVersions("npm", "2.0.0-rc.1", "rc").find((item) => item.label === "Major")?.version).toBe("2.0.0");
  });

  it("lists release bumps for Python and Composer", () => {
    expect(nextVersions("python", "1.4", "rc").map((item) => item.version)).toEqual(["2.0.0", "1.5.0", "1.4.1"]);
    expect(nextVersions("composer", "v1.2.4", "rc").map((item) => item.version)).toEqual(["2.0.0", "1.3.0", "1.2.5"]);
    // A pre-release moves up to its own release first, as in npm.
    expect(nextVersions("python", "2.0b1", "rc").map((item) => item.version)).toEqual(["2.0.0", "2.0.0", "2.0.0"]);
    expect(nextVersions("composer", "1.2.3-beta1", "rc").map((item) => item.version)).toEqual(["2.0.0", "1.3.0", "1.2.3"]);
  });
});

describe("describeComparators", () => {
  it("describes prefix matches and exclusions", () => {
    expect(describeComparators([">=1.4.2", "==1.4.*"], "python")).toBe("At least 1.4.2 and any 1.4.x version.");
    expect(describeComparators(["!=1.4.*"], "python")).toBe("Not a 1.4.x version.");
    expect(describeComparators([], "cargo")).toBe("Any version.");
  });
});
