import { Range, compare as semverCompare, diff as semverDiff, inc as semverInc, parse as semverParse, type ReleaseType } from "semver";

/**
 * Version range checks for four ecosystems. npm uses the `semver` package (the code npm itself runs).
 * Cargo is a port of the Rust `semver` crate, Composer a port of `composer/semver`, and Python
 * follows PEP 440 as the `packaging` library implements it.
 */
export type VersionDialect = "npm" | "cargo" | "composer" | "python";

export const VERSION_DIALECTS: { id: VersionDialect; label: string }[] = [
  { id: "npm", label: "npm" },
  { id: "cargo", label: "Cargo" },
  { id: "composer", label: "Composer" },
  { id: "python", label: "Python (PEP 440)" },
];

export const RANGE_EXAMPLES: Record<VersionDialect, { label: string; range: string }[]> = {
  npm: [
    { label: "Caret or tilde", range: "^1.2 || ~2.0" },
    { label: "Caret below 1.0", range: "^0.3.1" },
    { label: "Hyphen range", range: "1.2.3 - 2.3" },
    { label: "Pre-release", range: ">=2.0.0-beta.2 <2.0.0" },
  ],
  cargo: [
    { label: "Default (caret)", range: "1.2" },
    { label: "Comma means AND", range: ">=1.2, <1.5" },
    { label: "Tilde", range: "~0.3.1" },
    { label: "Exact", range: "=1.2.3" },
  ],
  composer: [
    { label: "Caret or caret", range: "^1.2 || ^2.0" },
    { label: "Tilde", range: "~1.2" },
    { label: "Beta allowed", range: "^2.0@beta" },
    { label: "Hyphen range", range: "1.0 - 2.0" },
  ],
  python: [
    { label: "Compatible release", range: "~=1.4.2" },
    { label: "Prefix match", range: "==1.4.*" },
    { label: "Bounds", range: ">=1.2, <2, !=1.5.0" },
    { label: "Pre-release", range: ">=2.0b1" },
  ],
};

/** match: satisfies the range. prerelease: inside the bounds, but pre-release rules exclude it. unstable: Composer matches it, but minimum-stability skips it. */
export type VersionStatus = "match" | "miss" | "prerelease" | "unstable";

export interface VersionCheck {
  input: string;
  /** The version as the dialect normalizes it. */
  normalized?: string;
  status?: VersionStatus;
  error?: string;
  /** True for the highest version that matches. */
  highest?: boolean;
}

export interface RangeExplanation {
  /** One list of comparators per OR branch. All comparators in a branch must match. */
  alternatives: string[][];
  normalized: string;
  /** One plain-English sentence per OR branch. */
  sentences: string[];
  notes: string[];
}

export type RangeResult =
  | { ok: true; explanation: RangeExplanation; checks: VersionCheck[]; highest?: string; highestNote?: string }
  | { ok: false; error: string; checks: VersionCheck[] };

interface Engine<V> {
  parseVersion(input: string): { ok: true; version: V; normalized: string } | { ok: false; error: string };
  compare(a: V, b: V): number;
  parseRange(input: string): { ok: true; range: EngineRange<V> } | { ok: false; error: string };
}

interface EngineRange<V> {
  alternatives: string[][];
  joinAnd: string;
  notes: string[];
  check(version: V): VersionStatus;
}

// ---------- shared SemVer 2.0 core (Cargo) ----------

interface SemVer {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

const NUMERIC = /^\d+$/;
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function parseStrictSemver(text: string): SemVer | null {
  const match = SEMVER_RE.exec(text);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] ? match[4].split(".") : [] };
}

function compareIdentifier(a: string, b: string): number {
  const aNum = NUMERIC.test(a);
  const bNum = NUMERIC.test(b);
  if (aNum && bNum) return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
  if (aNum) return -1;
  if (bNum) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compares pre-release lists. An empty list (a release) sorts after every pre-release. */
function comparePre(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return b.length - a.length;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const result = compareIdentifier(a[index], b[index]);
    if (result !== 0) return result;
  }
  return a.length - b.length;
}

function compareSemVer(a: SemVer, b: SemVer): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch || comparePre(a.pre, b.pre);
}

const sign = (value: number) => (value < 0 ? -1 : value > 0 ? 1 : 0);

// ---------- npm ----------

const npmEngine: Engine<string> = {
  parseVersion(input) {
    const parsed = semverParse(input);
    if (!parsed) return { ok: false, error: "Not a valid SemVer version. Use MAJOR.MINOR.PATCH, such as 1.4.2." };
    return { ok: true, version: parsed.version, normalized: parsed.version };
  },
  compare: (a, b) => semverCompare(a, b),
  parseRange(input) {
    let range: Range;
    let wide: Range;
    try {
      range = new Range(input);
      wide = new Range(input, { includePrerelease: true });
    } catch (error) {
      return { ok: false, error: `${(error as Error).message}. Check the operators and versions.` };
    }
    const alternatives = range.set.map((set) => set.map((comparator) => comparator.value).filter(Boolean));
    const tuples = new Set<string>();
    for (const set of range.set) {
      for (const comparator of set) {
        const version = comparator.semver;
        // An empty value is the "any version" comparator, which has no real version.
        if (!comparator.value || !version.prerelease.length) continue;
        // `<2.0.0-0` only marks the upper bound. It never lets a pre-release in.
        if (comparator.operator === "<" && version.prerelease.length === 1 && version.prerelease[0] === 0) continue;
        tuples.add(`${version.major}.${version.minor}.${version.patch}`);
      }
    }
    return {
      ok: true,
      range: {
        alternatives,
        joinAnd: " ",
        notes: [prereleaseTupleNote(Array.from(tuples), "npm")],
        check(version) {
          if (range.test(version)) return "match";
          return wide.test(version) ? "prerelease" : "miss";
        },
      },
    };
  },
};

function prereleaseTupleNote(tuples: string[], tool: string) {
  if (tuples.length === 0) {
    return `Pre-releases such as 1.3.0-beta.1 never match. ${tool} matches a pre-release only when a comparator names a pre-release of the same version.`;
  }
  const list = tuples.join(" or ");
  return `Pre-releases match only for ${list}, because a comparator names a pre-release of ${tuples.length > 1 ? "those versions" : "that version"}.`;
}

// ---------- Cargo (Rust semver crate) ----------

