/**
 * Reads email files without a server. `.eml` files are RFC 5322 / MIME text.
 * `.msg` files are Outlook messages stored in an OLE compound file with MAPI properties.
 */

export interface EmailAddress {
  name: string;
  address: string;
}

export interface EmailHeader {
  name: string;
  value: string;
}

export interface EmailAttachment {
  name: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
  /** The Content-ID without angle brackets. Used by `cid:` references in the HTML body. */
  contentId: string;
  /** Shown in the body instead of listed as a download. */
  inline: boolean;
}

export type EmailFormat = "eml" | "msg";

export interface ParsedEmail {
  format: EmailFormat;
  subject: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  replyTo: EmailAddress[];
  /** The Date header, or the sent time stored in a .msg file. */
  date: Date | null;
  messageId: string;
  text: string;
  html: string;
  headers: EmailHeader[];
  attachments: EmailAttachment[];
  /** Things the reader could not decode, shown as a notice. */
  warnings: string[];
}

export const MAX_EMAIL_BYTES = 100 * 1024 * 1024;

const MAX_MIME_DEPTH = 24;
const MAX_MIME_PARTS = 2_000;

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export const isMsgFile = (bytes: Uint8Array) => bytes.length >= 8 && OLE_MAGIC.every((b, i) => bytes[i] === b);

/** Reads a .eml or .msg file. The format comes from the bytes, not the file name. */
export function parseEmail(bytes: Uint8Array): ParsedEmail {
  if (bytes.length === 0) throw new Error("The file is empty.");
  if (bytes.length > MAX_EMAIL_BYTES) throw new Error("The file is larger than 100 MB.");
  return isMsgFile(bytes) ? parseMsg(bytes) : parseEml(bytes);
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const latin1 = (bytes: Uint8Array) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
};

const toBytes = (binary: string) => {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 0xff;
  return out;
};

/**
 * Decodes bytes with a MIME charset name. Unknown names fall back to UTF-8, then Windows-1252.
 * With no name, the bytes are UTF-8 only when they are valid UTF-8. Else they are Windows-1252.
 */
export function decodeCharset(bytes: Uint8Array, charset: string): string {
  const label = charset.trim().replace(/^["']|["']$/g, "").toLowerCase();
  const tryDecode = (name: string, fatal: boolean) => {
    try {
      return new TextDecoder(name, { fatal }).decode(bytes);
    } catch {
      return null;
    }
  };
  if (!label) return tryDecode("utf-8", true) ?? tryDecode("windows-1252", false) ?? latin1(bytes);
  if (label === "us-ascii" || label === "ascii") return tryDecode("windows-1252", false) ?? latin1(bytes);
  return tryDecode(label, false) ?? tryDecode("utf-8", true) ?? tryDecode("windows-1252", false) ?? latin1(bytes);
}

const decodeQuotedPrintable = (text: string, header = false): Uint8Array => {
  const source = header ? text.replace(/_/g, " ") : text.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(source.slice(i + 1, i + 3))) {
      out.push(parseInt(source.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(source.charCodeAt(i) & 0xff);
    }
  }
  return Uint8Array.from(out);
};

const decodeBase64 = (text: string): Uint8Array => {
  const clean = text.replace(/[^A-Za-z0-9+/_-]/g, "").replace(/-/g, "+").replace(/_/g, "/");
  try {
    return toBytes(atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, "=")));
  } catch {
    return new Uint8Array();
  }
};

// The charset cannot hold `*`, so the optional RFC 2231 language part cannot match in more than one way
const ENCODED_WORD = /=\?([^?\s*]+)(?:\*[^?\s]*)?\?([bBqQ])\?([^?]*)\?=/g;

const concatBytes = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/**
 * Decodes RFC 2047 encoded words such as `=?UTF-8?B?...?=` in a header value. Mailers can split one
 * character across two words, so adjacent words with the same charset are decoded as one byte run.
 */
