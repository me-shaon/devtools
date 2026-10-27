/**
 * Secret and PII redaction: find API keys, tokens, passwords, and personal
 * data in text and mask them before the text is shared with an AI assistant.
 *
 * Every pattern is a single linear pass. No pattern has a nested unbounded
 * quantifier, and token patterns use lookbehinds so they only start at a
 * token boundary. Detection is pattern-based and can miss secrets.
 */

export type DetectorId =
  | "private-key"
  | "aws-access-key"
  | "aws-secret-key"
  | "github-token"
  | "anthropic-key"
  | "openai-key"
  | "google-api-key"
  | "stripe-key"
  | "slack-token"
  | "slack-webhook"
  | "jwt"
  | "bearer-token"
  | "connection-password"
  | "secret-assignment"
  | "email"
  | "ip-address"
  | "credit-card"
  | "ssn"
  | "phone"
  | "high-entropy";

export type DetectorGroup = "keys" | "credentials" | "personal" | "heuristic";

export interface DetectorInfo {
  id: DetectorId;
  /** Name shown next to the toggle and in the findings list. */
  label: string;
  /** Short type name used in `[REDACTED:tag]` labels. */
  tag: string;
  /** Prefix of consistent placeholders, for example EMAIL in `<EMAIL_1>`. */
  prefix: string;
  group: DetectorGroup;
  defaultOn: boolean;
  /** When two matches overlap, the higher priority wins, then the longer match. */
  priority: number;
}

export const DETECTORS: DetectorInfo[] = [
  { id: "private-key", label: "Private key blocks", tag: "private-key", prefix: "PRIVATE_KEY", group: "keys", defaultOn: true, priority: 100 },
  { id: "aws-access-key", label: "AWS access key IDs", tag: "aws-access-key", prefix: "AWS_KEY", group: "keys", defaultOn: true, priority: 90 },
  { id: "aws-secret-key", label: "AWS secret keys", tag: "aws-secret-key", prefix: "AWS_SECRET", group: "keys", defaultOn: true, priority: 88 },
  { id: "github-token", label: "GitHub tokens", tag: "github-token", prefix: "GITHUB_TOKEN", group: "keys", defaultOn: true, priority: 90 },
  { id: "anthropic-key", label: "Anthropic keys", tag: "anthropic-key", prefix: "ANTHROPIC_KEY", group: "keys", defaultOn: true, priority: 92 },
  { id: "openai-key", label: "OpenAI keys", tag: "openai-key", prefix: "OPENAI_KEY", group: "keys", defaultOn: true, priority: 90 },
  { id: "google-api-key", label: "Google API keys", tag: "google-api-key", prefix: "GOOGLE_KEY", group: "keys", defaultOn: true, priority: 90 },
  { id: "stripe-key", label: "Stripe keys", tag: "stripe-key", prefix: "STRIPE_KEY", group: "keys", defaultOn: true, priority: 90 },
  { id: "slack-token", label: "Slack tokens", tag: "slack-token", prefix: "SLACK_TOKEN", group: "keys", defaultOn: true, priority: 90 },
  { id: "slack-webhook", label: "Slack webhooks", tag: "slack-webhook", prefix: "SLACK_WEBHOOK", group: "keys", defaultOn: true, priority: 90 },
  { id: "jwt", label: "JWTs", tag: "jwt", prefix: "JWT", group: "credentials", defaultOn: true, priority: 85 },
  { id: "bearer-token", label: "Authorization headers", tag: "bearer-token", prefix: "TOKEN", group: "credentials", defaultOn: true, priority: 75 },
  { id: "connection-password", label: "Connection string passwords", tag: "password", prefix: "PASSWORD", group: "credentials", defaultOn: true, priority: 70 },
  { id: "secret-assignment", label: "Password and secret values", tag: "secret", prefix: "SECRET", group: "credentials", defaultOn: true, priority: 60 },
  { id: "credit-card", label: "Card numbers", tag: "credit-card", prefix: "CARD", group: "personal", defaultOn: true, priority: 50 },
  { id: "email", label: "Email addresses", tag: "email", prefix: "EMAIL", group: "personal", defaultOn: true, priority: 45 },
  { id: "ssn", label: "US Social Security numbers", tag: "ssn", prefix: "SSN", group: "personal", defaultOn: false, priority: 40 },
  { id: "ip-address", label: "IP addresses", tag: "ip-address", prefix: "IP", group: "personal", defaultOn: true, priority: 35 },
  { id: "phone", label: "Phone numbers", tag: "phone", prefix: "PHONE", group: "personal", defaultOn: false, priority: 30 },
  { id: "high-entropy", label: "High-entropy strings", tag: "high-entropy", prefix: "SECRET", group: "heuristic", defaultOn: false, priority: 10 },
];