type CargoOp = "=" | ">" | ">=" | "<" | "<=" | "~" | "^" | "*";

interface CargoComparator {
  op: CargoOp;
  major: number;
  minor?: number;
  patch?: number;
  pre: string[];
}

const isWildcard = (char: string | undefined) => char === "*" || char === "x" || char === "X";

export function parseCargoRange(input: string): { ok: true; comparators: CargoComparator[] } | { ok: false; error: string } {
  const text = input.trim();
  if (!text) return { ok: false, error: "Enter a version requirement, such as 1.2 or >=1.2, <1.5." };
  if (text.includes("||")) {
    return { ok: false, error: "Cargo does not support ||. A requirement is one list of comparators, separated by commas, that must all match." };
  }
  if (isWildcard(text[0])) {
    const rest = text.slice(1).trimStart();
    if (!rest) return { ok: true, comparators: [] };
    if (rest.startsWith(",")) return { ok: false, error: "A * wildcard must be the only comparator in a Cargo requirement." };
    return { ok: false, error: "Unexpected text after the * wildcard." };
  }

  const comparators: CargoComparator[] = [];
  let pos = 0;
  const peek = () => text[pos];
  const skipSpaces = () => {
    while (text[pos] === " ") pos += 1;
  };
  const number = (part: string): number | string => {
    const start = pos;
    while (pos < text.length && /\d/.test(text[pos])) pos += 1;
    const digits = text.slice(start, pos);
    if (!digits) {
      if (isWildcard(text[start]) && part === "major") return "A * wildcard must be the only comparator in a Cargo requirement.";
      return `Expected a number for the ${part} version${text[start] ? `, found "${text[start]}"` : ""}.`;
    }
    if (digits.length > 1 && digits[0] === "0") return `The ${part} version ${digits} has a leading zero.`;
    return Number(digits);
  };
  const identifiers = (part: string): string[] | string => {
    const start = pos;
    while (pos < text.length && /[0-9A-Za-z.-]/.test(text[pos])) pos += 1;
    const body = text.slice(start, pos);
    const parts = body.split(".");
    if (!body || parts.some((item) => !item)) return `The ${part} has an empty part.`;
    if (part === "pre-release" && parts.some((item) => NUMERIC.test(item) && item.length > 1 && item[0] === "0")) {
      return "A numeric pre-release part cannot have a leading zero.";
    }
    return parts;
  };

  while (true) {
    let op: CargoOp | undefined;
    for (const candidate of [">=", "<=", "=", ">", "<", "~", "^"] as const) {
      if (text.startsWith(candidate, pos)) {
        op = candidate;
        pos += candidate.length;
        break;
      }
    }
    const defaultOp = op === undefined;
    skipSpaces();
    const major = number("major");
    if (typeof major === "string") return { ok: false, error: major };
    let minor: number | undefined;
    let patch: number | undefined;
    let hasWildcard = false;
    let position = "major";
    if (peek() === ".") {
      pos += 1;
      position = "minor";
      if (isWildcard(peek())) {
        pos += 1;
        hasWildcard = true;
        if (defaultOp) op = "*";
      } else {
        const value = number("minor");
        if (typeof value === "string") return { ok: false, error: value };
        minor = value;
      }
    }
    if (peek() === ".") {
      pos += 1;
      position = "patch";
      if (isWildcard(peek())) {
        pos += 1;
        if (defaultOp) op = "*";
      } else if (hasWildcard) {
        return { ok: false, error: "A number cannot follow a wildcard, as in 1.*.3." };
      } else {
        const value = number("patch");
        if (typeof value === "string") return { ok: false, error: value };
        patch = value;
      }
    }
    let pre: string[] = [];
    if (patch !== undefined && peek() === "-") {
      pos += 1;
      const value = identifiers("pre-release");
      if (typeof value === "string") return { ok: false, error: value };
      pre = value;
      position = "pre-release";
    }
    if (patch !== undefined && peek() === "+") {
      pos += 1;
      const value = identifiers("build metadata");
      if (typeof value === "string") return { ok: false, error: value };
      position = "build metadata";
    }
    comparators.push({ op: op ?? "^", major, minor, patch, pre });
    skipSpaces();
    if (pos >= text.length) break;
    const char = peek();
    if (char !== ",") {
      if ((char === "-" || char === "+") && patch === undefined) {
        return { ok: false, error: `A ${char === "-" ? "pre-release" : "build"} needs a full version, such as 1.2.0-beta.` };
      }
      return { ok: false, error: `Expected a comma after the ${position}, found "${char}". Cargo separates comparators with commas.` };
    }
    pos += 1;
    skipSpaces();
    if (comparators.length === 32) return { ok: false, error: "Cargo allows at most 32 comparators." };
  }
  return { ok: true, comparators };
}

const preEqual = (a: string[], b: string[]) => a.length === b.length && a.every((item, index) => item === b[index]);

function cargoMatchesExact(cmp: CargoComparator, ver: SemVer) {
  if (ver.major !== cmp.major) return false;
  if (cmp.minor !== undefined && ver.minor !== cmp.minor) return false;
  if (cmp.patch !== undefined && ver.patch !== cmp.patch) return false;
  return preEqual(ver.pre, cmp.pre);
}

function cargoMatchesGreater(cmp: CargoComparator, ver: SemVer) {
  if (ver.major !== cmp.major) return ver.major > cmp.major;
  if (cmp.minor === undefined) return false;
  if (ver.minor !== cmp.minor) return ver.minor > cmp.minor;
  if (cmp.patch === undefined) return false;
  if (ver.patch !== cmp.patch) return ver.patch > cmp.patch;
  return comparePre(ver.pre, cmp.pre) > 0;
}

function cargoMatchesLess(cmp: CargoComparator, ver: SemVer) {
  if (ver.major !== cmp.major) return ver.major < cmp.major;
  if (cmp.minor === undefined) return false;
  if (ver.minor !== cmp.minor) return ver.minor < cmp.minor;
  if (cmp.patch === undefined) return false;
  if (ver.patch !== cmp.patch) return ver.patch < cmp.patch;
  return comparePre(ver.pre, cmp.pre) < 0;
}

