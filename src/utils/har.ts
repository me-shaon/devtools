/**
 * HTTP Archive (HAR 1.2) parsing, filtering, cURL export, and sanitizing.
 * Everything runs on the parsed object, so a file is parsed once and the
 * table, filters, and detail panel read the same normalized rows.
 */
import { base64ToBytes } from "@/utils/base64";
import { redactText, type DetectorSettings } from "@/utils/secret-redactor";

export interface HarNameValue {
  name: string;
  value: string;
  [key: string]: unknown;
}

export interface HarPostData {
  mimeType?: string;
  text?: string;
  params?: { name: string; value?: string; fileName?: string; contentType?: string }[];
  [key: string]: unknown;
}

export interface HarContent {
  size?: number;
  mimeType?: string;
  text?: string;
  encoding?: string;
  [key: string]: unknown;
}

export interface HarTimings {
  blocked?: number;
  dns?: number;
  connect?: number;
  ssl?: number;
  send?: number;
  wait?: number;
  receive?: number;
  [key: string]: unknown;
}

export interface HarEntry {
  pageref?: string;
  startedDateTime?: string;
  time?: number;
  request: {
    method?: string;
    url?: string;
    httpVersion?: string;
    headers?: HarNameValue[];
    cookies?: HarNameValue[];
    queryString?: HarNameValue[];
    postData?: HarPostData;
    headersSize?: number;
    bodySize?: number;
    [key: string]: unknown;
  };
  response: {
    status?: number;
    statusText?: string;
    headers?: HarNameValue[];
    cookies?: HarNameValue[];
    content?: HarContent;
    redirectURL?: string;
    headersSize?: number;
    bodySize?: number;
    _transferSize?: number;
    _error?: string;
    [key: string]: unknown;
  };
  timings?: HarTimings;
  _resourceType?: string;
  [key: string]: unknown;
}

export interface HarPage {
  id?: string;
  title?: string;
  startedDateTime?: string;
  pageTimings?: { onContentLoad?: number; onLoad?: number };
  [key: string]: unknown;
}

export interface Har {
  log: {
    version?: string;
    creator?: { name?: string; version?: string };
    pages?: HarPage[];
    entries: HarEntry[];
    [key: string]: unknown;
  };
}

export type StatusClass = "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "failed";
export type ResourceType = "xhr" | "js" | "css" | "img" | "doc" | "font" | "other";

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  xhr: "XHR/fetch",
  js: "JS",
  css: "CSS",
  img: "Image",
  doc: "Doc",
  font: "Font",
  other: "Other",
};

/** One table row: the values the table shows and sorts on, plus the raw entry for the detail panel. */
export interface HarRow {
  index: number;
  method: string;
  url: string;
  host: string;
  /** Path plus query string. */
  path: string;
  status: number;
  statusText: string;
  statusClass: StatusClass;
  mimeType: string;
  type: ResourceType;
  /** Bytes on the wire, or -1 when the HAR does not say. */
  transferSize: number;
  /** Decoded body size, or -1 when the HAR does not say. */
  contentSize: number;
  /** Total time in ms. */
  time: number;
  /** Start time in ms since the epoch, or NaN. */
  start: number;
  /** Lowercase text the filter box searches. */
  search: string;
  entry: HarEntry;
}

export interface HarSummary {
  count: number;
  transferred: number;
  /** From the first request start to the last request end, in ms. */
  span: number;
  /** Earliest start, in ms since the epoch. The waterfall measures from here. */
  firstStart: number;
  errors: number;
  pages: { id: string; title: string; onLoad: number | null }[];
}

export interface ParsedHar {
  har: Har;
  rows: HarRow[];
  summary: HarSummary;
}

export class HarError extends Error {}

const num = (value: unknown, fallback = -1) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