export function decodeEncodedWords(value: string): string {
  const joined = value.replace(/(\?=)\s+(?==\?)/g, "$1");
  let out = "";
  let last = 0;
  let run: { charset: string; parts: Uint8Array[] } | null = null;
  const flush = () => {
    if (run) out += decodeCharset(concatBytes(run.parts), run.charset);
    run = null;
  };
  for (const match of joined.matchAll(ENCODED_WORD)) {
    const [word, charset, enc, data] = match;
    if (match.index !== last) {
      flush();
      out += joined.slice(last, match.index);
    }
    const bytes = enc.toLowerCase() === "b" ? decodeBase64(data) : decodeQuotedPrintable(data, true);
    if (run && run.charset.toLowerCase() === charset.toLowerCase()) run.parts.push(bytes);
    else {
      flush();
      run = { charset, parts: [bytes] };
    }
    last = match.index! + word.length;
  }
  flush();
  return out + joined.slice(last);
}

/** Decodes an RFC 2231 value such as `utf-8''%E2%82%AC.txt`. */
const decodeExtendedValue = (value: string) => {
  const match = /^([^']*)'[^']*'(.*)$/.exec(value);
  if (!match) return value;
  const bytes = Uint8Array.from(
    match[2].replace(/%([0-9A-Fa-f]{2})|(.)/g, (_m, hex: string | undefined, ch: string | undefined) => (hex ? String.fromCharCode(parseInt(hex, 16)) : ch ?? "")),
    (c) => c.charCodeAt(0) & 0xff,
  );
  return decodeCharset(bytes, match[1] || "utf-8");
};

// ---------------------------------------------------------------------------
// Headers and addresses
// ---------------------------------------------------------------------------

interface HeaderParams {
  value: string;
  params: Record<string, string>;
}

/** Splits `text/plain; charset=utf-8` into its value and parameters, joining RFC 2231 continuations. */
export function parseParameterised(raw: string): HeaderParams {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\\" && quoted) {
      current += raw[++i] ?? "";
      continue;
    }
    if (ch === '"') quoted = !quoted;
    if (ch === ";" && !quoted) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);

  const params: Record<string, string> = {};
  // An RFC 2231 value such as filename* wins over the plain value, in either order
  const extended = new Set<string>();
  const pieces: Record<string, { index: number; encoded: boolean; value: string }[]> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    let key = part.slice(0, eq).trim().toLowerCase();
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    const continuation = /^(.+?)\*(\d+)(\*)?$/.exec(key);
    if (continuation) {
      (pieces[continuation[1]] ??= []).push({ index: Number(continuation[2]), encoded: Boolean(continuation[3]), value });
    } else if (key.endsWith("*")) {
      key = key.slice(0, -1);
      params[key] = decodeExtendedValue(value);
      extended.add(key);
    } else if (!extended.has(key)) params[key] = decodeEncodedWords(value);
  }
  for (const [key, list] of Object.entries(pieces)) {
    list.sort((a, b) => a.index - b.index);
    const joined = list.map((p) => p.value).join("");
    params[key] = list[0].encoded ? decodeExtendedValue(joined) : decodeEncodedWords(joined);
  }
  return { value: parts[0].trim().toLowerCase(), params };
}

/** Splits a header block into unfolded name and value pairs. */
function parseHeaderBlock(block: string): EmailHeader[] {
  const headers: EmailHeader[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && headers.length) {
      headers[headers.length - 1].value += ` ${line.trim()}`;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon > 0) headers.push({ name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() });
  }
  return headers;
}

const headerValue = (headers: EmailHeader[], name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

const splitTopLevel = (text: string, separator: string) => {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let angle = 0;
  let paren = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && (quoted || paren)) {
      current += ch + (text[++i] ?? "");
      continue;
    }
    if (!paren && ch === '"') quoted = !quoted;
    else if (!quoted) {
      if (ch === "(") paren++;
      else if (ch === ")" && paren) paren--;
      else if (!paren && ch === "<") angle++;
      else if (!paren && ch === ">" && angle) angle--;
    }
    if (ch === separator && !quoted && !angle && !paren) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts;
};

