/**
 * Reads the delivery path and the authentication results from raw email headers.
 * Works on a header block or a full .eml message. The body is ignored.
 */

import { decodeEncodedWords, parseEmailDate, parseHeaderBlock, type EmailHeader } from "@/utils/email-reader";

export interface Hop {
  /** 1 for the first server, which is the last Received header in the message. */
  index: number;
  from: string;
  /** The sending IP address from the `from` clause, if the server recorded one. */
  ip: string;
  by: string;
  protocol: string;
  date: Date | null;
  /** Milliseconds since the previous hop, or since the Date header for the first hop. Null if a date is missing. */
  delay: number | null;
  raw: string;
}

export type AuthMethod = "spf" | "dkim" | "dmarc" | "arc" | string;

export interface AuthResult {
  method: AuthMethod;
  /** pass, fail, softfail, neutral, none, temperror, permerror, policy, or another word. */
  result: string;
  /** Properties such as `smtp.mailfrom` and `header.d`. */
  props: Record<string, string>;
  /** The comment after the result, such as `(google.com: domain of ... designates ...)`. */
  comment: string;
}

export interface AuthReport {
  /** The server that wrote the results. */
  server: string;
  /** The header the results came from. */
  source: "Authentication-Results" | "ARC-Authentication-Results" | "Received-SPF";
  results: AuthResult[];
}

export interface DkimSignature {
  domain: string;
  selector: string;
  algorithm: string;
}

export interface HeaderAnalysis {
  headers: EmailHeader[];
  from: string;
  to: string;
  subject: string;
  date: Date | null;
  messageId: string;
  returnPath: string;
  replyTo: string;
  hops: Hop[];
  /** Milliseconds from the first dated hop (or the Date header) to the last hop. */
  totalDelay: number | null;
  auth: AuthReport[];
  dkimSignatures: DkimSignature[];
  warnings: string[];
}

/** A hop that took longer than this is marked slow. */
export const SLOW_HOP_MS = 60_000;

const values = (headers: EmailHeader[], name: string) => headers.filter((h) => h.name.toLowerCase() === name).map((h) => h.value);
const first = (headers: EmailHeader[], name: string) => values(headers, name)[0] ?? "";

/** Removes comments in parentheses, with one level of nesting. */
const stripComments = (value: string) => value.replace(/\((?:[^()\\]|\\.|\([^()]*\))*\)/g, " ");

const domainOf = (address: string) => /@([^\s>@]+)>?\s*$/.exec(address.trim())?.[1]?.toLowerCase() ?? "";

/** Reads one Received header: `from A (B [1.2.3.4]) by C with ESMTPS id X for <y>; date`. */
export function parseReceived(raw: string): Omit<Hop, "index" | "delay"> {
  const semicolon = raw.lastIndexOf(";");
  const clauses = semicolon >= 0 ? raw.slice(0, semicolon) : raw;
  const date = semicolon >= 0 ? parseEmailDate(raw.slice(semicolon + 1)) : null;
  const bare = stripComments(clauses);

  const fromPart = /(?:^|\s)from\s+([\s\S]*?)(?=\s(?:by|via|with|id|for)\s|$)/i.exec(clauses)?.[1] ?? "";
  // The comment holds the address the receiving server saw. The name before it is what the sender claimed.
  const seen = /\(([^()]*)\)/.exec(fromPart)?.[1] ?? "";
  const ipMatch =
    /\[(?:IPv6:)?([0-9a-f:.]+)\]/i.exec(seen) ??
    /(?:^|\s)([0-9]{1,3}(?:\.[0-9]{1,3}){3})(?=\s|$)/.exec(seen) ??
    /\[(?:IPv6:)?([0-9a-f:.]+)\]/i.exec(fromPart);
  return {
    from: /(?:^|\s)from\s+(\S+)/i.exec(bare)?.[1] ?? "",
    ip: ipMatch?.[1] ?? "",
    by: /(?:^|\s)by\s+(\S+)/i.exec(bare)?.[1] ?? "",
    protocol: /(?:^|\s)with\s+(\S+)/i.exec(bare)?.[1] ?? "",
    date,
    raw,
  };
}

const splitOutsideQuotes = (value: string, separator: string) => {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let depth = 0;
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "(") depth++;
    else if (!quoted && ch === ")") depth = Math.max(0, depth - 1);
    if (ch === separator && !quoted && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
};