const DETECTOR_BY_ID = new Map(DETECTORS.map((d) => [d.id, d]));

export function getDetector(id: DetectorId): DetectorInfo {
  return DETECTOR_BY_ID.get(id) as DetectorInfo;
}

export type DetectorSettings = Record<DetectorId, boolean>;

export function defaultDetectorSettings(): DetectorSettings {
  return Object.fromEntries(DETECTORS.map((d) => [d.id, d.defaultOn])) as DetectorSettings;
}

export type MaskStyle = "label" | "partial" | "placeholder";

export interface RedactOptions {
  /** Which detectors run. Missing ids use the detector default. */
  detectors?: Partial<DetectorSettings>;
  /** Leave private, loopback, and link-local IP addresses unmasked. */
  keepPrivateIps?: boolean;
  style?: MaskStyle;
  /** Minimum Shannon entropy, in bits per character, for the high-entropy detector. */
  entropyThreshold?: number;
}

/** One masked span. `start` and `end` index the original text. */
export interface SecretMatch {
  start: number;
  end: number;
  detector: DetectorId;
  value: string;
}

export interface Finding {
  detector: DetectorId;
  label: string;
  count: number;
  /** 1-based line of the first match. */
  firstLine: number;
}

export interface MappingEntry {
  placeholder: string;
  original: string;
  detector: DetectorId;
}

export interface RedactResult {
  output: string;
  matches: SecretMatch[];
  findings: Finding[];
  /** Placeholder to original value. Filled in placeholder style only. Never part of `output`. */
  mapping: MappingEntry[];
  total: number;
  types: number;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Luhn checksum over a string of digits. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Shannon entropy of a string, in bits per character. */
export function shannonEntropy(value: string): number {
  if (!value) return 0;
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const length = Array.from(value).length;
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** True for private, loopback, link-local, and unspecified IPv4 addresses. */
export function isPrivateIpv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/** True for loopback, unspecified, link-local, and unique local IPv6 addresses. */
export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  const first = parseInt(lower.split(":")[0] || "0", 16);
  return (first & 0xffc0) === 0xfe80 || (first & 0xfe00) === 0xfc00;
}

function isValidIpv6(candidate: string): boolean {
  // Code such as Face::add is all hex letters. Real addresses almost always contain a digit.
  if (!/\d/.test(candidate)) return false;
  const doubles = candidate.split("::").length - 1;
  if (doubles > 1) return false;
  if (doubles === 0) {
    const groups = candidate.split(":");
    return groups.length === 8 && groups.every((g) => g.length >= 1 && g.length <= 4);
  }
  const [head, tail] = candidate.split("::");
  const groups = [...(head ? head.split(":") : []), ...(tail ? tail.split(":") : [])];
  if (groups.length > 7 || groups.some((g) => g.length < 1 || g.length > 4)) return false;
  // "::" alone is too common in code to treat as an address.
  return groups.length >= 1;
}

/* ------------------------------------------------------------------ */
/* Patterns                                                            */
/* ------------------------------------------------------------------ */

interface Candidate {
  start: number;
  end: number;
}

type Scanner = (text: string, options: Required<Pick<RedactOptions, "keepPrivateIps" | "entropyThreshold">>) => Candidate[];

/** Run a global regex and return the span of `group` (0 = whole match). Groups before it give the offset. */
function scan(text: string, regex: RegExp, group = 0, accept?: (value: string, match: RegExpExecArray) => boolean): Candidate[] {
  const out: Candidate[] = [];
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text))) {
    if (m[0] === "") {
      regex.lastIndex++;
      continue;
    }
    const value = m[group];
    if (value === undefined || value === "") continue;
    let offset = 0;
    for (let g = 1; g < group; g++) offset += m[g]?.length ?? 0;
    const start = m.index + offset;
    if (accept && !accept(value, m)) continue;
    out.push({ start, end: start + value.length });
  }
  return out;
}

