import { failed, parseCidr } from "@/utils/ip-cidr";
import { readJson } from "@/utils/json-repair";

/** A tool suggestion for pasted text. Higher scores are surer matches. */
export interface PasteSuggestion {
  toolId: string;
  label: string;
  score: number;
}

const MAX_LENGTH = 200_000;

const decodeBase64Url = (part: string) => {
  try {
    return atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
  } catch {
    return null;
  }
};

const isJwt = (text: string) => {
  const parts = text.split(".");
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[0] + parts[1])) return false;
  try {
    const header = JSON.parse(decodeBase64Url(parts[0]) ?? "");
    return typeof header === "object" && header !== null && "alg" in header;
  } catch {
    return false;
  }
};

const isJson = (text: string) => {
  if (!/^[[{]/.test(text)) return false;
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null;
  } catch {
    return false;
  }
};

const CRON_FIELD = /^(\*|\?|L|W|#|\d+|[A-Z]{3})([-/,]?(\*|\d+|[A-Z]{3}|L|W))*(#\d)?$/i;

const CRON_MACRO = /^@(yearly|annually|monthly|weekly|daily|midnight|hourly)(\s|$)/i;

const isCron = (text: string) => {
  if (CRON_MACRO.test(text)) return true;
  const fields = text.split(/\s+/);
  // A crontab line has a command after the 5 schedule fields.
  const command = fields.length > 7 || (fields.length > 5 && !fields.slice(5).every((field) => CRON_FIELD.test(field)));
  const schedule = command ? fields.slice(0, 5) : fields;
  return schedule.length >= 5 && schedule.length <= 7 && schedule.every((field) => CRON_FIELD.test(field)) && schedule.some((field) => field.includes("*") || field.includes("/"));
};

const isPrintableBase64 = (text: string) => {
  if (text.length < 16 || text.length % 4 === 1 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) return false;
  if (/^[0-9a-f]+$/i.test(text) || /^[a-z]+$/i.test(text)) return false; // hex digests and plain words
  const decoded = decodeBase64Url(text);
  if (!decoded) return false;
  let printable = 0;
  for (const char of decoded) {
    const code = char.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code < 127)) printable++;
  }
  return printable / Math.max(decoded.length, 1) > 0.9;
};

/** GZIP in Base64 starts with "H4sI" (1f 8b 08), or "SDRzS" under a second layer of Base64. */
const compressedBase64 = (text: string): "GZIP data" | "zlib data" | null => {
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 20 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) return null;
  if (/^(H4sI|SDRzS)/.test(compact)) return "GZIP data";
  // zlib starts with 0x78, and its two header bytes are a multiple of 31.
  const header = decodeBase64Url(compact.slice(0, 4));
  if (header && header.charCodeAt(0) === 0x78 && ((0x78 << 8) | header.charCodeAt(1)) % 31 === 0) return "zlib data";
  return null;
};

/** A CIDR block, an IPv4 address with a netmask, or an IPv6 address. A bare IPv4 address could be a version number, so it is skipped. */
const ipPaste = (text: string): string | null => {
  const v4 = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2}|\s+255\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.test(text);
  const v6 = /^[0-9a-f:.]+(\/\d{1,3})?$/i.test(text) && (text.includes("::") || text.split(":").length === 8);
  if ((!v4 && !v6) || failed(parseCidr(text))) return null;
  if (v6 && !text.includes("/")) return "an IPv6 address";
  return /\s/.test(text) ? "an IPv4 address and netmask" : "a CIDR block";
};

const isTimestamp = (text: string) => {
  // Seconds, milliseconds, microseconds, or nanoseconds.
  if (!/^\d{10}(\d{3}|\d{6}|\d{9})?$/.test(text)) return false;
  const ms = Number(text.slice(0, 13).padEnd(13, "0"));
  return ms > Date.UTC(2000, 0, 1) && ms < Date.UTC(2100, 0, 1);
};

/** Two or more KEY=value lines with UPPER_SNAKE keys, and nothing else but comments. */
const isEnvFile = (text: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  return lines.length >= 2 && lines.every((line) => /^(export\s+)?[A-Z_][A-Z0-9_]*=/.test(line));
};

/**
 * Guesses which tools fit pasted text, surest first. Runs only on a paste the user makes,
 * so the app never reads the clipboard on its own.
 */