/** Reads an address list such as `"Ada Lovelace" <ada@example.com>, bob@example.com`. Groups are flattened. */
export function parseAddressList(raw: string): EmailAddress[] {
  const out: EmailAddress[] = [];
  for (let item of splitTopLevel(raw, ",")) {
    item = item.trim().replace(/;$/, "").trim();
    if (!item) continue;
    // A group such as `Team: a@x.com, b@x.com;` arrives as one piece that starts with the group name
    const group = /^[^<>"@]*:\s*(.*?);?\s*$/.exec(item);
    if (group) item = group[1].trim();
    if (!item) continue;
    const angle = /^(.*?)<([^<>]*)>\s*$/s.exec(item);
    if (angle) {
      const name = decodeEncodedWords(angle[1].trim().replace(/^"(.*)"$/s, "$1").replace(/\\(.)/g, "$1")).trim();
      out.push({ name, address: angle[2].trim() });
      continue;
    }
    const withoutComments = item.replace(/\([^)]*\)/g, "").trim();
    if (withoutComments) out.push({ name: "", address: withoutComments.replace(/;$/, "") });
  }
  return out;
}

export const formatAddress = ({ name, address }: EmailAddress) => (name && address ? `${name} <${address}>` : name || address);

/** Reads the Date header. Obsolete zone names such as EST are accepted by the Date parser. */
export function parseEmailDate(raw: string): Date | null {
  const value = raw.replace(/\([^)]*\)/g, "").trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ---------------------------------------------------------------------------
// .eml
// ---------------------------------------------------------------------------

interface MimeContext {
  parts: number;
  text: string[];
  html: string[];
  attachments: EmailAttachment[];
  warnings: string[];
}

const splitHeaderBody = (raw: string) => {
  const match = /\r?\n\r?\n/.exec(raw);
  // A message that starts with a blank line has no headers
  if (raw.startsWith("\r\n") || raw.startsWith("\n")) return { head: "", body: raw.replace(/^\r?\n/, "") };
  if (!match) return { head: raw, body: "" };
  return { head: raw.slice(0, match.index), body: raw.slice(match.index + match[0].length) };
};

const decodeBody = (body: string, encoding: string): Uint8Array => {
  switch (encoding.trim().toLowerCase()) {
    case "base64":
      return decodeBase64(body);
    case "quoted-printable":
      return decodeQuotedPrintable(body);
    default:
      return toBytes(body);
  }
};

const extensionFor = (mime: string) => {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "text/calendar": "ics",
    "text/plain": "txt",
    "text/html": "html",
    "message/rfc822": "eml",
  };
  return map[mime] ?? "bin";
};

function walkMime(raw: string, ctx: MimeContext, depth: number, index: { n: number }) {
  if (ctx.parts++ > MAX_MIME_PARTS) {
    if (!ctx.warnings.includes("The message has more than 2,000 parts. The rest were skipped.")) ctx.warnings.push("The message has more than 2,000 parts. The rest were skipped.");
    return;
  }
  const { head, body } = splitHeaderBody(raw);
  const headers = parseHeaderBlock(head);
  const type = parseParameterised(headerValue(headers, "content-type") || "text/plain");
  const disposition = parseParameterised(headerValue(headers, "content-disposition"));
  const encoding = headerValue(headers, "content-transfer-encoding");
  const contentId = headerValue(headers, "content-id").replace(/^<|>$/g, "").trim();
  const filename = disposition.params.filename || type.params.name || "";

  if (type.value.startsWith("multipart/") && type.params.boundary && depth < MAX_MIME_DEPTH) {
    const boundary = type.params.boundary;
    const delimiter = `--${boundary}`;
    const segments: string[] = [];
    let current: string[] | null = null;
    for (const line of body.split(/\r?\n/)) {
      // A longer boundary that starts with this one, such as abc-alt for abc, belongs to a nested part
      if (line.startsWith(delimiter) && /^(?:--)?[ \t]*$/.test(line.slice(delimiter.length))) {
        const rest = line.slice(delimiter.length);
        if (current) segments.push(current.join("\r\n"));
        if (rest.startsWith("--")) {
          current = null;
          break;
        }
        current = [];
      } else current?.push(line);
    }
    if (current) segments.push(current.join("\r\n"));
    // Keep every alternative. The tool shows the plain text and the HTML as separate tabs.
    for (const segment of segments) walkMime(segment, ctx, depth + 1, index);
    return;
  }

  const data = decodeBody(body, encoding);
  const isAttachment = disposition.value === "attachment" || Boolean(filename) || (!type.value.startsWith("text/") && !type.value.startsWith("multipart/") && type.value !== "message/rfc822");
  const isInlineText = !isAttachment && (type.value === "text/plain" || type.value === "text/html" || type.value === "");

  if (isInlineText) {
    const text = decodeCharset(data, type.params.charset ?? "");
    (type.value === "text/html" ? ctx.html : ctx.text).push(text);
    return;
  }

  if (type.value === "message/rfc822") {
    index.n++;
    // A forwarded message can have a base64 transfer encoding, so read the decoded bytes
    const subject = decodeEncodedWords(headerValue(parseHeaderBlock(splitHeaderBody(latin1(data)).head), "subject"));
    ctx.attachments.push({
      name: filename || `${subject || `message-${index.n}`}.eml`,
      mimeType: "message/rfc822",
      size: data.length,
      bytes: data,
      contentId,
      inline: false,
    });
    return;
  }

  index.n++;
  const mimeType = type.value || "application/octet-stream";
  ctx.attachments.push({
    name: filename || `attachment-${index.n}.${extensionFor(mimeType)}`,
    mimeType,
    size: data.length,
    bytes: data,
    contentId,
    // markInline sets this when the HTML body is known
    inline: false,
  });
}