const parseResult = (part: string): AuthResult | null => {
  const match = /^([a-z][a-z0-9_-]*)\s*=\s*([a-z0-9_-]+)\s*([\s\S]*)$/i.exec(part);
  if (!match) return null;
  const [, method, result, rest] = match;
  const comment = (/\(((?:[^()]|\([^()]*\))*)\)/.exec(rest)?.[1] ?? "").trim();
  const props: Record<string, string> = {};
  for (const prop of stripComments(rest).matchAll(/([a-z][a-z0-9_-]*\.[a-z0-9_.-]+)\s*=\s*("[^"]*"|\S+)/gi)) {
    props[prop[1].toLowerCase()] = prop[2].replace(/^"|"$/g, "");
  }
  return { method: method.toLowerCase(), result: result.toLowerCase(), props, comment };
};

/** Reads an Authentication-Results value (RFC 8601): `server; spf=pass smtp.mailfrom=a.com; dkim=pass header.d=a.com`. */
export function parseAuthenticationResults(value: string, source: AuthReport["source"] = "Authentication-Results"): AuthReport {
  const parts = splitOutsideQuotes(value, ";");
  // ARC-Authentication-Results starts with the instance tag, i=1.
  if (source === "ARC-Authentication-Results" && /^i\s*=\s*\d+$/i.test(parts[0] ?? "")) parts.shift();
  const server = stripComments(parts.shift() ?? "").trim().split(/\s+/)[0] ?? "";
  const results = parts.map(parseResult).filter((result): result is AuthResult => result !== null && result.method !== "none");
  return { server, source, results };
}

/** Reads a Received-SPF value: `pass (google.com: domain of ...) client-ip=1.2.3.4; envelope-from=...`. */
export function parseReceivedSpf(value: string): AuthReport {
  const result = /^\s*([a-z]+)/i.exec(value)?.[1]?.toLowerCase() ?? "";
  const comment = (/\(((?:[^()]|\([^()]*\))*)\)/.exec(value)?.[1] ?? "").trim();
  const props: Record<string, string> = {};
  for (const prop of stripComments(value).matchAll(/([a-z][a-z0-9_-]*)\s*=\s*("[^"]*"|[^\s;]+)/gi)) {
    props[prop[1].toLowerCase()] = prop[2].replace(/^"|"$/g, "");
  }
  const server = props.receiver ?? "";
  return { server, source: "Received-SPF", results: result ? [{ method: "spf", result, props, comment }] : [] };
}

/** Reads the `d=`, `s=`, and `a=` tags of a DKIM-Signature. */
export function parseDkimSignature(value: string): DkimSignature {
  const tags: Record<string, string> = {};
  for (const tag of value.split(";")) {
    const eq = tag.indexOf("=");
    if (eq > 0) tags[tag.slice(0, eq).trim().toLowerCase()] = tag.slice(eq + 1).replace(/\s+/g, "");
  }
  return { domain: (tags.d ?? "").toLowerCase(), selector: tags.s ?? "", algorithm: tags.a ?? "" };
}

/** Reads header text. A full message works too: everything after the first blank line is ignored. */
export function analyzeHeaders(input: string): HeaderAnalysis {
  const text = input.replace(/^\uFEFF/, "").replace(/^\s*\r?\n/, "").replace(/^From [^\r\n]*\r?\n/, "");
  const blank = /\r?\n[ \t]*\r?\n/.exec(text);
  const headers = parseHeaderBlock(blank ? text.slice(0, blank.index) : text);
  if (!headers.some((h) => /^(received|from|to|subject|date|message-id|authentication-results|dkim-signature|return-path)$/i.test(h.name))) {
    throw new Error("No email headers found. Paste the headers of a message, starting with lines such as Received, From, or Subject.");
  }

  const date = parseEmailDate(first(headers, "date"));
  // Each server adds its Received header on top, so the bottom one is the first hop.
  const received = values(headers, "received").reverse();
  const hops: Hop[] = [];
  let previous = date;
  for (const [i, raw] of received.entries()) {
    const hop = parseReceived(raw);
    const delay = hop.date && previous ? hop.date.getTime() - previous.getTime() : null;
    hops.push({ ...hop, index: i + 1, delay });
    if (hop.date) previous = hop.date;
  }

  const dated = hops.filter((hop) => hop.date);
  const start = date ?? dated[0]?.date ?? null;
  const end = dated.at(-1)?.date ?? null;
  const totalDelay = start && end ? end.getTime() - start.getTime() : null;

  let auth = values(headers, "authentication-results").map((value) => parseAuthenticationResults(value));
  if (!auth.length) auth = values(headers, "arc-authentication-results").map((value) => parseAuthenticationResults(value, "ARC-Authentication-Results"));
  const hasSpf = auth.some((report) => report.results.some((result) => result.method === "spf"));
  if (!hasSpf) auth.push(...values(headers, "received-spf").map(parseReceivedSpf));
  auth = auth.filter((report) => report.results.length);

  const from = decodeEncodedWords(first(headers, "from"));
  const replyTo = decodeEncodedWords(first(headers, "reply-to"));
  const warnings: string[] = [];
  if (hops.some((hop) => hop.delay !== null && hop.delay < 0)) {
    warnings.push("A hop has a time earlier than the hop before it. A server clock is probably wrong, so the delays are not exact.");
  }
  const fromDomain = domainOf(from);
  const replyDomain = domainOf(replyTo);
  if (fromDomain && replyDomain && fromDomain !== replyDomain) {
    warnings.push(`Replies go to ${replyDomain}, not to the sender domain ${fromDomain}.`);
  }

  return {
    headers,
    from,
    to: decodeEncodedWords(first(headers, "to")),
    subject: decodeEncodedWords(first(headers, "subject")),
    date,
    messageId: first(headers, "message-id"),
    returnPath: first(headers, "return-path"),
    replyTo,
    hops,
    totalDelay,
    auth,
    dkimSignatures: values(headers, "dkim-signature").map(parseDkimSignature),
    warnings,
  };
}

/** Formats a delay such as 1 h 4 min, 2 min 5 s, 3 s, or <1 s. */
export function formatDelay(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const abs = Math.abs(ms);
  if (abs < 1000) return ms < 0 ? "-<1 s" : "<1 s";
  const total = Math.round(abs / 1000);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = days ? [`${days} d`, hours && `${hours} h`] : hours ? [`${hours} h`, minutes && `${minutes} min`] : minutes ? [`${minutes} min`, seconds && `${seconds} s`] : [`${seconds} s`];
  return sign + parts.filter(Boolean).join(" ");
}

/** The overall result for one method across all reports: the first report wins, because the top header comes from the receiving server. */
export function authSummary(auth: AuthReport[], method: AuthMethod): AuthResult | null {
  for (const report of auth) {
    const result = report.results.find((item) => item.method === method);
    if (result) return result;
  }
  return null;
}

export type ResultTone = "pass" | "fail" | "neutral";

export function resultTone(result: string): ResultTone {
  if (result === "pass") return "pass";
  if (["fail", "softfail", "permerror", "temperror", "policy", "hardfail"].includes(result)) return "fail";
  return "neutral";
}
