/**
 * Converts a curl command into equivalent code for common HTTP clients.
 * The shell tokenizer and the flag parser are written for this tool, so the
 * result is predictable and runs offline.
 */

export class CurlParseError extends Error {
  constructor(
    message: string,
    /** 1-based line and column of the problem in the input. */
    public line: number,
    public column: number,
  ) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = "CurlParseError";
  }
}

const position = (input: string, index: number) => {
  const before = input.slice(0, index).split("\n");
  return { line: before.length, column: before[before.length - 1].length + 1 };
};

const fail = (input: string, index: number, message: string): never => {
  const { line, column } = position(input, index);
  throw new CurlParseError(message, line, column);
};

export interface TokenizeResult {
  tokens: string[];
  /** Text after an unquoted |, ;, &&, or > that the tokenizer did not read. */
  rest: string;
}

const ANSI_SIMPLE: Record<string, string> = {
  a: "\x07",
  b: "\b",
  e: "\x1b",
  E: "\x1b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
  "\\": "\\",
  "'": "'",
  '"': '"',
  "?": "?",
};

/** Reads a $'...' ANSI-C string that starts at `start` (the $). Returns the value and the index after the closing quote. */
function readAnsiC(input: string, start: number): [string, number] {
  let value = "";
  let i = start + 2;
  while (i < input.length) {
    const ch = input[i];
    if (ch === "'") return [value, i + 1];
    if (ch !== "\\") {
      value += ch;
      i += 1;
      continue;
    }
    const next = input[i + 1];
    if (next === undefined) break;
    if (next in ANSI_SIMPLE) {
      value += ANSI_SIMPLE[next];
      i += 2;
    } else if (next === "x" || next === "u" || next === "U") {
      const max = next === "x" ? 2 : next === "u" ? 4 : 8;
      const hex = /^[0-9a-fA-F]+/.exec(input.slice(i + 2, i + 2 + max))?.[0] ?? "";
      if (!hex) {
        value += `\\${next}`;
        i += 2;
      } else {
        value += String.fromCodePoint(parseInt(hex, 16));
        i += 2 + hex.length;
      }
    } else if (/[0-7]/.test(next)) {
      const octal = /^[0-7]{1,3}/.exec(input.slice(i + 1, i + 4))![0];
      value += String.fromCharCode(parseInt(octal, 8));
      i += 1 + octal.length;
    } else if (next === "c" && input[i + 2]) {
      value += String.fromCharCode(input[i + 2].charCodeAt(0) & 0x1f);
      i += 3;
    } else {
      value += `\\${next}`;
      i += 2;
    }
  }
  return fail(input, start, "Unterminated $'…' string");
}

/** Splits a POSIX shell command into words: quotes, $'…', backslash escapes, and line continuations. */
export function tokenizePosix(input: string): TokenizeResult {
  const tokens: string[] = [];
  let current = "";
  let inWord = false;
  let i = 0;
  const end = () => {
    if (inWord) tokens.push(current);
    current = "";
    inWord = false;
  };

  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      end();
      i += 1;
    } else if (ch === "\\") {
      const next = input[i + 1];
      if (next === "\n") i += 2;
      else if (next === "\r" && input[i + 2] === "\n") i += 3;
      else if (next === undefined) i += 1;
      else {
        current += next;
        inWord = true;
        i += 2;
      }
    } else if (ch === "'") {
      const close = input.indexOf("'", i + 1);
      if (close < 0) fail(input, i, "Unterminated single quote");
      current += input.slice(i + 1, close);
      inWord = true;
      i = close + 1;
    } else if (ch === "$" && input[i + 1] === "'") {
      const [value, next] = readAnsiC(input, i);
      current += value;
      inWord = true;
      i = next;
    } else if (ch === '"' || (ch === "$" && input[i + 1] === '"')) {
      const start = i;
      i += ch === "$" ? 2 : 1;
      inWord = true;
      let closed = false;
      while (i < input.length) {
        const c = input[i];
        if (c === '"') {
          closed = true;
          i += 1;
          break;
        }
        if (c === "\\") {
          const next = input[i + 1];
          if (next === "\n") {
            i += 2;
            continue;
          }
          if (next === "$" || next === "`" || next === '"' || next === "\\") {
            current += next;
            i += 2;
            continue;
          }
        }
        current += c;
        i += 1;
      }
      if (!closed) fail(input, start, "Unterminated double quote");
    } else if (ch === "#" && !inWord) {
      const newline = input.indexOf("\n", i);
      i = newline < 0 ? input.length : newline;
    } else if (ch === "|" || ch === ";" || ch === ">" || (ch === "&" && input[i + 1] === "&")) {
      end();
      return { tokens, rest: input.slice(i).trim() };
    } else {
      current += ch;
      inWord = true;
      i += 1;
    }
  }
  end();
  return { tokens, rest: "" };
}

/**
 * Splits a Windows cmd command, as written by "Copy as cURL (cmd)": ^ escapes the
 * next character, ^ at a line end continues the line, and double quotes group
 * words with \" for a literal quote.
 */