export function parseEml(bytes: Uint8Array): ParsedEmail {
  // A UTF-8 byte order mark would become part of the first header name
  const raw = latin1(bytes).replace(/^\xEF\xBB\xBF/, "").replace(/^From [^\r\n]*\r?\n/, "");
  const { head } = splitHeaderBody(raw);
  const headers = parseHeaderBlock(head);
  if (!headers.some((h) => ["from", "to", "subject", "date", "message-id", "mime-version", "content-type", "received"].includes(h.name.toLowerCase()))) {
    throw new Error("This does not look like an email. A .eml file starts with headers such as From, To, and Subject.");
  }

  const ctx: MimeContext = { parts: 0, text: [], html: [], attachments: [], warnings: [] };
  walkMime(raw, ctx, 0, { n: 0 });

  const list = (name: string) => parseAddressList(headers.filter((h) => h.name.toLowerCase() === name).map((h) => h.value).join(", "));
  const html = ctx.html.join("\n");
  markInline(html, ctx.attachments);
  return {
    format: "eml",
    subject: decodeEncodedWords(headerValue(headers, "subject")),
    from: list("from"),
    to: list("to"),
    cc: list("cc"),
    bcc: list("bcc"),
    replyTo: list("reply-to"),
    date: parseEmailDate(headerValue(headers, "date")),
    messageId: headerValue(headers, "message-id").replace(/^<|>$/g, ""),
    text: ctx.text.join("\n\n"),
    html,
    headers: headers.map((h) => ({ name: h.name, value: decodeEncodedWords(h.value) })),
    attachments: ctx.attachments,
    warnings: ctx.warnings,
  };
}

// ---------------------------------------------------------------------------
// .msg (OLE compound file)
// ---------------------------------------------------------------------------

const END_OF_CHAIN = 0xfffffffe;
const FREE_SECTOR = 0xffffffff;

interface OleNode {
  name: string;
  type: number;
  start: number;
  size: number;
  children: OleNode[];
}

interface OleFile {
  root: OleNode;
  read(node: OleNode): Uint8Array;
}