function cargoMatchesTilde(cmp: CargoComparator, ver: SemVer) {
  if (ver.major !== cmp.major) return false;
  if (cmp.minor !== undefined && ver.minor !== cmp.minor) return false;
  if (cmp.patch !== undefined && ver.patch !== cmp.patch) return ver.patch > cmp.patch;
  return comparePre(ver.pre, cmp.pre) >= 0;
}

function cargoMatchesCaret(cmp: CargoComparator, ver: SemVer) {
  if (ver.major !== cmp.major) return false;
  if (cmp.minor === undefined) return true;
  const minor = cmp.minor;
  if (cmp.patch === undefined) return cmp.major > 0 ? ver.minor >= minor : ver.minor === minor;
  const patch = cmp.patch;
  if (cmp.major > 0) {
    if (ver.minor !== minor) return ver.minor > minor;
    if (ver.patch !== patch) return ver.patch > patch;
  } else if (minor > 0) {
    if (ver.minor !== minor) return false;
    if (ver.patch !== patch) return ver.patch > patch;
  } else if (ver.minor !== minor || ver.patch !== patch) {
    return false;
  }
  return comparePre(ver.pre, cmp.pre) >= 0;
}

function cargoMatchesComparator(cmp: CargoComparator, ver: SemVer) {
  switch (cmp.op) {
    case "=":
    case "*":
      return cargoMatchesExact(cmp, ver);
    case ">":
      return cargoMatchesGreater(cmp, ver);
    case ">=":
      return cargoMatchesExact(cmp, ver) || cargoMatchesGreater(cmp, ver);
    case "<":
      return cargoMatchesLess(cmp, ver);
    case "<=":
      return cargoMatchesExact(cmp, ver) || cargoMatchesLess(cmp, ver);
    case "~":
      return cargoMatchesTilde(cmp, ver);
    case "^":
      return cargoMatchesCaret(cmp, ver);
  }
}

const cargoPreCompatible = (cmp: CargoComparator, ver: SemVer) =>
  cmp.major === ver.major && cmp.minor === ver.minor && cmp.patch === ver.patch && cmp.pre.length > 0;

/** The bounds one Cargo comparator stands for, as plain comparators such as `>=1.2.0` and `<2.0.0`. */
export function cargoBounds(cmp: CargoComparator): string[] {
  const { major, minor, patch, pre } = cmp;
  const full = `${major}.${minor}.${patch}${pre.length ? `-${pre.join(".")}` : ""}`;
  const nextMajor = `<${major + 1}.0.0`;
  if (minor === undefined) {
    switch (cmp.op) {
      case ">":
        return [`>=${major + 1}.0.0`];
      case ">=":
        return [`>=${major}.0.0`];
      case "<":
        return [`<${major}.0.0`];
      case "<=":
        return [nextMajor];
      default:
        return [`>=${major}.0.0`, nextMajor];
    }
  }
  const nextMinor = `<${major}.${minor + 1}.0`;
  if (patch === undefined) {
    switch (cmp.op) {
      case ">":
        return [`>=${major}.${minor + 1}.0`];
      case ">=":
        return [`>=${major}.${minor}.0`];
      case "<":
        return [`<${major}.${minor}.0`];
      case "<=":
        return [nextMinor];
      case "^":
        return [`>=${major}.${minor}.0`, major > 0 ? nextMajor : nextMinor];
      default:
        return [`>=${major}.${minor}.0`, nextMinor];
    }
  }
  switch (cmp.op) {
    case "=":
    case "*":
      return [`=${full}`];
    case ">":
    case ">=":
    case "<":
    case "<=":
      return [`${cmp.op}${full}`];
    case "~":
      return [`>=${full}`, nextMinor];
    case "^":
      return [`>=${full}`, major > 0 ? nextMajor : minor > 0 ? nextMinor : `<${major}.${minor}.${patch + 1}`];
  }
}

const cargoEngine: Engine<SemVer> = {
  parseVersion(input) {
    const text = input.trim();
    const version = parseStrictSemver(text);
    if (!version) {
      const hint = /^[vV=]/.test(text) ? " Cargo versions have no v or = prefix." : " Use MAJOR.MINOR.PATCH, such as 1.4.2.";
      return { ok: false, error: `Not a valid Cargo version.${hint}` };
    }
    return { ok: true, version, normalized: text.replace(/\+.*$/, "") };
  },
  compare: compareSemVer,
  parseRange(input) {
    const parsed = parseCargoRange(input);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    const { comparators } = parsed;
    const tuples = Array.from(
      new Set(comparators.filter((cmp) => cmp.pre.length && cmp.patch !== undefined).map((cmp) => `${cmp.major}.${cmp.minor}.${cmp.patch}`)),
    );
    return {
      ok: true,
      range: {
        alternatives: [comparators.flatMap(cargoBounds)],
        joinAnd: ", ",
        notes: [prereleaseTupleNote(tuples, "Cargo")],
        check(version) {
          if (!comparators.every((cmp) => cargoMatchesComparator(cmp, version))) return "miss";
          if (version.pre.length === 0 || comparators.some((cmp) => cargoPreCompatible(cmp, version))) return "match";
          return "prerelease";
        },
      },
    };
  },
};

// ---------- Composer (composer/semver) ----------

const MODIFIER = "[._-]?(?:(stable|beta|b|RC|alpha|a|patch|pl|p)((?:[.-]?\\d+)*)?)?([.-]?dev)?";
const COMPOSER_STABILITIES = ["stable", "RC", "beta", "alpha", "dev"] as const;
type ComposerStability = (typeof COMPOSER_STABILITIES)[number];

function expandStability(stability: string) {
  const lower = stability.toLowerCase();
  if (lower === "a") return "alpha";
  if (lower === "b") return "beta";
  if (lower === "p" || lower === "pl") return "patch";
  if (lower === "rc") return "RC";
  return lower;
}