const statusClassOf = (status: number, error: unknown): StatusClass => {
  if (!status || status < 100 || error) return "failed";
  if (status < 200) return "1xx";
  if (status < 300) return "2xx";
  if (status < 400) return "3xx";
  if (status < 500) return "4xx";
  return "5xx";
};

const CHROME_TYPES: Record<string, ResourceType> = {
  xhr: "xhr",
  fetch: "xhr",
  eventsource: "xhr",
  script: "js",
  stylesheet: "css",
  image: "img",
  document: "doc",
  font: "font",
};

/** The resource type from Chrome's _resourceType, else from the response MIME type. */
export function resourceTypeOf(mimeType: string, resourceType?: string): ResourceType {
  if (resourceType && CHROME_TYPES[resourceType.toLowerCase()]) return CHROME_TYPES[resourceType.toLowerCase()];
  if (resourceType) return "other";
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("image/")) return "img";
  if (mime.startsWith("font/") || /woff|ttf|otf|opentype/.test(mime)) return "font";
  if (mime.includes("html")) return "doc";
  if (/javascript|ecmascript/.test(mime)) return "js";
  if (mime.includes("css")) return "css";
  if (/json|xml|x-www-form-urlencoded|text\/plain|event-stream/.test(mime)) return "xhr";
  return "other";
}

const splitUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return { host: parsed.host, path: `${parsed.pathname}${parsed.search}` };
  } catch {
    return { host: "", path: url };
  }
};

/** Bytes on the wire: Chrome's _transferSize, else body plus headers when both are known. */
const transferSizeOf = (response: HarEntry["response"]) => {
  const transfer = num(response._transferSize);
  if (transfer >= 0) return transfer;
  const body = num(response.bodySize);
  const headers = num(response.headersSize);
  if (body < 0) return -1;
  return body + Math.max(headers, 0);
};

export function normalizeEntry(entry: HarEntry, index: number): HarRow {
  const request = entry.request ?? {};
  const response = entry.response ?? {};
  const method = String(request.method ?? "GET").toUpperCase();
  const url = String(request.url ?? "");
  const { host, path } = splitUrl(url);
  const status = num(response.status, 0);
  const mimeType = String(response.content?.mimeType ?? "").split(";")[0].trim();
  const statusText = String(response.statusText ?? "");
  return {
    index,
    method,
    url,
    host,
    path,
    status,
    statusText,
    statusClass: statusClassOf(status, response._error),
    mimeType,
    type: resourceTypeOf(mimeType, typeof entry._resourceType === "string" ? entry._resourceType : undefined),
    transferSize: transferSizeOf(response),
    contentSize: num(response.content?.size),
    time: Math.max(num(entry.time, 0), 0),
    start: entry.startedDateTime ? Date.parse(entry.startedDateTime) : NaN,
    search: `${method} ${status} ${url} ${mimeType}`.toLowerCase(),
    entry,
  };
}

export function summarize(har: Har, rows: HarRow[]): HarSummary {
  let first = Infinity;
  let last = -Infinity;
  let transferred = 0;
  let errors = 0;
  for (const row of rows) {
    if (row.transferSize > 0) transferred += row.transferSize;
    if (row.statusClass === "failed" || row.status >= 400) errors++;
    if (Number.isNaN(row.start)) continue;
    first = Math.min(first, row.start);
    last = Math.max(last, row.start + row.time);
  }
  const pages = (har.log.pages ?? []).map((page, i) => ({
    id: String(page.id ?? `page_${i + 1}`),
    title: String(page.title ?? page.id ?? `Page ${i + 1}`),
    onLoad: num(page.pageTimings?.onLoad) >= 0 ? num(page.pageTimings?.onLoad) : null,
  }));
  return {
    count: rows.length,
    transferred,
    span: Number.isFinite(first) ? last - first : 0,
    firstStart: Number.isFinite(first) ? first : 0,
    errors,
    pages,
  };
}