function readOle(bytes: Uint8Array): OleFile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 512 || !isMsgFile(bytes)) throw new Error("This is not an Outlook .msg file.");
  const sectorShift = view.getUint16(0x1e, true);
  const miniShift = view.getUint16(0x20, true);
  if (sectorShift < 7 || sectorShift > 16 || miniShift > sectorShift) throw new Error("The .msg file is damaged.");
  const sectorSize = 1 << sectorShift;
  const miniSize = 1 << miniShift;
  const sectorCount = Math.ceil((bytes.length - 512) / sectorSize);
  const firstDirectory = view.getUint32(0x30, true);
  const miniCutoff = view.getUint32(0x38, true);
  const firstMiniFat = view.getUint32(0x3c, true);
  const firstDifat = view.getUint32(0x44, true);
  const difatCount = view.getUint32(0x48, true);

  const sectorOffset = (id: number) => (id + 1) * sectorSize;
  const sector = (id: number) => {
    const offset = sectorOffset(id);
    return bytes.subarray(offset, Math.min(offset + sectorSize, bytes.length));
  };

  // File allocation table. The header counts come from the file, so every loop is bounded by
  // the number of sectors that the file really has, and a sector is read only once.
  const fatSectors = new Set<number>();
  for (let i = 0; i < 109; i++) {
    const id = view.getUint32(0x4c + i * 4, true);
    if (id < sectorCount) fatSectors.add(id);
  }
  const difatSeen = new Set<number>();
  let difat = firstDifat;
  for (let n = 0; n < Math.min(difatCount, sectorCount) && difat < sectorCount && !difatSeen.has(difat); n++) {
    difatSeen.add(difat);
    const base = sectorOffset(difat);
    const entries = sectorSize / 4 - 1;
    for (let i = 0; i < entries && fatSectors.size < sectorCount; i++) {
      if (base + i * 4 + 4 > bytes.length) break;
      const id = view.getUint32(base + i * 4, true);
      if (id < sectorCount) fatSectors.add(id);
    }
    if (base + sectorSize > bytes.length) break;
    difat = view.getUint32(base + sectorSize - 4, true);
  }
  const fat: number[] = [];
  for (const id of fatSectors) {
    const s = sector(id);
    const v = new DataView(s.buffer, s.byteOffset, s.byteLength);
    for (let i = 0; i + 4 <= s.length; i += 4) fat.push(v.getUint32(i, true));
  }

  /** The sector ids of a stream. `count` is the number of sectors that exist, and `max` caps the length. */
  const chain = (start: number, table: number[], count: number, max = Infinity) => {
    const ids: number[] = [];
    const seen = new Set<number>();
    let id = start;
    while (id < END_OF_CHAIN && id !== FREE_SECTOR && !seen.has(id) && id < table.length && id < count && ids.length < max) {
      seen.add(id);
      ids.push(id);
      id = table[id];
    }
    return ids;
  };

  const readChain = (start: number, size: number | null) => {
    const ids = chain(start, fat, sectorCount, size === null ? Infinity : Math.ceil(size / sectorSize));
    const out = new Uint8Array(ids.length * sectorSize);
    ids.forEach((id, i) => out.set(sector(id), i * sectorSize));
    return size === null ? out : out.subarray(0, Math.min(size, out.length));
  };

  // Directory
  const directory = readChain(firstDirectory, null);
  const dv = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  const entryCount = Math.floor(directory.length / 128);
  const nodes: (OleNode & { left: number; right: number; child: number })[] = [];
  for (let i = 0; i < entryCount; i++) {
    const o = i * 128;
    const nameLength = Math.min(dv.getUint16(o + 64, true), 64);
    let name = "";
    for (let c = 0; c + 2 <= nameLength - 2; c += 2) name += String.fromCharCode(dv.getUint16(o + c, true));
    nodes.push({
      name,
      type: directory[o + 66],
      left: dv.getUint32(o + 68, true),
      right: dv.getUint32(o + 72, true),
      child: dv.getUint32(o + 76, true),
      start: dv.getUint32(o + 116, true),
      size: dv.getUint32(o + 120, true),
      children: [],
    });
  }
  if (!nodes.length || nodes[0].type !== 5) throw new Error("The .msg file is damaged.");

  const visited = new Set<number>();
  const collect = (id: number, into: OleNode[]) => {
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      if (current >= nodes.length || visited.has(current)) continue;
      visited.add(current);
      const node = nodes[current];
      if (node.type === 0) continue;
      into.push(node);
      stack.push(node.left, node.right);
    }
  };
  const build = (node: (typeof nodes)[number]) => {
    collect(node.child, node.children);
    for (const child of node.children) if (child.type === 1) build(child as (typeof nodes)[number]);
  };
  build(nodes[0]);

  // Mini stream
  const miniStream = readChain(nodes[0].start, nodes[0].size);
  const miniFatBytes = readChain(firstMiniFat, null);
  const mv = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
  const miniFat: number[] = [];
  for (let i = 0; i + 4 <= miniFatBytes.length; i += 4) miniFat.push(mv.getUint32(i, true));

  return {
    root: nodes[0],
    read(node) {
      if (node.size < miniCutoff) {
        const ids = chain(node.start, miniFat, Math.ceil(miniStream.length / miniSize), Math.ceil(node.size / miniSize));
        const out = new Uint8Array(ids.length * miniSize);
        ids.forEach((id, i) => out.set(miniStream.subarray(id * miniSize, (id + 1) * miniSize), i * miniSize));
        return out.subarray(0, node.size);
      }
      return readChain(node.start, node.size);
    },
  };
}