export function tokenizeCmd(input: string): TokenizeResult {
  // The cmd layer: remove carets. "^\n" continues a line, "^X" is a literal X.
  let unescaped = "";
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch !== "^") {
      unescaped += ch;
      continue;
    }
    const next = input[i + 1];
    if (next === "\r" && input[i + 2] === "\n") i += 2;
    else if (next === "\n") i += 1;
    else if (next !== undefined) {
      unescaped += next;
      i += 1;
    }
  }

  // The program layer: Windows command-line argument rules.
  const tokens: string[] = [];
  let current = "";
  let inWord = false;
  let quoted = false;
  let quoteStart = 0;
  for (let i = 0; i < unescaped.length; i += 1) {
    const ch = unescaped[i];
    if (ch === "\\" && (unescaped[i + 1] === '"' || unescaped[i + 1] === "\\")) {
      current += unescaped[i + 1];
      inWord = true;
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
      quoteStart = i;
      inWord = true;
    } else if (!quoted && (ch === " " || ch === "\t" || ch === "\n" || ch === "\r")) {
      if (inWord) tokens.push(current);
      current = "";
      inWord = false;
    } else {
      current += ch;
      inWord = true;
    }
  }
  if (quoted) fail(unescaped, quoteStart, "Unterminated double quote");
  if (inWord) tokens.push(current);
  return { tokens, rest: "" };
}

/** True when the command looks like "Copy as cURL (cmd)" output. */
export const isCmdSyntax = (input: string) => /(^|\s)\^\r?\n/.test(input) || /^\s*curl(\.exe)?\s+\^"/.test(input);

export function tokenize(input: string): TokenizeResult {
  return isCmdSyntax(input) ? tokenizeCmd(input) : tokenizePosix(input);
}

/* ------------------------------------------------------------------ */
/* Flag parsing                                                        */
/* ------------------------------------------------------------------ */

export type FormField = { name: string; value: string } | { name: string; file: string; contentType?: string; filename?: string };

export type CurlBody =
  | { kind: "json"; text: string; value: unknown }
  | { kind: "urlencoded"; text: string }
  | { kind: "raw"; text: string }
  | { kind: "multipart"; fields: FormField[] };

export interface CurlRequest {
  method: string;
  url: string;
  /** Header name and value pairs in command order, with -A, -e, -b, and inferred Content-Type folded in. */
  headers: [string, string][];
  body: CurlBody | null;
  auth: { user: string; password: string } | null;
  followRedirects: boolean;
  insecure: boolean;
  compressed: boolean;
  http2: boolean;
  /** Seconds, from -m/--max-time. */
  timeout: number | null;
  /** Things the code cannot reproduce exactly, such as @file data. */
  notes: string[];
  ignoredFlags: string[];
  unknownFlags: string[];
}

type FlagKind = "value" | "bool";

const SHORT: Record<string, string> = {
  X: "request",
  H: "header",
  d: "data",
  F: "form",
  u: "user",
  b: "cookie",
  A: "user-agent",
  e: "referer",
  G: "get",
  L: "location",
  k: "insecure",
  I: "head",
  m: "max-time",
  s: "silent",
  S: "show-error",
  v: "verbose",
  i: "include",
  o: "output",
  O: "remote-name",
  J: "remote-header-name",
  w: "write-out",
  c: "cookie-jar",
  x: "proxy",
  U: "proxy-user",
  T: "upload-file",
  E: "cert",
  f: "fail",
  N: "no-buffer",
  g: "globoff",
  K: "config",
  D: "dump-header",
  r: "range",
  z: "time-cond",
  n: "netrc",
  q: "disable",
  Z: "parallel",
  "#": "progress-bar",
  "0": "http1.0",
  "1": "tlsv1",
  "2": "sslv2",
  "3": "sslv3",
  "4": "ipv4",
  "6": "ipv6",
};

const HANDLED: Record<string, FlagKind> = {
  url: "value",
  request: "value",
  header: "value",
  data: "value",
  "data-ascii": "value",
  "data-raw": "value",
  "data-binary": "value",
  "data-urlencode": "value",
  json: "value",
  form: "value",
  "form-string": "value",
  user: "value",
  cookie: "value",
  "user-agent": "value",
  referer: "value",
  "oauth2-bearer": "value",
  "max-time": "value",
  get: "bool",
  location: "bool",
  "location-trusted": "bool",
  insecure: "bool",
  compressed: "bool",
  head: "bool",
  http2: "bool",
  "http2-prior-knowledge": "bool",
};

/** Flags that do not change the request. They are skipped and listed in a note. */
const IGNORED: Record<string, FlagKind> = {
  silent: "bool",
  "show-error": "bool",
  verbose: "bool",
  include: "bool",
  output: "value",
  "remote-name": "bool",
  "remote-header-name": "bool",
  "write-out": "value",
  "cookie-jar": "value",
  fail: "bool",
  "fail-with-body": "bool",
  "no-buffer": "bool",
  globoff: "bool",
  "progress-bar": "bool",
  "no-progress-meter": "bool",
  "dump-header": "value",
  "create-dirs": "bool",
  "retry": "value",
  "retry-delay": "value",
  "retry-max-time": "value",
  "retry-all-errors": "bool",
  "max-redirs": "value",
  "connect-timeout": "value",
  "http1.0": "bool",
  "http1.1": "bool",
  tlsv1: "bool",
  "tlsv1.0": "bool",
  "tlsv1.1": "bool",
  "tlsv1.2": "bool",
  "tlsv1.3": "bool",
  sslv2: "bool",
  sslv3: "bool",
  ipv4: "bool",
  ipv6: "bool",
  "path-as-is": "bool",
  "tr-encoding": "bool",
  "no-keepalive": "bool",
  "keepalive-time": "value",
  parallel: "bool",
  disable: "bool",
  stderr: "value",
  trace: "value",
  "trace-ascii": "value",
  "trace-time": "bool",
  "limit-rate": "value",
  "ssl-reqd": "bool",
  raw: "bool",
};