/** Parses HAR JSON text. Throws a HarError with a message the user can act on. */
export function parseHar(text: string): ParsedHar {
  const source = text.replace(/^\uFEFF/, "").trim();
  if (!source) throw new HarError("The input is empty. Open a .har file or paste HAR JSON.");
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch (err) {
    throw new HarError(`The input is not valid JSON. ${(err as Error).message}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new HarError("The JSON is not a HAR file. A HAR file is an object with a log property.");
  }
  const log = (data as { log?: unknown }).log;
  if (typeof log !== "object" || log === null) {
    throw new HarError("The JSON is not a HAR file. The log object is missing.");
  }
  const entries = (log as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    throw new HarError("The JSON is not a HAR file. The log.entries array is missing.");
  }
  const har = data as Har;
  const rows: HarRow[] = [];
  entries.forEach((entry, i) => {
    if (typeof entry === "object" && entry !== null && typeof (entry as HarEntry).request === "object") rows.push(normalizeEntry(entry as HarEntry, i));
  });
  return { har, rows, summary: summarize(har, rows) };
}

/* ------------------------------------------------------------------ */
/* Filtering and sorting                                               */
/* ------------------------------------------------------------------ */

export interface HarFilter {
  text?: string;
  method?: string;
  status?: StatusClass | "";
  type?: ResourceType | "";
}

export function filterRows(rows: HarRow[], filter: HarFilter): HarRow[] {
  const text = filter.text?.trim().toLowerCase() ?? "";
  if (!text && !filter.method && !filter.status && !filter.type) return rows;
  return rows.filter(
    (row) =>
      (!filter.method || row.method === filter.method) &&
      (!filter.status || row.statusClass === filter.status) &&
      (!filter.type || row.type === filter.type) &&
      (!text || row.search.includes(text)),
  );
}

export type SortKey = "index" | "method" | "status" | "url" | "type" | "size" | "time" | "start";
export type SortDirection = "asc" | "desc";

const SORT_VALUE: Record<SortKey, (row: HarRow) => number | string> = {
  index: (row) => row.index,
  method: (row) => row.method,
  status: (row) => row.status,
  url: (row) => `${row.host}${row.path}`,
  type: (row) => row.mimeType || row.type,
  size: (row) => row.transferSize,
  time: (row) => row.time,
  start: (row) => (Number.isNaN(row.start) ? Infinity : row.start),
};

/** A sorted copy. Ties keep the HAR order. */
export function sortRows(rows: HarRow[], key: SortKey, direction: SortDirection): HarRow[] {
  const value = SORT_VALUE[key];
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return order * sign || a.index - b.index;
  });
}

/** The distinct request methods, for the method filter. */
export const methodsOf = (rows: HarRow[]) => Array.from(new Set(rows.map((row) => row.method))).sort();

/* ------------------------------------------------------------------ */
/* Detail panel                                                        */
/* ------------------------------------------------------------------ */

/** Query parameters from the HAR, or from the URL when the HAR leaves them out. */
export function queryParams(entry: HarEntry): HarNameValue[] {
  const request = entry.request ?? {};
  if (Array.isArray(request.queryString) && request.queryString.length) return request.queryString;
  try {
    return Array.from(new URL(String(request.url ?? "")).searchParams, ([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

const prettyJson = (text: string) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
};

export type RequestBody =
  | { kind: "none" }
  | { kind: "form"; mimeType: string; params: HarNameValue[] }
  | { kind: "text"; mimeType: string; text: string; json: boolean };

/** The request body: form fields as a list, JSON pretty-printed, other text as is. */
export function requestBody(entry: HarEntry): RequestBody {
  const post = entry.request?.postData;
  if (!post || typeof post !== "object") return { kind: "none" };
  const mimeType = String(post.mimeType ?? "");
  const text = typeof post.text === "string" ? post.text : "";
  if (Array.isArray(post.params) && post.params.length) {
    return { kind: "form", mimeType, params: post.params.filter((p) => p && typeof p === "object").map((p) => ({ name: p.name, value: p.fileName ? `(file) ${p.fileName}` : String(p.value ?? "") })) };
  }
  if (/x-www-form-urlencoded/i.test(mimeType) && text) {
    return { kind: "form", mimeType, params: Array.from(new URLSearchParams(text), ([name, value]) => ({ name, value })) };
  }
  if (!text) return { kind: "none" };
  const pretty = /json/i.test(mimeType) || /^\s*[[{]/.test(text) ? prettyJson(text) : null;
  return { kind: "text", mimeType, text: pretty ?? text, json: pretty !== null };
}

const isTextMime = (mime: string) =>
  /^text\/|json|javascript|ecmascript|xml|svg|x-www-form-urlencoded|graphql|csv|yaml|event-stream/i.test(mime);

export type ResponseBody =
  | { kind: "none" }
  | { kind: "image"; mimeType: string; dataUri: string; size: number }
  | { kind: "binary"; mimeType: string; size: number }
  | { kind: "text"; mimeType: string; text: string; json: boolean };

/** The response body, with Base64 decoded, JSON pretty-printed, and images ready to show. */
export function responseBody(entry: HarEntry): ResponseBody {
  const content = entry.response?.content;
  const raw = content?.text;
  if (typeof raw !== "string" || raw === "") return { kind: "none" };
  const mimeType = String(content?.mimeType ?? "").split(";")[0].trim().toLowerCase();
  const base64 = String(content?.encoding ?? "").toLowerCase() === "base64";
  if (base64 && mimeType.startsWith("image/")) {
    return { kind: "image", mimeType, dataUri: `data:${mimeType};base64,${raw.replace(/\s+/g, "")}`, size: num(content?.size, 0) };
  }
  let text = raw;
  if (base64) {
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(raw);
    } catch {
      return { kind: "binary", mimeType, size: num(content?.size, 0) };
    }
    if (mimeType && !isTextMime(mimeType)) return { kind: "binary", mimeType, size: bytes.length };
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return { kind: "binary", mimeType, size: bytes.length };
    }
  }
  const pretty = /json/.test(mimeType) || /^\s*[[{]/.test(text) ? prettyJson(text) : null;
  return { kind: "text", mimeType, text: pretty ?? text, json: pretty !== null };
}

export const TIMING_PHASES = [
  { key: "blocked", label: "Blocked" },
  { key: "dns", label: "DNS lookup" },
  { key: "connect", label: "Connect" },
  { key: "ssl", label: "TLS" },
  { key: "send", label: "Send" },
  { key: "wait", label: "Wait (TTFB)" },
  { key: "receive", label: "Receive" },
] as const;

export type TimingKey = (typeof TIMING_PHASES)[number]["key"];

/**
 * The timing phases in order. A phase is null when the HAR marks it as not applicable (-1).
 * HAR counts ssl inside connect, so the bar sizes leave ssl out of the sum.
 */
export function timingBreakdown(timings: HarTimings | undefined) {
  return TIMING_PHASES.map(({ key, label }) => {
    const value = num(timings?.[key]);
    return { key, label, ms: value >= 0 ? value : null };
  });
}

/* ------------------------------------------------------------------ */
/* cURL                                                                */
/* ------------------------------------------------------------------ */

/** Quotes a word for a POSIX shell. */
export function shellQuote(value: string): string {
  if (/^[\w@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// curl sets these itself, and HTTP/2 pseudo-headers are not real headers.
const CURL_SKIPPED_HEADERS = new Set(["content-length", "host", "connection"]);

/** The request as a curl command, one option per line. */
export function toCurl(entry: HarEntry): string {
  const request = entry.request ?? {};
  const method = String(request.method ?? "GET").toUpperCase();
  const headers = (Array.isArray(request.headers) ? request.headers : []).filter((h) => h && typeof h.name === "string" && h.name && !h.name.startsWith(":") && !CURL_SKIPPED_HEADERS.has(h.name.toLowerCase()));
  const post = request.postData;
  let body: string | null = null;
  if (typeof post?.text === "string" && post.text !== "") body = post.text;
  else if (post?.params?.length && !/multipart/i.test(String(post.mimeType ?? ""))) {
    body = new URLSearchParams(post.params.map((p) => [p.name, String(p.value ?? "")])).toString();
  }

  const parts = [`curl ${shellQuote(String(request.url ?? ""))}`];
  if (method === "HEAD") parts.push("--head");
  else if (!(method === "GET" && body === null) && !(method === "POST" && body !== null)) parts.push(`-X ${shellQuote(method)}`);
  for (const header of headers) parts.push(`-H ${shellQuote(`${header.name}: ${header.value ?? ""}`)}`);
  const hasCookieHeader = headers.some((h) => h.name.toLowerCase() === "cookie");
  if (!hasCookieHeader && Array.isArray(request.cookies) && request.cookies.length) {
    parts.push(`-b ${shellQuote(request.cookies.map((c) => `${c.name}=${c.value}`).join("; "))}`);
  }
  if (post?.params?.length && /multipart/i.test(String(post.mimeType ?? "")) && body === null) {
    for (const p of post.params) parts.push(`-F ${shellQuote(p.fileName ? `${p.name}=@${p.fileName}` : `${p.name}=${p.value ?? ""}`)}`);
  }
  if (body !== null) parts.push(`--data-raw ${shellQuote(body)}`);
  const encoding = headers.find((h) => h.name.toLowerCase() === "accept-encoding")?.value ?? "";
  if (/gzip|deflate|br|zstd/i.test(encoding)) parts.push("--compressed");
  return parts.join(" \\\n  ");
}

/** The response body as text to copy: decoded text, or the Base64 for binary data. */
export function responseBodyText(entry: HarEntry): string {
  const body = responseBody(entry);
  if (body.kind === "text") return body.text;
  return body.kind === "none" ? "" : String(entry.response?.content?.text ?? "");
}

/* ------------------------------------------------------------------ */
/* Sanitizing                                                          */
/* ------------------------------------------------------------------ */

export const REDACTED = "[REDACTED]";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "apikey",
  "x-auth-token",
  "x-access-token",
  "x-refresh-token",
  "x-csrf-token",
  "x-xsrf-token",
  "x-amz-security-token",
  "x-goog-api-key",
  "x-session-id",
]);

const SENSITIVE_NAME = /(token|secret|passw(or)?d|api[-_]?key|auth(?!or)|session|signature|credential|^sig$|^code$|^key$)/i;

/** True for headers that carry credentials. CORS headers only name other headers, so they stay. */
export const isSensitiveHeader = (name: string) =>
  SENSITIVE_HEADERS.has(name.toLowerCase()) || (SENSITIVE_NAME.test(name) && !/^access-control-/i.test(name));

/** Key and credential detectors from the secret redactor. Personal data detectors stay off, so URLs and IDs in bodies stay readable. */
const BODY_DETECTORS: Partial<DetectorSettings> = { email: false, "ip-address": false, "credit-card": false, ssn: false, phone: false, "high-entropy": false };

export interface SanitizeOptions {
  /** Remove every response body. */
  removeResponseBodies?: boolean;
}

export interface SanitizeResult {
  har: Har;
  /** The number of values replaced or removed. */
  redacted: number;
}

/** A copy of the HAR with credentials, cookies, and secret values replaced, safe to share. */
export function sanitizeHar(har: Har, options: SanitizeOptions = {}): SanitizeResult {
  const copy = JSON.parse(JSON.stringify(har)) as Har;
  let redacted = 0;

  const list = (pairs: unknown) => (Array.isArray(pairs) ? (pairs as unknown[]).filter((p): p is HarNameValue => typeof p === "object" && p !== null) : []);
  const redactPairs = (pairs: unknown, all: boolean, count = true) => {
    for (const pair of list(pairs)) {
      if ((all || SENSITIVE_NAME.test(pair.name)) && pair.value !== REDACTED && pair.value !== "") {
        pair.value = REDACTED;
        if (count) redacted++;
      }
    }
  };
  const redactHeaders = (headers: unknown) => {
    for (const header of list(headers)) {
      if (typeof header.name !== "string") continue;
      if (isSensitiveHeader(header.name)) {
        if (header.value !== REDACTED) {
          header.value = REDACTED;
          redacted++;
        }
      } else if (typeof header.value === "string") {
        // Location, Referer, and similar headers can carry tokens in a URL
        header.value = redactUrl(header.value);
      }
    }
  };
  const redactBody = (text: string) => {
    const result = redactText(text, { detectors: BODY_DETECTORS });
    redacted += result.total;
    return result.output;
  };
  // Absolute URLs, and relative ones such as a Location of /callback?code=abc
  const redactUrl = (url: string) => {
    const relative = /^[/?]/.test(url) && !url.startsWith("//");
    if (!relative && !/^[a-z][a-z\d+.-]*:\/\//i.test(url)) return url;
    try {
      const parsed = new URL(url, "https://relative.invalid");
      let changed = false;
      if (parsed.username || parsed.password) {
        parsed.username = "";
        parsed.password = "";
        changed = true;
        redacted++;
      }
      for (const [name, value] of Array.from(parsed.searchParams)) {
        if (SENSITIVE_NAME.test(name) && value) {
          parsed.searchParams.set(name, REDACTED);
          changed = true;
          redacted++;
        }
      }
      if (!changed) return url;
      return relative ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.toString();
    } catch {
      return url;
    }
  };

  for (const page of list(copy.log.pages) as HarPage[]) {
    if (typeof page.title === "string") page.title = redactUrl(page.title);
  }
  for (const entry of Array.isArray(copy.log.entries) ? copy.log.entries : []) {
    // parseHar skips entries that are not objects. Keep them as they are.
    if (typeof entry !== "object" || entry === null) continue;
    const request = typeof entry.request === "object" && entry.request !== null ? entry.request : null;
    const response = typeof entry.response === "object" && entry.response !== null ? entry.response : null;
    if (request) {
      if (request.url) request.url = redactUrl(String(request.url));
      redactHeaders(request.headers);
      redactPairs(request.cookies, true);
      // The URL pass above already counted these values.
      redactPairs(request.queryString, false, false);
      const post = request.postData;
      if (post && typeof post === "object") {
        redactPairs(post.params, false);
        if (typeof post.text === "string" && post.text) {
          if (/x-www-form-urlencoded/i.test(String(post.mimeType ?? ""))) {
            const form = new URLSearchParams(post.text);
            let changed = false;
            for (const [name, value] of Array.from(form)) {
              if (SENSITIVE_NAME.test(name) && value) {
                form.set(name, REDACTED);
                changed = true;
                redacted++;
              }
            }
            if (changed) post.text = form.toString();
          }
          post.text = redactBody(post.text);
        }
      }
    }
    if (response) {
      redactHeaders(response.headers);
      redactPairs(response.cookies, true);
      if (typeof response.redirectURL === "string" && response.redirectURL) response.redirectURL = redactUrl(response.redirectURL);
      const content = response.content;
      if (content && typeof content === "object" && typeof content.text === "string" && content.text) {
        if (options.removeResponseBodies) {
          delete content.text;
          delete content.encoding;
          content.comment = "Response body removed when the HAR was sanitized.";
          redacted++;
        } else if (String(content.encoding ?? "").toLowerCase() !== "base64") {
          content.text = redactBody(content.text);
        }
      }
    }
  }
  return { har: copy, redacted };
}