/** Composer's VersionParser::normalize, without branch names. Throws with a message for invalid input. */
export function normalizeComposerVersion(input: string): string {
  let version = input.trim();
  const original = version;
  version = version.replace(/@(?:stable|RC|beta|alpha|dev)$/i, "");
  const branchError = () => new Error(`Branch versions such as dev-main or 2.x-dev are not supported here: "${original}".`);
  if (/^(?:master|trunk|default)$/.test(version) || /^dev-/i.test(version)) throw branchError();
  const build = /^([^,\s+]+)\+[^\s]+$/.exec(version);
  if (build) version = build[1];
  let match = new RegExp(`^v?(\\d{1,5})(\\.\\d+)?(\\.\\d+)?(\\.\\d+)?${MODIFIER}$`, "i").exec(version);
  let index: number;
  if (match) {
    version = match[1] + (match[2] || ".0") + (match[3] || ".0") + (match[4] || ".0");
    index = 5;
  } else {
    match = new RegExp(`^v?(\\d{4}(?:[.:-]?\\d{2}){1,6}(?:[.:-]?\\d{1,3}){0,2})${MODIFIER}$`, "i").exec(version);
    if (!match) {
      if (/[.-]?dev$/i.test(version)) throw branchError();
      throw new Error(`Invalid version string "${original}".`);
    }
    version = match[1].replace(/\D/g, ".");
    index = 2;
  }
  if (match[index]) {
    if (match[index].toLowerCase() === "stable") return version;
    version += `-${expandStability(match[index])}${match[index + 1] ? match[index + 1].replace(/^[.-]+/, "") : ""}`;
  }
  if (match[index + 2]) version += "-dev";
  return version;
}

/** Composer's VersionParser::parseStability. */
export function composerStability(version: string): ComposerStability {
  if (/^dev-/.test(version) || version.endsWith("-dev")) return "dev";
  const match = new RegExp(`${MODIFIER}(?:\\+.*)?$`, "i").exec(version.toLowerCase());
  if (match?.[3]) return "dev";
  if (match?.[1] === "beta" || match?.[1] === "b") return "beta";
  if (match?.[1] === "alpha" || match?.[1] === "a") return "alpha";
  if (match?.[1] === "rc") return "RC";
  return "stable";
}

const SPECIAL_FORMS: [string, number][] = [
  ["dev", 0],
  ["alpha", 1],
  ["a", 1],
  ["beta", 2],
  ["b", 2],
  ["RC", 3],
  ["rc", 3],
  ["#", 4],
  ["pl", 5],
  ["p", 5],
];

function specialForm(part: string) {
  for (const [name, order] of SPECIAL_FORMS) if (part.startsWith(name)) return order;
  return -6;
}

function phpCanonical(version: string): string[] {
  let out = version[0] ?? "";
  const isDigit = (char: string) => char >= "0" && char <= "9";
  const isNonDigit = (char: string) => !isDigit(char) && char !== ".";
  for (let index = 1; index < version.length; index += 1) {
    const char = version[index];
    const previous = version[index - 1];
    const last = out[out.length - 1];
    if (char === "-" || char === "_" || char === "+") {
      if (last !== ".") out += ".";
    } else if ((isNonDigit(previous) && isDigit(char)) || (isDigit(previous) && isNonDigit(char))) {
      if (last !== ".") out += ".";
      out += char;
    } else if (!/[0-9A-Za-z]/.test(char)) {
      if (last !== ".") out += ".";
    } else {
      out += char;
    }
  }
  return out.split(".").filter(Boolean);
}

/** PHP's version_compare(), which Composer uses on normalized versions. */
export function phpVersionCompare(a: string, b: string): number {
  const left = phpCanonical(a);
  const right = phpCanonical(b);
  const isNum = (part: string) => /^\d/.test(part);
  const comparePart = (x: string, y: string) => {
    if (isNum(x) && isNum(y)) return sign(Number.parseInt(x, 10) - Number.parseInt(y, 10));
    if (!isNum(x) && !isNum(y)) return sign(specialForm(x) - specialForm(y));
    return isNum(x) ? sign(4 - specialForm(y)) : sign(specialForm(x) - 4);
  };
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const result = comparePart(left[index], right[index]);
    if (result !== 0) return result;
  }
  if (left.length > right.length) return isNum(left[right.length]) ? 1 : comparePart(left[right.length], "#");
  if (right.length > left.length) return isNum(right[left.length]) ? -1 : comparePart("#", right[left.length]);
  return 0;
}

interface ComposerConstraint {
  op: "==" | "!=" | "<" | "<=" | ">" | ">=" | "*";
  version: string;
}

const COMPOSER_VERSION = `v?(\\d+)(?:\\.(\\d+))?(?:\\.(\\d+))?(?:\\.(\\d+))?(?:${MODIFIER}|\\.([xX*][.-]?dev))(?:\\+[^\\s]+)?`;

function manipulate(parts: (string | undefined)[], position: number, increment = 0): string {
  const out = [...parts];
  for (let index = 4; index > 0; index -= 1) {
    if (index > position) out[index] = "0";
    else if (index === position && increment) out[index] = String(Number(out[index] || 0) + increment);
  }
  return `${out[1]}.${out[2] || 0}.${out[3] || 0}.${out[4] || 0}`;
}