/** Flags that change the request in ways the generated code does not reproduce. */
const UNSUPPORTED: Record<string, FlagKind> = {
  proxy: "value",
  "proxy-user": "value",
  "upload-file": "value",
  cert: "value",
  key: "value",
  cacert: "value",
  capath: "value",
  "cert-type": "value",
  "key-type": "value",
  pass: "value",
  config: "value",
  range: "value",
  "time-cond": "value",
  netrc: "bool",
  "netrc-file": "value",
  resolve: "value",
  "connect-to": "value",
  interface: "value",
  "unix-socket": "value",
  "abstract-unix-socket": "value",
  "aws-sigv4": "value",
  digest: "bool",
  ntlm: "bool",
  negotiate: "bool",
  anyauth: "bool",
  basic: "bool",
  "request-target": "value",
};

const flagKind = (name: string): FlagKind | null => HANDLED[name] ?? IGNORED[name] ?? UNSUPPORTED[name] ?? null;

/** Percent-encodes like curl's --data-urlencode: everything except unreserved characters. */
const curlEncode = (text: string) =>
  encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const filePlaceholder = (file: string) => `<contents of ${file}>`;

const hasHeader = (headers: [string, string][], name: string) => headers.some(([n]) => n.toLowerCase() === name.toLowerCase());