const decodeUtf16 = (bytes: Uint8Array) => new TextDecoder("utf-16le").decode(bytes).replace(/\0+$/, "");

/** Reads MAPI properties from one storage of a .msg file. */
class MapiStorage {
  constructor(
    private readonly ole: OleFile,
    private readonly node: OleNode,
    private readonly codepage: string,
  ) {}

  private stream(id: string, type: string) {
    const name = `__substg1.0_${id}${type}`.toLowerCase();
    return this.node.children.find((child) => child.type === 2 && child.name.toLowerCase() === name);
  }

  string(id: string): string {
    const unicode = this.stream(id, "001F");
    if (unicode) return decodeUtf16(this.ole.read(unicode));
    const ansi = this.stream(id, "001E");
    if (ansi) return decodeCharset(this.ole.read(ansi), this.codepage).replace(/\0+$/, "");
    return "";
  }

  binary(id: string): Uint8Array | null {
    const node = this.stream(id, "0102");
    return node ? this.ole.read(node) : null;
  }

  /** Fixed-size properties live in `__properties_version1.0`, 16 bytes each. */
  fixed(headerSize: number): Map<number, DataView> {
    const props = new Map<number, DataView>();
    const node = this.node.children.find((child) => child.type === 2 && child.name === "__properties_version1.0");
    if (!node) return props;
    const data = this.ole.read(node);
    for (let o = headerSize; o + 16 <= data.length; o += 16) {
      const dv = new DataView(data.buffer, data.byteOffset + o, 16);
      props.set(dv.getUint32(0, true), new DataView(data.buffer, data.byteOffset + o + 8, 8));
    }
    return props;
  }
}

const PT_LONG = 0x0003;
const PT_SYSTIME = 0x0040;