function parseComposerConstraint(raw: string): ComposerConstraint[] {
  let constraint = raw;
  let modifier: string | undefined;
  const flag = /^([^,\s]*?)@(stable|RC|beta|alpha|dev)$/i.exec(constraint);
  if (flag) {
    constraint = flag[1] || "*";
    if (flag[2] !== "stable") modifier = flag[2];
  }
  const any = /^(v)?[xX*](\.[xX*])*$/i.exec(constraint);
  if (any) return any[1] || any[2] ? [{ op: ">=", version: "0.0.0.0-dev" }] : [{ op: "*", version: "" }];

  const branch = () => new Error(`Branch constraints such as 2.x-dev are not supported here: "${raw}".`);
  const tilde = new RegExp(`^~>?${COMPOSER_VERSION}$`, "i").exec(constraint);
  if (tilde) {
    if (constraint.startsWith("~>")) throw new Error(`Invalid operator "~>" in "${raw}". Use the ~ operator.`);
    if (tilde[8]) throw branch();
    const position = tilde[4] ? 4 : tilde[3] ? 3 : tilde[2] ? 2 : 1;
    const suffix = !tilde[5] && !tilde[7] ? "-dev" : "";
    return [
      { op: ">=", version: normalizeComposerVersion(constraint.slice(1) + suffix) },
      { op: "<", version: `${manipulate(tilde, Math.max(1, position - 1), 1)}-dev` },
    ];
  }
  const caret = new RegExp(`^\\^${COMPOSER_VERSION}$`, "i").exec(constraint);
  if (caret) {
    if (caret[8]) throw branch();
    const position = caret[1] !== "0" || !caret[2] ? 1 : caret[2] !== "0" || !caret[3] ? 2 : 3;
    const suffix = !caret[5] && !caret[7] ? "-dev" : "";
    return [
      { op: ">=", version: normalizeComposerVersion(constraint.slice(1) + suffix) },
      { op: "<", version: `${manipulate(caret, position, 1)}-dev` },
    ];
  }
  const wildcard = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.[xX*])+$/.exec(constraint);
  if (wildcard) {
    const position = wildcard[3] ? 3 : wildcard[2] ? 2 : 1;
    const low = `${manipulate(wildcard, position)}-dev`;
    const high = `${manipulate(wildcard, position, 1)}-dev`;
    return low === "0.0.0.0-dev" ? [{ op: "<", version: high }] : [{ op: ">=", version: low }, { op: "<", version: high }];
  }
  const hyphen = new RegExp(`^(${COMPOSER_VERSION}) +- +(${COMPOSER_VERSION})$`, "i").exec(constraint);
  if (hyphen) {
    if (hyphen[9] || hyphen[18]) throw branch();
    const lowSuffix = !hyphen[6] && !hyphen[8] ? "-dev" : "";
    const lower: ComposerConstraint = { op: ">=", version: normalizeComposerVersion(hyphen[1]) + lowSuffix };
    if ((hyphen[12] && hyphen[13]) || hyphen[15] || hyphen[17]) {
      return [lower, { op: "<=", version: normalizeComposerVersion(hyphen[10]) }];
    }
    normalizeComposerVersion(hyphen[10]);
    const high = ["", hyphen[11], hyphen[12], hyphen[13], hyphen[14]];
    return [lower, { op: "<", version: `${manipulate(high, hyphen[12] ? 2 : 1, 1)}-dev` }];
  }
  const basic = /^(<>|!=|>=?|<=?|==?)?\s*(.*)$/.exec(constraint);
  if (basic) {
    let version: string;
    try {
      version = normalizeComposerVersion(basic[2]);
    } catch (error) {
      throw new Error(`Could not parse version constraint "${raw}": ${(error as Error).message}`);
    }
    const op = basic[1] || "=";
    if (op !== "==" && op !== "=" && modifier && composerStability(version) === "stable") {
      version += `-${modifier}`;
    } else if (op === "<" || op === ">=") {
      if (!new RegExp(`-${MODIFIER}$`).test(basic[2].toLowerCase())) version += "-dev";
    }
    const normalizedOp = op === "=" ? "==" : op === "<>" ? "!=" : (op as ComposerConstraint["op"]);
    return [{ op: normalizedOp, version }];
  }
  throw new Error(`Could not parse version constraint "${raw}".`);
}