/** Parses a curl command into a request. Throws CurlParseError for syntax problems. */
export function parseCurl(input: string): CurlRequest {
  const trimmed = input.trim().replace(/^\$\s+/, "");
  const { tokens, rest } = tokenize(trimmed);
  if (tokens.length === 0) fail(input, 0, "Paste a curl command");
  if (!/^curl(\.exe)?$/i.test(tokens[0])) fail(input, 0, "The command must start with curl");

  const notes: string[] = [];
  const ignoredFlags: string[] = [];
  const unknownFlags: string[] = [];
  const unsupportedFlags: string[] = [];
  const headers: [string, string][] = [];
  const data: { text: string; kind: "data" | "json" }[] = [];
  const form: FormField[] = [];
  const cookies: string[] = [];
  const urls: string[] = [];
  let method = "";
  let auth: CurlRequest["auth"] = null;
  let userAgent: string | null = null;
  let referer: string | null = null;
  let get = false;
  let head = false;
  let followRedirects = false;
  let insecure = false;
  let compressed = false;
  let http2 = false;
  let timeout: number | null = null;
  let usedJson = false;

  const addData = (flag: string, value: string) => {
    if (flag === "data-raw") {
      data.push({ text: value, kind: "data" });
      return;
    }
    if (flag === "json") {
      usedJson = true;
      if (value.startsWith("@")) {
        notes.push(`--json ${value}: reading data from a file is not supported. The body has a placeholder.`);
        data.push({ text: filePlaceholder(value.slice(1)), kind: "json" });
      } else data.push({ text: value, kind: "json" });
      return;
    }
    if (flag === "data-urlencode") {
      const at = value.indexOf("@");
      const eq = value.indexOf("=");
      if (at >= 0 && (eq < 0 || at < eq)) {
        const name = value.slice(0, at);
        notes.push(`--data-urlencode ${value}: reading data from a file is not supported. The body has a placeholder.`);
        data.push({ text: `${name ? `${name}=` : ""}${filePlaceholder(value.slice(at + 1))}`, kind: "data" });
      } else if (eq < 0) data.push({ text: curlEncode(value), kind: "data" });
      else {
        const name = value.slice(0, eq);
        const content = curlEncode(value.slice(eq + 1));
        data.push({ text: name ? `${name}=${content}` : content, kind: "data" });
      }
      return;
    }
    if (value.startsWith("@")) {
      notes.push(`--${flag} ${value}: reading data from a file is not supported. The body has a placeholder.`);
      data.push({ text: filePlaceholder(value.slice(1)), kind: "data" });
      return;
    }
    data.push({ text: value, kind: "data" });
  };

  const addForm = (flag: string, value: string) => {
    const eq = value.indexOf("=");
    if (eq < 0) {
      notes.push(`--${flag} ${value}: expected name=value. The field is skipped.`);
      return;
    }
    const name = value.slice(0, eq);
    const content = value.slice(eq + 1);
    if (flag === "form" && (content.startsWith("@") || content.startsWith("<"))) {
      const params = content.slice(1).split(";");
      const file = params[0];
      const contentType = params.find((p) => p.startsWith("type="))?.slice(5);
      const filename = params.find((p) => p.startsWith("filename="))?.slice(9);
      if (content.startsWith("<")) {
        notes.push(`-F ${value}: field contents from a file are not supported. The field has a placeholder.`);
        form.push({ name, value: filePlaceholder(file) });
      } else form.push({ name, file, contentType, filename });
      return;
    }
    // Strip ;type= from plain fields as curl does
    const plain = flag === "form" ? content.replace(/;type=[^;]*$/, "") : content;
    form.push({ name, value: plain });
  };

  const apply = (name: string, value: string) => {
    switch (name) {
      case "url":
        urls.push(value);
        break;
      case "request":
        method = value.toUpperCase();
        break;
      case "header": {
        if (value.startsWith("@")) {
          notes.push(`-H ${value}: reading headers from a file is not supported.`);
          break;
        }
        const colon = value.indexOf(":");
        if (colon < 0) {
          if (value.endsWith(";")) headers.push([value.slice(0, -1).trim(), ""]);
          else notes.push(`-H ${value}: not a "Name: value" header. It is skipped.`);
          break;
        }
        const headerName = value.slice(0, colon).trim();
        const headerValue = value.slice(colon + 1).trim();
        if (!headerValue) {
          notes.push(`-H "${headerName}:" removes a default curl header. It is skipped.`);
          break;
        }
        headers.push([headerName, headerValue]);
        break;
      }
      case "data":
      case "data-ascii":
      case "data-raw":
      case "data-binary":
      case "data-urlencode":
      case "json":
        addData(name, value);
        break;
      case "form":
      case "form-string":
        addForm(name, value);
        break;
      case "user": {
        const colon = value.indexOf(":");
        if (colon < 0) notes.push("-u has no password. curl would ask for one. The code uses an empty password.");
        auth = colon < 0 ? { user: value, password: "" } : { user: value.slice(0, colon), password: value.slice(colon + 1) };
        break;
      }
      case "cookie":
        if (value.includes("=")) cookies.push(value);
        else notes.push(`-b ${value}: reading cookies from a file is not supported.`);
        break;
      case "user-agent":
        userAgent = value;
        break;
      case "referer":
        referer = value.replace(/;auto$/, "");
        break;
      case "oauth2-bearer":
        headers.push(["Authorization", `Bearer ${value}`]);
        break;
      case "max-time": {
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds > 0) timeout = seconds;
        else notes.push(`-m ${value}: not a number of seconds. It is skipped.`);
        break;
      }
      case "get":
        get = true;
        break;
      case "head":
        head = true;
        break;
      case "location":
      case "location-trusted":
        followRedirects = true;
        break;
      case "insecure":
        insecure = true;
        break;
      case "compressed":
        compressed = true;
        break;
      case "http2":
      case "http2-prior-knowledge":
        http2 = true;
        break;
    }
  };

  let i = 1;
  let endOfOptions = false;
  while (i < tokens.length) {
    const token = tokens[i];
    i += 1;
    if (endOfOptions || !token.startsWith("-") || token === "-") {
      urls.push(token);
      continue;
    }
    if (token === "--") {
      endOfOptions = true;
      continue;
    }
    const takeValue = (flag: string, inline?: string) => {
      if (inline !== undefined && inline !== "") return inline;
      if (i >= tokens.length) fail(input, input.length, `${flag} needs a value`);
      i += 1;
      return tokens[i - 1];
    };
    const record = (name: string, display: string, value?: string) => {
      if (name in HANDLED) apply(name, value ?? "");
      else if (name in IGNORED) ignoredFlags.push(display);
      else unsupportedFlags.push(display);
    };

    if (token.startsWith("--")) {
      const name = token.slice(2);
      // curl accepts --no-<flag> to turn a boolean off. Treat it as ignored.
      if (name.startsWith("no-") && flagKind(name.slice(3)) === "bool") {
        ignoredFlags.push(token);
        continue;
      }
      const kind = flagKind(name);
      if (!kind) {
        unknownFlags.push(token);
        continue;
      }
      record(name, token, kind === "value" ? takeValue(token) : undefined);
      continue;
    }

    // A cluster of short flags such as -sSL, or a short flag with its value attached, such as -XPOST
    for (let j = 1; j < token.length; j += 1) {
      const letter = token[j];
      const name = SHORT[letter];
      if (!name) {
        unknownFlags.push(`-${letter}`);
        continue;
      }
      const kind = flagKind(name) ?? "bool";
      if (kind === "value") {
        record(name, `-${letter}`, takeValue(`-${letter}`, token.slice(j + 1)));
        break;
      }
      record(name, `-${letter}`);
    }
  }

  if (urls.length === 0) fail(input, input.length, "The command has no URL");
  let url = urls[0];
  if (urls.length > 1) notes.push(`Only the first URL is converted. Ignored: ${urls.slice(1).join(", ")}`);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = `http://${url}`;
    notes.push("The URL has no scheme. curl uses http://, so the code does too.");
  }

  if (userAgent !== null && !hasHeader(headers, "User-Agent")) headers.push(["User-Agent", userAgent]);
  if (referer !== null && !hasHeader(headers, "Referer")) headers.push(["Referer", referer]);
  if (cookies.length && !hasHeader(headers, "Cookie")) headers.push(["Cookie", cookies.join("; ")]);

  let body: CurlBody | null = null;
  if (data.length && form.length) notes.push("-d and -F cannot be used together. The form fields are used.");

  if (form.length) {
    body = { kind: "multipart", fields: form };
    // Each library writes its own boundary, so a hand-written multipart Content-Type would break the body
    const index = headers.findIndex(([n, v]) => n.toLowerCase() === "content-type" && /multipart\/form-data/i.test(v));
    if (index >= 0) headers.splice(index, 1);
  } else if (data.length) {
    const joined = usedJson
      ? data.map((d) => d.text).join(data.every((d) => d.kind === "json") ? "" : "&")
      : data.map((d) => d.text).join("&");
    if (get) {
      url += (url.includes("?") ? "&" : "?") + joined;
    } else {
      if (usedJson) {
        if (!hasHeader(headers, "Content-Type")) headers.push(["Content-Type", "application/json"]);
        if (!hasHeader(headers, "Accept")) headers.push(["Accept", "application/json"]);
      } else if (!hasHeader(headers, "Content-Type")) {
        headers.push(["Content-Type", "application/x-www-form-urlencoded"]);
      }
      body = classifyBody(joined, headerValue(headers, "Content-Type") ?? "");
    }
  }

  if (!method) {
    if (head) method = "HEAD";
    else if (get) method = "GET";
    else if (body) method = "POST";
    else method = "GET";
  }

  if (unsupportedFlags.length) notes.push(`Not converted: ${unsupportedFlags.join(", ")}`);
  if (rest) notes.push(`Ignored the shell text after the command: ${rest}`);

  return {
    method,
    url,
    headers,
    body,
    auth,
    followRedirects,
    insecure,
    compressed,
    http2,
    timeout,
    notes,
    ignoredFlags,
    unknownFlags,
  };
}