export function detectPastedContent(raw: string, availableToolIds: ReadonlySet<string>): PasteSuggestion[] {
  const text = raw.trim();
  if (!text || text.length > MAX_LENGTH) return [];
  const single = !text.includes("\n");
  const found: PasteSuggestion[] = [];
  const add = (toolId: string, label: string, score: number) => {
    if (availableToolIds.has(toolId) && !found.some((item) => item.toolId === toolId)) found.push({ toolId, label, score });
  };

  if (single && isJwt(text)) add("jwt-decoder", "a JWT", 100);
  if (/-----BEGIN (CERTIFICATE|CERTIFICATE REQUEST)-----/.test(text)) add("certificate-decoder", "a certificate", 100);
  if (/-----BEGIN (OPENSSH PRIVATE KEY|PRIVATE KEY|PUBLIC KEY|RSA PRIVATE KEY|RSA PUBLIC KEY|EC PRIVATE KEY)-----/.test(text)) add("key-generator", "a key", 95);
  if (single && /^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp(256|384|521)) AAAA[A-Za-z0-9+/]+=*( .*)?$/.test(text)) add("key-generator", "an SSH public key", 95);
  if (/^curl\s/i.test(text)) add("curl-to-code", "a cURL command", 95);
  if (isJson(text)) {
    if (/^\{\s*"log"\s*:/.test(text) && /"entries"\s*:\s*\[/.test(text)) add("har-viewer", "a HAR file", 98);
    if (/"\$schema"\s*:\s*"https?:\/\/json-schema\.org\//.test(text)) add("json-schema", "a JSON Schema", 95);
    add("json-viewer", "JSON", 90);
    add("json-typescript", "JSON", 40);
  } else if (/^[[{(]/.test(text) && readJson(text).ok) {
    add("json-viewer", "a data literal", 70);
  }
  if (single && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) add("uuid-generator", "a UUID", 90);
  if (single && /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(text)) add("uuid-generator", "a ULID", 85);
  if (single && isTimestamp(text)) add("timestamp", "a Unix timestamp", 85);
  if (single && isCron(text)) add("cron-calculator", "a cron expression", 85);
  if (single && /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\([^)]{5,40}\)|hsla?\([^)]{5,40}\)|(hwb|oklch|oklab)\([^)]{5,40}\))$/i.test(text)) add("color-palette", "a color", 85);
  if (single && /^-?0(x[0-9a-f_]+|o[0-7_]+|b[01_]+)$/i.test(text)) add("number-base", "a number literal", 80);
  const ip = single ? ipPaste(text) : null;
  if (ip) add("ip-cidr", ip, 85);
  if (single && /^https?:\/\/\S+$/i.test(text)) add("url-encoder", "a URL", 80);
  if (/^(a:\d+:\{|O:\d+:"|C:\d+:"|[^|:;{}"\s]+\|(a|s|i|b|d|O):)/.test(text)) add("php-tools", "PHP serialized data", 85);
  if (/^\s*(<\?php\s+)?(return\s+|\$\w+\s*=\s*)?(\[|array\s*\()[\s\S]*=>/i.test(text)) add("php-tools", "a PHP array", 70);
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER)\b[\s\S]*\b(FROM|INTO|SET|TABLE|AS)\b/i.test(text)) add("code-formatter", "SQL", 75);
  if (/^\s*<(!doctype html|html|div|svg|section|body|head)\b/i.test(text)) {
    add(text.toLowerCase().includes("<svg") ? "svg-to-css" : "code-formatter", text.toLowerCase().includes("<svg") ? "SVG" : "HTML", 70);
  }
  if (single && /%[0-9a-f]{2}/i.test(text) && !/\s/.test(text)) add("url-encoder", "URL-encoded text", 60);
  const compressed = compressedBase64(text);
  if (compressed) add("compression", compressed, compressed === "GZIP data" ? 95 : 75);
  if (single && isPrintableBase64(text)) add("base64", "Base64", 60);
  if (!single && /^[^\n:#]+:\s?.+\n(\s*[^\n:#]+:.*\n?)+$/.test(text) && !isJson(text)) add("yaml-json", "YAML", 50);
  if (!single && /^\[\[?[\w.\-" ]+\]\]?[ \t]*$/m.test(text) && /^[\w.\-"]+[ \t]*=[ \t]*\S/m.test(text)) add("yaml-json", "TOML", 50);
  if (isEnvFile(text)) add("yaml-json", ".env", 50);

  return found.sort((a, b) => b.score - a.score).slice(0, 3);
}