export function parseComposerRange(input: string): { ok: true; groups: ComposerConstraint[][]; allowed: ComposerStability } | { ok: false; error: string } {
  const text = input.trim();
  if (!text) return { ok: false, error: "Enter a constraint, such as ^1.2 or ~1.2.3." };
  try {
    const groups = text.split(/\s*\|\|?\s*/).map((orPart) => {
      const andParts = orPart.split(/(?<!^|as|[=>< ,]) *(?<!-)[, ](?!-) *(?!,|as|$)/);
      return andParts.flatMap((part) => parseComposerConstraint(part));
    });
    return { ok: true, groups, allowed: composerAllowedStability(text) };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

const STABILITY_RANK: Record<ComposerStability, number> = { stable: 0, RC: 5, beta: 10, alpha: 15, dev: 20 };

/** The least stable version Composer installs for this constraint, with the default minimum-stability (stable). */
function composerAllowedStability(constraint: string): ComposerStability {
  let allowed: ComposerStability = "stable";
  const loosen = (stability: ComposerStability) => {
    if (STABILITY_RANK[stability] > STABILITY_RANK[allowed]) allowed = stability;
  };
  for (const match of constraint.matchAll(/(?:^|\| *|, *)([^,\s#|]+)(?:#[^ ]+)? *@(stable|RC|beta|alpha|dev)/gi)) {
    loosen(COMPOSER_STABILITIES.find((name) => name.toLowerCase() === match[2].toLowerCase()) ?? "stable");
  }
  if (/^[^,\s@]+$/.test(constraint)) loosen(composerStability(constraint));
  return allowed;
}

function composerMatches(constraint: ComposerConstraint, version: string) {
  if (constraint.op === "*") return true;
  const result = phpVersionCompare(version, constraint.version);
  switch (constraint.op) {
    case "==":
      return result === 0;
    case "!=":
      return result !== 0;
    case "<":
      return result < 0;
    case "<=":
      return result <= 0;
    case ">":
      return result > 0;
    case ">=":
      return result >= 0;
  }
}

const composerEngine: Engine<string> = {
  parseVersion(input) {
    try {
      const normalized = normalizeComposerVersion(input);
      return { ok: true, version: normalized, normalized };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  },
  compare: phpVersionCompare,
  parseRange(input) {
    const parsed = parseComposerRange(input);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    const { groups, allowed } = parsed;
    const notes =
      allowed === "stable"
        ? ["Composer matches pre-releases inside the bounds. With the default minimum-stability (stable), it installs only stable versions. Add a flag such as @beta to allow more."]
        : [`Composer installs versions that are ${allowed} or more stable for this constraint. Less stable versions still need minimum-stability.`];
    return {
      ok: true,
      range: {
        alternatives: groups.map((group) => group.map((constraint) => (constraint.op === "*" ? "*" : `${constraint.op}${constraint.version}`))),
        joinAnd: " ",
        notes,
        check(version) {
          if (!groups.some((group) => group.every((constraint) => composerMatches(constraint, version)))) return "miss";
          return STABILITY_RANK[composerStability(version)] > STABILITY_RANK[allowed] ? "unstable" : "match";
        },
      },
    };
  },
};

// ---------- Python (PEP 440) ----------

export interface Pep440Version {
  epoch: number;
  release: number[];
  pre?: [string, number];
  post?: number;
  dev?: number;
  local?: (string | number)[];
}

const PEP440_RE =
  /^\s*v?(?:(?:(\d+)!)?(\d+(?:\.\d+)*)([-_.]?(alpha|a|beta|b|preview|pre|c|rc)[-_.]?(\d+)?)?((?:-(\d+))|(?:[-_.]?(post|rev|r)[-_.]?(\d+)?))?([-_.]?(dev)[-_.]?(\d+)?)?)(?:\+([a-z0-9]+(?:[-_.][a-z0-9]+)*))?\s*$/i;

export function parsePep440(input: string): Pep440Version | null {
  const match = PEP440_RE.exec(input);
  if (!match) return null;
  const letter = match[4]?.toLowerCase();
  const preLetter = letter === "alpha" ? "a" : letter === "beta" ? "b" : letter === "c" || letter === "pre" || letter === "preview" ? "rc" : letter;
  return {
    epoch: match[1] ? Number(match[1]) : 0,
    release: match[2].split(".").map(Number),
    pre: preLetter ? [preLetter, Number(match[5] ?? 0)] : undefined,
    post: match[6] ? Number(match[7] ?? match[9] ?? 0) : undefined,
    dev: match[10] ? Number(match[12] ?? 0) : undefined,
    local: match[13] ? match[13].toLowerCase().split(/[-_.]/).map((part) => (NUMERIC.test(part) ? Number(part) : part)) : undefined,
  };
}

export function formatPep440(version: Pep440Version): string {
  let text = `${version.epoch ? `${version.epoch}!` : ""}${version.release.join(".")}`;
  if (version.pre) text += `${version.pre[0]}${version.pre[1]}`;
  if (version.post !== undefined) text += `.post${version.post}`;
  if (version.dev !== undefined) text += `.dev${version.dev}`;
  if (version.local) text += `+${version.local.join(".")}`;
  return text;
}

const isPrerelease = (version: Pep440Version) => version.pre !== undefined || version.dev !== undefined;
const publicOf = (version: Pep440Version): Pep440Version => ({ ...version, local: undefined });
const baseOf = (version: Pep440Version): Pep440Version => ({ epoch: version.epoch, release: version.release });

function compareNumberLists(a: number[], b: number[]) {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) if (a[index] !== b[index]) return sign(a[index] - b[index]);
  return sign(a.length - b.length);
}

const PRE_ORDER: Record<string, number> = { a: 0, b: 1, rc: 2 };

export function comparePep440(a: Pep440Version, b: Pep440Version): number {
  if (a.epoch !== b.epoch) return sign(a.epoch - b.epoch);
  const trim = (release: number[]) => {
    const out = [...release];
    while (out.length > 1 && out[out.length - 1] === 0) out.pop();
    return out;
  };
  const release = compareNumberLists(trim(a.release), trim(b.release));
  if (release) return release;
  // Pre-release key: a dev-only release sorts first, then a < b < rc, then no pre-release.
  const preKey = (version: Pep440Version) =>
    version.pre ? [PRE_ORDER[version.pre[0]], version.pre[1]] : version.post === undefined && version.dev !== undefined ? [-Infinity] : [Infinity];
  const pre = compareNumberLists(preKey(a), preKey(b));
  if (pre) return pre;
  const post = sign((a.post ?? -Infinity) - (b.post ?? -Infinity));
  if (post) return post;
  const dev = sign((a.dev ?? Infinity) - (b.dev ?? Infinity));
  if (dev) return dev;
  if (!a.local || !b.local) return a.local ? 1 : b.local ? -1 : 0;
  for (let index = 0; index < Math.min(a.local.length, b.local.length); index += 1) {
    const x = a.local[index];
    const y = b.local[index];
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return sign(x - y);
    if (typeof x === "number") return 1;
    if (typeof y === "number") return -1;
    return x < y ? -1 : 1;
  }
  return sign(a.local.length - b.local.length);
}

type PepOp = "~=" | "==" | "!=" | "<=" | ">=" | "<" | ">" | "===";

interface PepSpecifier {
  op: PepOp;
  raw: string;
  version?: Pep440Version;
  /** For `==1.4.*` and `!=1.4.*`: the epoch and release to match as a prefix. */
  prefix?: { epoch: number; release: number[] };
}

const PREFIX_RE = /^v?(?:(\d+)!)?(\d+(?:\.\d+)*)\.\*$/i;

export function parsePep440Specifiers(input: string): { ok: true; specifiers: PepSpecifier[] } | { ok: false; error: string } {
  const text = input.trim();
  if (!text) return { ok: false, error: "Enter specifiers, such as >=1.4, <2 or ~=1.4.2." };
  if (text.includes("||")) return { ok: false, error: "PEP 440 has no OR (||). Separate specifiers with commas. All of them must match." };
  const specifiers: PepSpecifier[] = [];
  for (const part of text.split(",").map((item) => item.trim()).filter(Boolean)) {
    const match = /^(~=|===|==|!=|<=|>=|<|>)\s*(.*)$/.exec(part);
    if (!match) {
      if (/^[\^~]/.test(part)) return { ok: false, error: `"${part}": PEP 440 has no ^ or ~ operator. Use ~=, as in ~=1.4.2.` };
      return { ok: false, error: `"${part}" needs an operator, such as ==${part} or >=${part}.` };
    }
    const op = match[1] as PepOp;
    const body = match[2].trim();
    if (op === "===") {
      if (!body || /[\s;)]/.test(body)) return { ok: false, error: `"${part}" is not a valid === specifier.` };
      specifiers.push({ op, raw: body });
      continue;
    }
    const prefix = PREFIX_RE.exec(body);
    if (prefix) {
      if (op !== "==" && op !== "!=") return { ok: false, error: `"${part}": only == and != can end with .*.` };
      specifiers.push({ op, raw: body, prefix: { epoch: prefix[1] ? Number(prefix[1]) : 0, release: prefix[2].split(".").map(Number) } });
      continue;
    }
    const version = parsePep440(body);
    if (!version) {
      const hint = body.endsWith(".*") ? " The .* must follow the release numbers, as in ==1.4.*." : "";
      return { ok: false, error: `"${body}" in "${part}" is not a valid PEP 440 version.${hint}` };
    }
    if (version.local && op !== "==" && op !== "!=") return { ok: false, error: `"${part}": only == and != accept a local version (+...).` };
    if (op === "~=" && version.release.length < 2) return { ok: false, error: `"${part}": ~= needs at least two release numbers, as in ~=1.4.` };
    specifiers.push({ op, raw: body, version });
  }
  if (specifiers.length === 0) return { ok: false, error: "Enter specifiers, such as >=1.4, <2 or ~=1.4.2." };
  return { ok: true, specifiers };
}

function pepPrefixMatches(prefix: { epoch: number; release: number[] }, version: Pep440Version) {
  if (prefix.epoch !== version.epoch) return false;
  return prefix.release.every((part, index) => (version.release[index] ?? 0) === part);
}

function pepSpecMatches(spec: PepSpecifier, version: Pep440Version): boolean {
  const target = spec.version;
  switch (spec.op) {
    case "===":
      return formatPep440(version).toLowerCase() === spec.raw.toLowerCase();
    case "==":
      if (spec.prefix) return pepPrefixMatches(spec.prefix, version);
      return comparePep440(target.local ? version : publicOf(version), target) === 0;
    case "!=":
      return !pepSpecMatches({ ...spec, op: "==" }, version);
    case "<=":
      return comparePep440(publicOf(version), target) <= 0;
    case ">=":
      return comparePep440(publicOf(version), target) >= 0;
    case "<":
      if (comparePep440(version, target) >= 0) return false;
      return !(!isPrerelease(target) && isPrerelease(version) && comparePep440(baseOf(version), baseOf(target)) === 0);
    case ">":
      if (comparePep440(version, target) <= 0) return false;
      if (target.post === undefined && version.post !== undefined && comparePep440(baseOf(version), baseOf(target)) === 0) return false;
      return !(version.local && comparePep440(baseOf(version), baseOf(target)) === 0);
    case "~=":
      return comparePep440(publicOf(version), target) >= 0 && pepPrefixMatches({ epoch: target.epoch, release: target.release.slice(0, -1) }, version);
  }
}

/** The plain comparators a specifier stands for. `~=1.4.2` becomes `>=1.4.2` and `==1.4.*`. */
function pepComparators(spec: PepSpecifier): string[] {
  if (spec.op === "===") return [`===${spec.raw}`];
  if (spec.prefix) return [`${spec.op}${spec.prefix.epoch ? `${spec.prefix.epoch}!` : ""}${spec.prefix.release.join(".")}.*`];
  const text = formatPep440(spec.version);
  if (spec.op === "~=") {
    const { epoch, release } = spec.version;
    return [`>=${text}`, `==${epoch ? `${epoch}!` : ""}${release.slice(0, -1).join(".")}.*`];
  }
  return [`${spec.op}${text}`];
}

/** True when a specifier names a pre-release, which lets pre-releases match (packaging's `prereleases`). */
function pepAllowsPrereleases(spec: PepSpecifier) {
  if (!["==", ">=", "<=", "~=", "==="].includes(spec.op) || spec.prefix) return false;
  const version = spec.version ?? parsePep440(spec.raw);
  return Boolean(version && isPrerelease(version));
}

const pythonEngine: Engine<Pep440Version> = {
  parseVersion(input) {
    const version = parsePep440(input);
    if (!version) return { ok: false, error: "Not a valid PEP 440 version, such as 1.4.2, 2.0rc1, or 1.0.post1." };
    return { ok: true, version, normalized: formatPep440(version) };
  },
  compare: comparePep440,
  parseRange(input) {
    const parsed = parsePep440Specifiers(input);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    const { specifiers } = parsed;
    const prereleases = specifiers.some(pepAllowsPrereleases);
    return {
      ok: true,
      range: {
        alternatives: [specifiers.flatMap(pepComparators)],
        joinAnd: ", ",
        notes: [
          prereleases
            ? "A specifier names a pre-release, so pre-releases and dev releases can match."
            : "Pre-releases and dev releases match only with pip --pre, or when a specifier names one, as in >=2.0b1.",
        ],
        check(version) {
          if (!specifiers.every((spec) => pepSpecMatches(spec, version))) return "miss";
          return isPrerelease(version) && !prereleases ? "prerelease" : "match";
        },
      },
    };
  },
};

// ---------- public API ----------

const ENGINES: Record<VersionDialect, Engine<unknown>> = {
  npm: npmEngine as Engine<unknown>,
  cargo: cargoEngine as Engine<unknown>,
  composer: composerEngine as Engine<unknown>,
  python: pythonEngine as Engine<unknown>,
};

/** Splits the versions box into one entry per non-empty line. Commas and spaces also separate versions. */
export function splitVersions(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .flatMap((line) => line.trim().split(/\s+/))
    .filter(Boolean);
}

/** Checks each version against the range and finds the highest match. */
export function evaluateRange(dialect: VersionDialect, rangeText: string, versions: string[]): RangeResult {
  const engine = ENGINES[dialect];
  const parsedVersions = versions.map((input) => ({ input, parsed: engine.parseVersion(input) }));
  const range = engine.parseRange(rangeText);
  if ("error" in range) {
    return {
      ok: false,
      error: range.error,
      checks: parsedVersions.map(({ input, parsed }) => ("error" in parsed ? { input, error: parsed.error } : { input, normalized: parsed.normalized })),
    };
  }
  const checks: VersionCheck[] = [];
  let best: { version: unknown; index: number } | undefined;
  let bestPre: { version: unknown; text: string } | undefined;
  parsedVersions.forEach(({ input, parsed }) => {
    if ("error" in parsed) {
      checks.push({ input, error: parsed.error });
      return;
    }
    const status = range.range.check(parsed.version);
    checks.push({ input, normalized: parsed.normalized, status });
    if (status === "match" && (!best || engine.compare(parsed.version, best.version) > 0)) best = { version: parsed.version, index: checks.length - 1 };
    if (status !== "match" && status !== "miss" && (!bestPre || engine.compare(parsed.version, bestPre.version) > 0)) {
      bestPre = { version: parsed.version, text: parsed.normalized };
    }
  });
  if (best) checks[best.index].highest = true;
  let highestNote: string | undefined;
  if (!best && bestPre) {
    highestNote =
      dialect === "python"
        ? `No final release matches. PEP 440 lets an installer fall back to a pre-release then. The highest is ${bestPre.text}.`
        : dialect === "composer"
          ? `Only less stable versions match. The highest is ${bestPre.text}. Add a stability flag, such as @beta, to allow it.`
          : `Only pre-releases fall inside the bounds, and the pre-release rule excludes them. The highest is ${bestPre.text}.`;
  }
  const { alternatives, joinAnd, notes } = range.range;
  const normalized = alternatives.map((set) => (set.length ? set.join(joinAnd) : "*")).join(" || ");
  return {
    ok: true,
    explanation: { alternatives, normalized, sentences: alternatives.map((set) => describeComparators(set, dialect)), notes },
    checks,
    highest: best ? checks[best.index].input : undefined,
    highestNote,
  };
}

/** Shows a Composer version without the fourth number when it is zero. */
const shortComposer = (version: string) => version.replace(/^(\d+\.\d+\.\d+)\.0(?=-|$)/, "$1");

function describeComparator(text: string, dialect: VersionDialect): string {
  if (text === "*" || text === "") return "any version";
  const match = /^(===|==|!=|>=|<=|>|<|=)?(.*)$/.exec(text);
  const op = match[1] ?? "=";
  let version = match[2];
  let detail = "";
  if (dialect === "npm" && op === "<" && version.endsWith("-0")) {
    version = version.slice(0, -2);
  } else if (dialect === "composer") {
    if (version.endsWith("-dev") && (op === "<" || op === ">=")) {
      version = shortComposer(version.slice(0, -4));
      detail = op === "<" ? ` (no ${version} pre-releases)` : ` (${version} pre-releases count)`;
    } else {
      version = shortComposer(version);
    }
  }
  if (version.endsWith(".*")) {
    const prefix = version.slice(0, -2);
    return op === "!=" ? `not a ${prefix}.x version` : `any ${prefix}.x version`;
  }
  switch (op) {
    case ">=":
      return `at least ${version}${detail}`;
    case ">":
      return `above ${version}${detail}`;
    case "<":
      return `below ${version}${detail}`;
    case "<=":
      return `at most ${version}${detail}`;
    case "!=":
      return `not ${version}`;
    case "===":
      return `exactly the string ${version}`;
    default:
      return `exactly ${version}`;
  }
}

export function describeComparators(comparators: string[], dialect: VersionDialect): string {
  if (comparators.length === 0) return "Any version.";
  const text = comparators.map((item) => describeComparator(item, dialect)).join(" and ");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

// ---------- compare mode ----------

export type CompareResult =
  | {
      ok: true;
      order: -1 | 0 | 1;
      left: string;
      right: string;
      /** The part that changes from the lower version to the higher one, such as "minor" or "premajor". */
      bump?: string;
      note?: string;
    }
  | { ok: false; error: string; side?: "left" | "right" };

function releaseBump(a: number[], b: number[], names: string[]): string | undefined {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return names[index] ?? `segment ${index + 1}`;
  }
  return undefined;
}

export function compareVersions(dialect: VersionDialect, leftText: string, rightText: string): CompareResult {
  const engine = ENGINES[dialect];
  const left = engine.parseVersion(leftText);
  if ("error" in left) return { ok: false, error: `First version: ${left.error}`, side: "left" };
  const right = engine.parseVersion(rightText);
  if ("error" in right) return { ok: false, error: `Second version: ${right.error}`, side: "right" };
  const order = sign(engine.compare(left.version, right.version)) as -1 | 0 | 1;
  const base = { ok: true as const, order, left: left.normalized, right: right.normalized };
  if (dialect === "npm" || dialect === "cargo") {
    const bump = semverDiff(left.normalized, right.normalized) ?? undefined;
    const sameBuild = (semverParse(leftText.trim())?.build.join(".") ?? "") === (semverParse(rightText.trim())?.build.join(".") ?? "");
    return { ...base, bump, note: order === 0 && !sameBuild ? "Build metadata (+...) does not change the order." : undefined };
  }
  if (dialect === "composer") {
    const nums = (version: string) => version.split("-")[0].split(".").map(Number);
    const bump = releaseBump(nums(left.normalized), nums(right.normalized), ["major", "minor", "patch", "fourth number"]);
    return { ...base, bump: bump ?? (order === 0 ? undefined : "stability") };
  }
  const a = left.version as Pep440Version;
  const b = right.version as Pep440Version;
  let bump = a.epoch !== b.epoch ? "epoch" : releaseBump(a.release, b.release, ["major", "minor", "micro"]);
  if (!bump && order !== 0) {
    bump = a.pre?.join() !== b.pre?.join() ? "pre-release" : a.post !== b.post ? "post-release" : a.dev !== b.dev ? "dev release" : "local";
  }
  const note = order === 0 && formatPep440(a) !== formatPep440(b) ? "Trailing zeros do not count. 1.0 and 1.0.0 are the same version." : undefined;
  return { ...base, bump, note };
}

export interface NextVersion {
  label: string;
  version: string;
}

/** The versions after `text`, one per kind of bump. `preid` names the pre-release, such as rc or beta. */
export function nextVersions(dialect: VersionDialect, text: string, preid: string): NextVersion[] {
  const parsed = ENGINES[dialect].parseVersion(text);
  if (!parsed.ok) return [];
  if (dialect === "npm" || dialect === "cargo") {
    const id = preid.trim() || undefined;
    const kinds: [string, ReleaseType][] = [
      ["Major", "major"],
      ["Minor", "minor"],
      ["Patch", "patch"],
      ["Pre-major", "premajor"],
      ["Pre-minor", "preminor"],
      ["Pre-patch", "prepatch"],
      ["Pre-release", "prerelease"],
    ];
    return kinds.flatMap(([label, kind]) => {
      try {
        const version = semverInc(parsed.normalized, kind, id);
        return version ? [{ label, version }] : [];
      } catch {
        return [];
      }
    });
  }
  const release =
    dialect === "composer"
      ? parsed.normalized.split("-")[0].split(".").slice(0, 3).map(Number)
      : [...(parsed.version as Pep440Version).release, 0, 0].slice(0, 3);
  const epoch = dialect === "python" && (parsed.version as Pep440Version).epoch ? `${(parsed.version as Pep440Version).epoch}!` : "";
  const [major, minor, patch] = release;
  // Like npm, a pre-release moves up to its own release first: the next major after 2.0.0b1 is 2.0.0.
  const pre = dialect === "python" ? isPrerelease(parsed.version as Pep440Version) : composerStability(parsed.normalized) !== "stable";
  return [
    { label: "Major", version: `${epoch}${pre && minor === 0 && patch === 0 ? major : major + 1}.0.0` },
    { label: "Minor", version: `${epoch}${major}.${pre && patch === 0 ? minor : minor + 1}.0` },
    { label: dialect === "python" ? "Micro" : "Patch", version: `${epoch}${major}.${minor}.${pre ? patch : patch + 1}` },
  ];
}