const headerValue = (headers: [string, string][], name: string) =>
  headers.find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1];

function classifyBody(text: string, contentType: string): CurlBody {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { kind: "json", text, value: JSON.parse(trimmed) };
    } catch {
      /* Not JSON. Fall through. */
    }
  }
  if (/application\/x-www-form-urlencoded/i.test(contentType)) return { kind: "urlencoded", text };
  return { kind: "raw", text };
}

/** A short description of the body for the status bar. */
export function describeBody(body: CurlBody | null): string {
  if (!body) return "No body";
  switch (body.kind) {
    case "json":
      return "JSON body";
    case "urlencoded":
      return "Form body (urlencoded)";
    case "multipart":
      return `Multipart form (${body.fields.length} ${body.fields.length === 1 ? "field" : "fields"})`;
    default:
      return "Raw body";
  }
}

/* ------------------------------------------------------------------ */
/* Code generation                                                     */
/* ------------------------------------------------------------------ */

export type CodeTarget = "javascript" | "node" | "python" | "go" | "php" | "rust" | "httpie";

export interface GenerateOptions {
  /** Rust only: async reqwest with Tokio instead of the blocking client. */
  rustAsync?: boolean;
}

const pretty = (value: unknown, indent = 2) => JSON.stringify(value, null, indent);

/** A double-quoted string literal that JavaScript, Python, and Go all accept. */
const quote = (text: string) => JSON.stringify(text);

/** Joins duplicate headers, since most clients take a map. Cookies join with "; ". */
function mergeHeaders(headers: [string, string][]): [string, string][] {
  const merged = new Map<string, [string, string]>();
  for (const [name, value] of headers) {
    const key = name.toLowerCase();
    const existing = merged.get(key);
    if (existing) existing[1] = `${existing[1]}${key === "cookie" ? "; " : ", "}${value}`;
    else merged.set(key, [name, value]);
  }
  return [...merged.values()];
}

const indentLines = (text: string, spaces: string) => text.split("\n").join(`\n${spaces}`);

const jsKey = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : quote(name));

function generateJavaScript(req: CurlRequest, node: boolean): string {
  const lines: string[] = [];
  const headers = mergeHeaders(req.headers);
  const options: string[] = [];
  const needsFs = node && req.body?.kind === "multipart" && req.body.fields.some((f) => "file" in f);

  if (needsFs) lines.push('import { readFile } from "node:fs/promises";', "");
  if (req.insecure) {
    lines.push(
      node
        ? "// curl -k: Node's fetch has no per-request option to skip TLS checks. Set NODE_TLS_REJECT_UNAUTHORIZED=0 only for local testing."
        : "// curl -k: browsers cannot skip TLS certificate checks.",
    );
  }

  if (req.body?.kind === "multipart") {
    lines.push("const form = new FormData();");
    for (const field of req.body.fields) {
      if ("file" in field) {
        const type = field.contentType ? `, { type: ${quote(field.contentType)} }` : "";
        const blob = node
          ? `new Blob([await readFile(${quote(field.file)})]${type})`
          : `new Blob([/* contents of ${field.file.replace(/\*\//g, "* /")} */]${type})`;
        lines.push(`form.append(${quote(field.name)}, ${blob}, ${quote(field.filename ?? field.file.split(/[\\/]/).pop() ?? field.file)});`);
      } else lines.push(`form.append(${quote(field.name)}, ${quote(field.value)});`);
    }
    lines.push("");
  }

  if (req.method !== "GET") options.push(`method: ${quote(req.method)},`);
  if (headers.length || req.auth) {
    const entries = headers.map(([n, v]) => `    ${jsKey(n)}: ${quote(v)},`);
    if (req.auth) entries.push(`    Authorization: "Basic " + btoa(${quote(`${req.auth.user}:${req.auth.password}`)}),`);
    options.push(`headers: {\n${entries.join("\n")}\n  },`);
  }
  if (req.body) {
    if (req.body.kind === "multipart") options.push("body: form,");
    else if (req.body.kind === "json") options.push(`body: JSON.stringify(${indentLines(pretty(req.body.value), "  ")}),`);
    else options.push(`body: ${quote(req.body.text)},`);
  }
  if (req.timeout) options.push(`signal: AbortSignal.timeout(${Math.round(req.timeout * 1000)}),`);

  const call = options.length
    ? `const response = await fetch(${quote(req.url)}, {\n${options.map((o) => `  ${o}`).join("\n")}\n});`
    : `const response = await fetch(${quote(req.url)});`;
  lines.push(call, "");
  lines.push(req.method === "HEAD" ? "console.log(response.status, Object.fromEntries(response.headers));" : "console.log(response.status, await response.text());");
  return lines.join("\n");
}

/** Converts a parsed JSON value into a Python literal. */
function pythonLiteral(value: unknown, depth = 0): string {
  const pad = "    ".repeat(depth + 1);
  const close = "    ".repeat(depth);
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((v) => `${pad}${pythonLiteral(v, depth + 1)},`).join("\n")}\n${close}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return "{}";
  return `{\n${entries.map(([k, v]) => `${pad}${quote(k)}: ${pythonLiteral(v, depth + 1)},`).join("\n")}\n${close}}`;
}