const AWS_ACCESS_KEY = /(?<![A-Za-z0-9])(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}(?![A-Za-z0-9])/g;
const AWS_SECRET_KEY = /(\baws_?secret_?(?:access_?)?key["']?[ \t]{0,8}[:=][ \t]{0,8}["']?)([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi;
const GITHUB_TOKEN = /(?<![A-Za-z0-9_])(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})(?![A-Za-z0-9_])/g;
const ANTHROPIC_KEY = /(?<![A-Za-z0-9_-])sk-ant-[A-Za-z0-9_-]{20,}/g;
const OPENAI_KEY = /(?<![A-Za-z0-9_-])sk-(?!ant-)[A-Za-z0-9_-]{20,}/g;
const GOOGLE_API_KEY = /(?<![A-Za-z0-9_-])AIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g;
const STRIPE_KEY = /(?<![A-Za-z0-9_])(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{10,}/g;
const SLACK_TOKEN = /(?<![A-Za-z0-9-])xox[abprs]-[0-9A-Za-z-]{10,}/g;
const SLACK_WEBHOOK = /https:\/\/hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9_/-]{10,}/g;
const JWT = /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const AUTH_HEADER = /(\bAuthorization["']?[ \t]{0,8}[:=][ \t]{0,8}["']?(?:(?:Bearer|Basic|Token|Digest|Bot)[ \t]{1,8})?)([A-Za-z0-9._~+/=-]{8,})/gi;
const BEARER = /(\bBearer[ \t]{1,8})([A-Za-z0-9._~+/-]{16,}=*)/gi;
const CONNECTION_STRING = /(?<![A-Za-z0-9+.-])([A-Za-z][A-Za-z0-9+.-]{1,20}:\/\/)([^\s:@/?#]{0,128}:)([^\s@/]{1,256})@(?=[^\s@/])/g;
const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}(?![A-Za-z0-9-])/g;
const IPV4 = /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?!\d|\.\d)/g;
const IPV6 = /(?<![:\w])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![:\w])/g;
const CARD = /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g;
const SSN = /(?<![\d-])(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}(?![\d-])/g;
const PHONE_E164 = /(?<![\w+])\+[1-9]\d{6,14}(?!\d)/g;
const PHONE_INTL = /(?<![\w+])\+[1-9]\d{0,2}(?:[ .-]\(?\d{1,4}\)?){2,5}(?![\d-])/g;
const PHONE_US = /(?<![\w(+-])(?:\(\d{3}\)[ .-]?|\d{3}[.-])\d{3}[.-]\d{4}(?![\d-])/g;
const ENTROPY_TOKEN = /[A-Za-z0-9+/_=-]{20,}/g;

/** Find the base64 body of every PEM private key block, using indexOf so a missing END stays linear. */
const scanPrivateKeys: Scanner = (text) => {
  const out: Candidate[] = [];
  const header = /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----/y;
  let from = 0;
  for (;;) {
    const begin = text.indexOf("-----BEGIN ", from);
    if (begin < 0) break;
    header.lastIndex = begin;
    if (!header.test(text)) {
      from = begin + 11;
      continue;
    }
    const endMarker = text.indexOf("-----END ", header.lastIndex);
    let end: number;
    if (endMarker < 0) {
      // A truncated key: mask up to the next blank line.
      const blank = text.indexOf("\n\n", header.lastIndex);
      end = blank < 0 ? text.length : blank;
    } else {
      const close = text.indexOf("-----", endMarker + 9);
      end = close < 0 || close - endMarker > 80 ? text.length : close + 5;
    }
    out.push({ start: begin, end });
    from = end;
  }
  return out;
};

const SECRET_KEY_WORDS = /pass(?:wd|word|phrase|code)|^pass$|pwd|secret|token|apikey|accesskey|privatekey|credential|sessionid|cookie|auth(?!or)/;
const NOT_SECRET_KEY = /(?:tokens|count|type|url|uri|endpoint|length|len|expiry|expires|expiresin|expiresat|expiration|ttl|policy|mode|enabled|required|limit|header|field|file|path|name|(?<!session)id|ids)$|author/;
const ASSIGNMENT = /(?<![\w.-])(["']?)([A-Za-z_][\w.-]{0,63})\1[ \t]{0,16}(:=|=>|[:=])[ \t]{0,16}/g;
const UNQUOTED_END = /[\s,;&"'<>)}\]]/;

/** Values that are not secrets: empty, booleans, null, references, and nested structures. */
function isPlaceholderValue(value: string): boolean {
  if (value.length < 2) return true;
  if (/^(?:true|false|null|none|nil|undefined|yes|no|on|off)$/i.test(value)) return true;
  if (/^[[{$<(|>]/.test(value) || value.startsWith("process.env") || value.includes("(")) return true;
  return /^(?:\*+|x+|\.+)$/i.test(value) || value.startsWith("[REDACTED");
}

/** password=..., "token": "...", api_key: ... in key=value, JSON, YAML, and .env text. The key is kept. */
const scanAssignments: Scanner = (text) => {
  const out: Candidate[] = [];
  ASSIGNMENT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ASSIGNMENT.exec(text))) {
    const key = m[2];
    const normalized = key.toLowerCase().replace(/[-_.]/g, "");
    if (!SECRET_KEY_WORDS.test(normalized) || NOT_SECRET_KEY.test(normalized)) continue;
    // "a == b" and "a => b" in code are comparisons and arrows, not assignments.
    if (m[3] === "=" && text[ASSIGNMENT.lastIndex] === "=") continue;
    let pos = ASSIGNMENT.lastIndex;
    const quote = text[pos];
    let start: number;
    let end: number;
    if (quote === '"' || quote === "'" || quote === "`") {
      start = pos + 1;
      end = start;
      while (end < text.length && text[end] !== quote && text[end] !== "\n") {
        end += text[end] === "\\" ? 2 : 1;
      }
      if (text[end] !== quote) continue;
    } else {
      start = pos;
      // Look back at most 200 characters, so a long single line stays linear.
      let lineStart = m.index;
      while (lineStart > 0 && m.index - lineStart < 200 && text[lineStart - 1] !== "\n") lineStart--;
      const atLineStart = lineStart === 0 || text[lineStart - 1] === "\n";
      const keyStart = m.index + (m[1] ? 1 : 0);
      const yamlKey = m[3] === ":" && atLineStart && /^[ \t]*(?:- )?["']?$/.test(text.slice(lineStart, keyStart));
      end = start;
      if (yamlKey) {
        // A YAML scalar runs to the end of the line, minus a trailing comment.
        while (end < text.length && text[end] !== "\n" && text[end] !== "\r") end++;
        const hash = text.slice(start, end).search(/[ \t]#/);
        if (hash >= 0) end = start + hash;
        while (end > start && (text[end - 1] === " " || text[end - 1] === "\t")) end--;
      } else {
        while (end < text.length && !UNQUOTED_END.test(text[end])) end++;
      }
    }
    const value = text.slice(start, end);
    pos = end;
    ASSIGNMENT.lastIndex = Math.max(pos, ASSIGNMENT.lastIndex);
    if (isPlaceholderValue(value)) continue;
    // The shell's PWD variable holds a directory, not a password.
    if (normalized === "pwd" && value.startsWith("/")) continue;
    out.push({ start, end });
  }
  return out;
};

const SCANNERS: Record<DetectorId, Scanner> = {
  "private-key": scanPrivateKeys,
  "aws-access-key": (t) => scan(t, AWS_ACCESS_KEY),
  "aws-secret-key": (t) => scan(t, AWS_SECRET_KEY, 2),
  "github-token": (t) => scan(t, GITHUB_TOKEN),
  "anthropic-key": (t) => scan(t, ANTHROPIC_KEY),
  "openai-key": (t) => scan(t, OPENAI_KEY),
  "google-api-key": (t) => scan(t, GOOGLE_API_KEY),
  "stripe-key": (t) => scan(t, STRIPE_KEY),
  "slack-token": (t) => scan(t, SLACK_TOKEN),
  "slack-webhook": (t) => scan(t, SLACK_WEBHOOK),
  jwt: (t) => scan(t, JWT),
  "bearer-token": (t) => [...scan(t, AUTH_HEADER, 2), ...scan(t, BEARER, 2)],
  "connection-password": (t) => scan(t, CONNECTION_STRING, 3),
  "secret-assignment": scanAssignments,
  email: (t) => scan(t, EMAIL),
  "ip-address": (t, o) => [
    ...scan(t, IPV4, 0, (ip) => !(o.keepPrivateIps && isPrivateIpv4(ip))),
    ...scan(t, IPV6, 0, (ip) => isValidIpv6(ip) && !(o.keepPrivateIps && isPrivateIpv6(ip))),
  ],
  "credit-card": (t) =>
    scan(t, CARD, 0, (value) => {
      const digits = value.replace(/[ -]/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
    }),
  ssn: (t) => scan(t, SSN),
  phone: (t) => {
    const digitsOk = (value: string) => {
      const n = value.replace(/\D/g, "").length;
      return n >= 7 && n <= 15;
    };
    return [...scan(t, PHONE_E164), ...scan(t, PHONE_INTL, 0, digitsOk), ...scan(t, PHONE_US)];
  },
  "high-entropy": (t, o) =>
    scan(t, ENTROPY_TOKEN, 0, (token) => /\d/.test(token) && /[A-Za-z]/.test(token) && shannonEntropy(token) >= o.entropyThreshold),
};

/* ------------------------------------------------------------------ */
/* Detection and masking                                               */
/* ------------------------------------------------------------------ */

/**
 * Find every secret that the enabled detectors match. Overlapping matches are
 * resolved so the highest-priority detector wins, then the longest match.
 * The result is sorted by position and never overlaps.
 */
export function findSecrets(text: string, options: RedactOptions = {}): SecretMatch[] {
  if (!text) return [];
  const settings = { ...defaultDetectorSettings(), ...options.detectors };
  const scanOptions = { keepPrivateIps: options.keepPrivateIps ?? true, entropyThreshold: options.entropyThreshold ?? 4 };

  const candidates: (Candidate & { detector: DetectorInfo })[] = [];
  for (const detector of DETECTORS) {
    if (!settings[detector.id]) continue;
    for (const c of SCANNERS[detector.id](text, scanOptions)) {
      if (c.end > c.start) candidates.push({ ...c, detector });
    }
  }

  candidates.sort(
    (a, b) => b.detector.priority - a.detector.priority || b.end - b.start - (a.end - a.start) || a.start - b.start,
  );

  // Mark accepted spans so each check costs the length of the candidate.
  const taken = new Uint8Array(text.length);
  const accepted: SecretMatch[] = [];
  for (const c of candidates) {
    let free = true;
    for (let i = c.start; i < c.end; i++) {
      if (taken[i]) {
        free = false;
        break;
      }
    }
    if (!free) continue;
    taken.fill(1, c.start, c.end);
    accepted.push({ start: c.start, end: c.end, detector: c.detector.id, value: text.slice(c.start, c.end) });
  }
  return accepted.sort((a, b) => a.start - b.start);
}

function partialMask(match: SecretMatch): string {
  const { value } = match;
  if (match.detector === "private-key") {
    const lines = value.split(/\r?\n/);
    const last = lines[lines.length - 1];
    return lines.length > 1 && last.startsWith("-----END") ? `${lines[0]}\n****\n${last}` : `${lines[0]}\n****`;
  }
  if (value.length < 12) return "********";
  return `${value.slice(0, 4)}****${value.slice(-2)}`;
}

/** Find secrets and replace them with the chosen mask style. */
export function redactText(text: string, options: RedactOptions = {}): RedactResult {
  const style = options.style ?? "label";
  const matches = findSecrets(text, options);

  const placeholders = new Map<string, string>();
  const counters = new Map<string, number>();
  const mapping: MappingEntry[] = [];
  const findings = new Map<DetectorId, Finding>();

  const parts: string[] = [];
  let cursor = 0;
  let line = 1;
  let lineCursor = 0;
  for (const match of matches) {
    // Count line breaks between the last match and this one, so line numbers stay linear.
    for (let i = lineCursor; i < match.start; i++) if (text.charCodeAt(i) === 10) line++;
    lineCursor = match.start;

    const detector = getDetector(match.detector);
    let replacement: string;
    if (style === "label") {
      replacement = `[REDACTED:${detector.tag}]`;
    } else if (style === "partial") {
      replacement = partialMask(match);
    } else {
      let placeholder = placeholders.get(match.value);
      if (!placeholder) {
        const n = (counters.get(detector.prefix) ?? 0) + 1;
        counters.set(detector.prefix, n);
        placeholder = `<${detector.prefix}_${n}>`;
        placeholders.set(match.value, placeholder);
        mapping.push({ placeholder, original: match.value, detector: match.detector });
      }
      replacement = placeholder;
    }
    parts.push(text.slice(cursor, match.start), replacement);
    cursor = match.end;

    const finding = findings.get(match.detector);
    if (finding) finding.count++;
    else findings.set(match.detector, { detector: match.detector, label: detector.label, count: 1, firstLine: line });
  }
  parts.push(text.slice(cursor));

  return {
    output: parts.join(""),
    matches,
    findings: Array.from(findings.values()).sort((a, b) => a.firstLine - b.firstLine || b.count - a.count),
    mapping,
    total: matches.length,
    types: findings.size,
  };
}

export interface RestoreResult {
  output: string;
  /** Placeholders replaced with their original value. */
  restored: number;
  /** Placeholder-shaped tokens that are not in the mapping. */
  unknown: string[];
}

const PLACEHOLDER = /<([A-Z][A-Z0-9_]*_\d+)>/g;

/** Put original values back into text that contains consistent placeholders, such as an AI reply. */
export function restorePlaceholders(text: string, mapping: MappingEntry[]): RestoreResult {
  const lookup = new Map(mapping.map((m) => [m.placeholder, m.original]));
  const unknown = new Set<string>();
  let restored = 0;
  const output = text.replace(PLACEHOLDER, (token) => {
    const original = lookup.get(token);
    if (original === undefined) {
      unknown.add(token);
      return token;
    }
    restored++;
    return original;
  });
  return { output, restored, unknown: Array.from(unknown) };
}