const filetimeToDate = (value: DataView): Date | null => {
  const ticks = (BigInt(value.getUint32(4, true)) << 32n) | BigInt(value.getUint32(0, true));
  if (ticks === 0n) return null;
  const ms = Number(ticks / 10000n) - 11644473600000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Windows code page numbers (PidTagInternetCodepage) to TextDecoder labels. */
const codepageLabel = (page: number) => {
  if (page === 65001) return "utf-8";
  if (page === 20127) return "us-ascii";
  if (page === 936) return "gbk";
  if (page === 950) return "big5";
  if (page === 932) return "shift_jis";
  if (page === 949) return "euc-kr";
  if (page === 28591) return "iso-8859-1";
  if (page === 28592) return "iso-8859-2";
  if (page === 28605) return "iso-8859-15";
  if (page >= 1250 && page <= 1258) return `windows-${page}`;
  if (page === 874) return "windows-874";
  if (page === 20866) return "koi8-r";
  return "windows-1252";
};

const joinNames = (value: string) => value.split(/;\s*/).map((s) => s.trim()).filter(Boolean);

export function parseMsg(bytes: Uint8Array): ParsedEmail {
  const ole = readOle(bytes);
  const root = ole.root;
  const warnings: string[] = [];

  const topFixed = new MapiStorage(ole, root, "windows-1252").fixed(32);
  // ANSI strings use the message code page (3FFD), else the internet code page (3FDE)
  const codepage = topFixed.get(0x3ffd0003) ?? topFixed.get(0x3fde0003);
  const bodyCharset = codepage ? codepageLabel(codepage.getUint32(0, true)) : "windows-1252";
  const message = new MapiStorage(ole, root, bodyCharset);

  const subject = message.string("0037");
  const transport = message.string("007D");
  const headers = transport ? parseHeaderBlock(transport) : [];

  const addressOf = (name: string, smtp: string, other: string): EmailAddress => ({
    name,
    address: smtp || (other.includes("@") ? other : ""),
  });

  const senderName = message.string("0C1A");
  const from: EmailAddress[] =
    senderName || message.string("5D01") || message.string("0C1F")
      ? [addressOf(senderName, message.string("5D01"), message.string("0C1F"))]
      : headers.length
        ? parseAddressList(headerValue(headers, "from"))
        : [];
  if (from[0] && from[0].name === from[0].address) from[0].name = "";

  // Recipients are sub-storages with a type: 1 To, 2 Cc, 3 Bcc
  const to: EmailAddress[] = [];
  const cc: EmailAddress[] = [];
  const bcc: EmailAddress[] = [];
  for (const child of root.children) {
    if (child.type !== 1 || !/^__recip_version1\.0_#/i.test(child.name)) continue;
    const recipient = new MapiStorage(ole, child, bodyCharset);
    const display = recipient.string("3001");
    const address = addressOf(display, recipient.string("39FE"), recipient.string("3003"));
    if (address.name === address.address) address.name = "";
    const kind = recipient.fixed(8).get(0x0c150003)?.getUint32(0, true) ?? 1;
    (kind === 2 ? cc : kind === 3 ? bcc : to).push(address);
  }
  const fallback = (id: string, into: EmailAddress[]) => {
    if (into.length) return;
    for (const name of joinNames(message.string(id))) into.push({ name, address: name.includes("@") ? name : "" });
  };
  fallback("0E04", to);
  fallback("0E03", cc);
  fallback("0E02", bcc);

  let date: Date | null = null;
  for (const tag of [0x00390040, 0x0e060040]) {
    const value = topFixed.get(tag);
    if (value && (tag & 0xffff) === PT_SYSTIME) {
      date = filetimeToDate(value);
      if (date) break;
    }
  }
  if (!date && headers.length) date = parseEmailDate(headerValue(headers, "date"));

  const htmlBytes = message.binary("1013");
  const html = htmlBytes ? decodeCharset(htmlBytes, bodyCharset === "windows-1252" && /charset=["']?utf-8/i.test(latin1(htmlBytes.subarray(0, 2048))) ? "utf-8" : bodyCharset) : message.string("1013");
  const text = message.string("1000");
  if (!html && message.binary("1009")) {
    warnings.push(
      text
        ? "This message has a Rich Text (RTF) body that this tool cannot show. The Text tab shows the message without formatting."
        : "This message only has a Rich Text (RTF) body, which this tool cannot show.",
    );
  }

  const attachments: EmailAttachment[] = [];
  let embedded = 0;
  let objects = 0;
  for (const child of root.children) {
    if (child.type !== 1 || !/^__attach_version1\.0_#/i.test(child.name)) continue;
    const attach = new MapiStorage(ole, child, bodyCharset);
    const method = attach.fixed(8).get(0x37050003)?.getUint32(0, true) ?? 1;
    const data = attach.binary("3701");
    const name = attach.string("3707") || attach.string("3704") || "";
    const mimeType = attach.string("370E") || "application/octet-stream";
    const contentId = attach.string("3712").replace(/^<|>$/g, "");
    // Method 5 is an attached message and method 6 is an OLE object, such as an embedded document
    if (method === 6) {
      objects++;
      continue;
    }
    if (method === 5 || (!data && child.children.some((c) => c.type === 1))) {
      embedded++;
      continue;
    }
    if (!data) continue;
    const display = name || `attachment-${attachments.length + 1}${attach.string("3703")}`;
    attachments.push({
      name: display,
      mimeType,
      size: data.length,
      bytes: data,
      contentId,
      inline: false,
    });
  }
  markInline(html, attachments);
  if (embedded) warnings.push(`${embedded} embedded ${embedded === 1 ? "message was" : "messages were"} not listed. Open the original in Outlook to read ${embedded === 1 ? "it" : "them"}.`);
  if (objects) warnings.push(`${objects} embedded ${objects === 1 ? "object was" : "objects were"} not listed. Open the original in Outlook to see ${objects === 1 ? "it" : "them"}.`);

  return {
    format: "msg",
    subject,
    from,
    to,
    cc,
    bcc,
    replyTo: headers.length ? parseAddressList(headerValue(headers, "reply-to")) : [],
    date,
    messageId: (headerValue(headers, "message-id") || message.string("1035")).replace(/^<|>$/g, ""),
    text,
    html,
    headers: headers.length
      ? headers.map((h) => ({ name: h.name, value: decodeEncodedWords(h.value) }))
      : [],
    attachments,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const CID_REFERENCE = /\bcid:([^"'\s)>]+)/gi;

/** The Content-ID that a `cid:` reference names, in lower case. */
const cidKey = (id: string) => {
  try {
    return decodeURIComponent(id).toLowerCase();
  } catch {
    return id.toLowerCase();
  }
};

/** An image that the preview can show in place of a `cid:` reference. SVG is never inlined. */
const isInlineImage = (attachment: EmailAttachment) => Boolean(attachment.contentId) && attachment.mimeType.startsWith("image/") && !/svg/i.test(attachment.mimeType);

/**
 * Marks the attachments that the HTML body shows through `cid:` references. Every other attachment
 * stays in the list, so an image that the body does not show can still be saved.
 */
function markInline(html: string, attachments: EmailAttachment[]): void {
  const referenced = new Set(Array.from(html.matchAll(CID_REFERENCE), (match) => cidKey(match[1])));
  for (const attachment of attachments) attachment.inline = isInlineImage(attachment) && referenced.has(attachment.contentId.toLowerCase());
}

/** Replaces `cid:` image references with data URLs, so inline images show without a network. */
export function inlineCidImages(html: string, attachments: EmailAttachment[]): string {
  if (!html || !attachments.some((a) => a.contentId)) return html;
  const byId = new Map(attachments.filter((a) => a.contentId).map((a) => [a.contentId.toLowerCase(), a]));
  return html.replace(CID_REFERENCE, (match, id: string) => {
    const found = byId.get(cidKey(id));
    return found && isInlineImage(found) ? `data:${found.mimeType};base64,${toBase64(found.bytes)}` : match;
  });
}

/** True when the HTML refers to something on the network, which the preview blocks. */
// The space before and after a quote are separate groups, so a long run of spaces matches in one way only
export const hasRemoteContent = (html: string) => /\b(?:src|background|srcset)\s*=\s*(?:["']\s*)?(?:https?:)?\/\//i.test(html) || /url\(\s*(?:["']\s*)?https?:/i.test(html);

const MAX_FILE_NAME = 200;

/**
 * A file name that is safe to save and to show: no path parts, reserved characters, control
 * characters, or invisible and direction characters. A right-to-left override could show
 * `report<RLO>fdp.exe` as `reportexe.pdf`.
 */
export const safeFileName = (name: string, fallback = "attachment") => {
  const isControl = (code: number) => code < 32 || (code >= 0x7f && code <= 0x9f);
  let cleaned = Array.from(name, (ch) => (isControl(ch.charCodeAt(0)) || /[\\/:*?"<>|]/.test(ch) ? "_" : ch))
    .join("")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "")
    .replace(/^\.+/, "")
    .trim();
  if (cleaned.length > MAX_FILE_NAME) {
    // Keep the extension, so the saved file opens with the right program
    const extension = /\.[^.]{1,16}$/.exec(cleaned)?.[0] ?? "";
    cleaned = cleaned.slice(0, MAX_FILE_NAME - extension.length) + extension;
  }
  return cleaned || fallback;
};

export type EmailReadResult = { ok: true; email: ParsedEmail; html: string } | { ok: false; error: string };

/** Parses a message and inlines its cid: images. The worker and the main-thread fallback both call this. */
export function readEmailBytes(bytes: Uint8Array): EmailReadResult {
  try {
    const email = parseEmail(bytes);
    return { ok: true, email, html: inlineCidImages(email.html, email.attachments) };
  } catch (err) {
    return { ok: false, error: (err as Error).message || "The message could not be read." };
  }
}