const PYTHON_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function generatePython(req: CurlRequest): string {
  const lines = ["import requests", ""];
  const headers = mergeHeaders(req.headers);
  const args: string[] = [];
  const contentType = headerValue(headers, "Content-Type") ?? "";

  lines.push(`url = ${quote(req.url)}`);
  if (headers.length) {
    lines.push("headers = {", ...headers.map(([n, v]) => `    ${quote(n)}: ${quote(v)},`), "}");
    args.push("headers=headers");
  }
  if (req.body?.kind === "json" && /json/i.test(contentType)) {
    lines.push(`payload = ${pythonLiteral(req.body.value)}`);
    args.push("json=payload");
  } else if (req.body?.kind === "json") {
    lines.push(`data = ${quote(pretty(req.body.value))}`);
    args.push("data=data");
  } else if (req.body?.kind === "multipart") {
    const fields = req.body.fields.filter((f): f is { name: string; value: string } => "value" in f);
    const files = req.body.fields.filter((f) => "file" in f) as Extract<FormField, { file: string }>[];
    if (fields.length) {
      lines.push("data = {", ...fields.map((f) => `    ${quote(f.name)}: ${quote(f.value)},`), "}");
      args.push("data=data");
    }
    if (files.length) {
      lines.push(
        "files = {",
        ...files.map((f) => {
          const filename = quote(f.filename ?? f.file.split(/[\\/]/).pop() ?? f.file);
          const type = f.contentType ? `, ${quote(f.contentType)}` : "";
          return `    ${quote(f.name)}: (${filename}, open(${quote(f.file)}, "rb")${type}),`;
        }),
        "}",
      );
      args.push("files=files");
    }
  } else if (req.body) {
    lines.push(`data = ${quote(req.body.text)}`);
    args.push("data=data");
  }
  if (req.auth) args.push(`auth=(${quote(req.auth.user)}, ${quote(req.auth.password)})`);
  if (req.timeout) args.push(`timeout=${req.timeout}`);
  if (req.insecure) args.push("verify=False");
  if (req.followRedirects && req.method === "HEAD") args.push("allow_redirects=True");

  if (req.http2) lines.push("# curl --http2: requests speaks HTTP/1.1 only. Use httpx for HTTP/2.");
  lines.push("");
  const fn = PYTHON_METHODS.has(req.method) ? `requests.${req.method.toLowerCase()}(url` : `requests.request(${quote(req.method)}, url`;
  const all = args.length ? `, ${args.join(", ")}` : "";
  const single = `response = ${fn}${all})`;
  lines.push(single.length <= 88 ? single : `response = ${fn},\n${args.map((a) => `    ${a},`).join("\n")}\n)`);
  lines.push("", req.method === "HEAD" ? "print(response.status_code, response.headers)" : "print(response.status_code, response.text)");
  return lines.join("\n");
}

const goRawString = (text: string) => (text.includes("`") ? quote(text) : `\`${text}\``);

const GO_METHODS: Record<string, string> = {
  GET: "http.MethodGet",
  POST: "http.MethodPost",
  PUT: "http.MethodPut",
  PATCH: "http.MethodPatch",
  DELETE: "http.MethodDelete",
  HEAD: "http.MethodHead",
  OPTIONS: "http.MethodOptions",
};

function generateGo(req: CurlRequest): string {
  const imports = new Set(["fmt", "io", "log", "net/http"]);
  const body: string[] = [];
  let bodyVar = "nil";
  const headers = req.headers;

  if (req.body?.kind === "multipart") {
    imports.add("bytes");
    imports.add("mime/multipart");
    body.push("\tvar buf bytes.Buffer", "\tform := multipart.NewWriter(&buf)");
    for (const field of req.body.fields) {
      if ("file" in field) {
        imports.add("os");
        const filename = field.filename ?? field.file.split(/[\\/]/).pop() ?? field.file;
        // A block per file keeps part, file, and err local, so several files compile
        body.push(
          "\t{",
          `\t\tpart, err := form.CreateFormFile(${quote(field.name)}, ${quote(filename)})`,
          "\t\tif err != nil {\n\t\t\tlog.Fatal(err)\n\t\t}",
          `\t\tfile, err := os.Open(${quote(field.file)})`,
          "\t\tif err != nil {\n\t\t\tlog.Fatal(err)\n\t\t}",
          "\t\tif _, err := io.Copy(part, file); err != nil {\n\t\t\tlog.Fatal(err)\n\t\t}",
          "\t\tfile.Close()",
          "\t}",
        );
      } else body.push(`\tform.WriteField(${quote(field.name)}, ${quote(field.value)})`);
    }
    body.push("\tform.Close()", "");
    bodyVar = "&buf";
  } else if (req.body) {
    imports.add("strings");
    const text = req.body.kind === "json" ? pretty(req.body.value) : req.body.text;
    body.push(`\tbody := strings.NewReader(${goRawString(text)})`);
    bodyVar = "body";
  }

  const method = GO_METHODS[req.method] ?? quote(req.method);
  body.push(`\treq, err := http.NewRequest(${method}, ${quote(req.url)}, ${bodyVar})`, "\tif err != nil {\n\t\tlog.Fatal(err)\n\t}");
  const seen = new Set<string>();
  for (const [name, value] of headers) {
    const key = name.toLowerCase();
    body.push(`\treq.Header.${seen.has(key) ? "Add" : "Set"}(${quote(name)}, ${quote(value)})`);
    seen.add(key);
  }
  if (req.body?.kind === "multipart") body.push('\treq.Header.Set("Content-Type", form.FormDataContentType())');
  if (req.auth) body.push(`\treq.SetBasicAuth(${quote(req.auth.user)}, ${quote(req.auth.password)})`);

  const client: string[] = [];
  if (req.timeout) {
    imports.add("time");
    client.push(
      Number.isInteger(req.timeout)
        ? `\t\tTimeout: ${req.timeout} * time.Second,`
        : `\t\tTimeout: time.Duration(${req.timeout} * float64(time.Second)),`,
    );
  }
  if (req.insecure) {
    imports.add("crypto/tls");
    client.push("\t\tTransport: &http.Transport{\n\t\t\tTLSClientConfig: &tls.Config{InsecureSkipVerify: true},\n\t\t},");
  }
  body.push("", client.length ? `\tclient := &http.Client{\n${client.join("\n")}\n\t}` : "\tclient := &http.Client{}");
  body.push(
    "\tresp, err := client.Do(req)",
    "\tif err != nil {\n\t\tlog.Fatal(err)\n\t}",
    "\tdefer resp.Body.Close()",
    "",
    "\tdata, err := io.ReadAll(resp.Body)",
    "\tif err != nil {\n\t\tlog.Fatal(err)\n\t}",
    '\tfmt.Println(resp.Status)',
    '\tfmt.Printf("%s\\n", data)',
  );

  const sorted = [...imports].sort();
  return ["package main", "", "import (", ...sorted.map((i) => `\t${quote(i)}`), ")", "", "func main() {", ...body, "}"].join("\n");
}

const phpString = (text: string) => `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

function generatePhp(req: CurlRequest): string {
  const lines = ["<?php", "", "$ch = curl_init();", `curl_setopt($ch, CURLOPT_URL, ${phpString(req.url)});`, "curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);"];
  if (req.method === "HEAD") lines.push("curl_setopt($ch, CURLOPT_NOBODY, true);");
  else if (req.method !== "GET" && !(req.method === "POST" && req.body)) {
    lines.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${phpString(req.method)});`);
  }
  if (req.headers.length) {
    lines.push("curl_setopt($ch, CURLOPT_HTTPHEADER, [", ...req.headers.map(([n, v]) => `    ${phpString(`${n}: ${v}`)},`), "]);");
  }
  if (req.auth) lines.push(`curl_setopt($ch, CURLOPT_USERPWD, ${phpString(`${req.auth.user}:${req.auth.password}`)});`);
  if (req.body?.kind === "multipart") {
    const fields = req.body.fields.map((field) => {
      if ("file" in field) {
        const type = field.contentType ? phpString(field.contentType) : "null";
        const filename = field.filename ? `, ${phpString(field.filename)}` : "";
        return `    ${phpString(field.name)} => new CURLFile(${phpString(field.file)}${field.contentType || field.filename ? `, ${type}${filename}` : ""}),`;
      }
      return `    ${phpString(field.name)} => ${phpString(field.value)},`;
    });
    lines.push("curl_setopt($ch, CURLOPT_POSTFIELDS, [", ...fields, "]);");
  } else if (req.body?.kind === "json") {
    lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, <<<'JSON'\n${pretty(req.body.value, 4)}\nJSON);`);
  } else if (req.body) {
    lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${phpString(req.body.text)});`);
  }
  if (req.followRedirects) lines.push("curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);");
  if (req.insecure) lines.push("curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);", "curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);");
  if (req.compressed) lines.push("curl_setopt($ch, CURLOPT_ENCODING, '');");
  if (req.http2) lines.push("curl_setopt($ch, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_2_0);");
  if (req.timeout) {
    lines.push(
      Number.isInteger(req.timeout)
        ? `curl_setopt($ch, CURLOPT_TIMEOUT, ${req.timeout});`
        : `curl_setopt($ch, CURLOPT_TIMEOUT_MS, ${Math.round(req.timeout * 1000)});`,
    );
  }
  lines.push(
    "",
    "$response = curl_exec($ch);",
    "if ($response === false) {",
    "    echo 'Request failed: ' . curl_error($ch) . PHP_EOL;",
    "} else {",
    "    echo curl_getinfo($ch, CURLINFO_RESPONSE_CODE) . PHP_EOL;",
    "    echo $response;",
    "}",
    "curl_close($ch);",
  );
  return lines.join("\n");
}

/** A Rust string literal: raw when possible, escaped otherwise. */
function rustString(text: string): string {
  if (!text.includes('"#')) return text.includes('"') || text.includes("\\") || text.includes("\n") ? `r#"${text}"#` : `"${text}"`;
  const map: Record<string, string> = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t" };
  const escaped = Array.from(text, (c) => map[c] ?? (c.charCodeAt(0) < 0x20 ? `\\u{${c.charCodeAt(0).toString(16)}}` : c)).join("");
  return `"${escaped}"`;
}

const RUST_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);

function generateRust(req: CurlRequest, asyncMode: boolean): string {
  const awaitPart = asyncMode ? ".await" : "";
  const ns = asyncMode ? "reqwest" : "reqwest::blocking";
  const features = asyncMode ? [] : ["blocking"];
  if (req.body?.kind === "multipart") features.push("multipart");
  if (req.body?.kind === "multipart" && asyncMode && req.body.fields.some((f) => "file" in f)) features.push("stream");
  if (req.compressed) features.push("gzip", "brotli", "deflate");
  if (req.http2) features.push("http2");

  const lines: string[] = [];
  const cargo = `reqwest = { version = "0.12"${features.length ? `, features = [${features.map(quote).join(", ")}]` : ""} }`;
  lines.push(`// Cargo.toml: ${cargo}${asyncMode ? ', tokio = { version = "1", features = ["full"] }' : ""}`);
  if (req.timeout) lines.push("use std::time::Duration;");
  lines.push("");
  lines.push(asyncMode ? "#[tokio::main]\nasync fn main() -> Result<(), Box<dyn std::error::Error>> {" : "fn main() -> Result<(), Box<dyn std::error::Error>> {");

  const builder: string[] = [];
  if (req.insecure) builder.push(".danger_accept_invalid_certs(true)");
  if (req.timeout) builder.push(Number.isInteger(req.timeout) ? `.timeout(Duration::from_secs(${req.timeout}))` : `.timeout(Duration::from_secs_f64(${req.timeout}))`);
  lines.push(
    builder.length
      ? `    let client = ${ns}::Client::builder()\n${builder.map((b) => `        ${b}`).join("\n")}\n        .build()?;`
      : `    let client = ${ns}::Client::new();`,
  );

  if (req.body?.kind === "multipart") {
    const parts = req.body.fields.map((field) => {
      if ("file" in field) return `        .file(${rustString(field.name)}, ${rustString(field.file)})${awaitPart}?`;
      return `        .text(${rustString(field.name)}, ${rustString(field.value)})`;
    });
    lines.push(`    let form = ${ns}::multipart::Form::new()\n${parts.join("\n")};`);
  }
  lines.push("");

  const chain: string[] = [];
  chain.push(
    RUST_METHODS.has(req.method)
      ? `.${req.method.toLowerCase()}(${rustString(req.url)})`
      : `.request(reqwest::Method::from_bytes(${rustString(req.method).replace(/^"/, 'b"')})?, ${rustString(req.url)})`,
  );
  for (const [name, value] of req.headers) chain.push(`.header(${rustString(name)}, ${rustString(value)})`);
  if (req.auth) chain.push(`.basic_auth(${rustString(req.auth.user)}, Some(${rustString(req.auth.password)}))`);
  if (req.body?.kind === "multipart") chain.push(".multipart(form)");
  else if (req.body?.kind === "json") chain.push(`.body(${rustString(pretty(req.body.value))})`);
  else if (req.body) chain.push(`.body(${rustString(req.body.text)})`);
  chain.push(`.send()${awaitPart}?`);

  // Do not indent continuation lines: they can be inside a raw string body
  lines.push(`    let response = client\n${chain.map((c) => `        ${c}`).join("\n")};`);
  lines.push("", '    println!("{}", response.status());');
  if (req.method !== "HEAD") lines.push(`    println!("{}", response.text()${awaitPart}?);`);
  lines.push("    Ok(())", "}");
  return lines.join("\n");
}

const shellQuote = (text: string) => (/^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`);

function generateHttpie(req: CurlRequest): string {
  const args: string[] = [];
  const options: string[] = [];
  if (req.followRedirects) options.push("--follow");
  if (req.insecure) options.push("--verify=no");
  if (req.timeout) options.push(`--timeout=${req.timeout}`);
  if (req.auth) options.push(`-a ${shellQuote(`${req.auth.user}:${req.auth.password}`)}`);
  if (req.body?.kind === "multipart") options.push("--multipart");

  args.push(`http${options.length ? ` ${options.join(" ")}` : ""} ${req.method} ${shellQuote(req.url)}`);
  for (const [name, value] of req.headers) args.push(shellQuote(value ? `${name}:${value}` : `${name};`));
  if (req.body?.kind === "multipart") {
    for (const field of req.body.fields) {
      if ("file" in field) args.push(shellQuote(`${field.name}@${field.file}${field.contentType ? `;type=${field.contentType}` : ""}`));
      else args.push(shellQuote(`${field.name}=${field.value}`));
    }
  } else if (req.body?.kind === "json") {
    args.push(`--raw ${shellQuote(pretty(req.body.value))}`);
  } else if (req.body) {
    args.push(`--raw ${shellQuote(req.body.text)}`);
  }
  const notes = req.http2 ? "# curl --http2: HTTPie uses HTTP/1.1.\n" : "";
  return notes + args.join(" \\\n  ");
}

export const CODE_TARGETS: { value: CodeTarget; label: string }[] = [
  { value: "javascript", label: "JavaScript" },
  { value: "node", label: "Node.js" },
  { value: "python", label: "Python" },
  { value: "go", label: "Go" },
  { value: "php", label: "PHP" },
  { value: "rust", label: "Rust" },
  { value: "httpie", label: "HTTPie" },
];

/** Generates code for a parsed request. */
export function generateCode(req: CurlRequest, target: CodeTarget, options: GenerateOptions = {}): string {
  switch (target) {
    case "javascript":
      return generateJavaScript(req, false);
    case "node":
      return generateJavaScript(req, true);
    case "python":
      return generatePython(req);
    case "go":
      return generateGo(req);
    case "php":
      return generatePhp(req);
    case "rust":
      return generateRust(req, options.rustAsync ?? false);
    case "httpie":
      return generateHttpie(req);
  }
}

/** Parses a curl command and generates code in one step. */
export function curlToCode(input: string, target: CodeTarget, options: GenerateOptions = {}) {
  const request = parseCurl(input);
  return { request, code: generateCode(request, target, options) };
}
