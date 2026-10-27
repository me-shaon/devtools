/**
 * Escape Tools utilities: HTML entities, backslash string escapes, Unicode
 * escapes, and hex bytes. Every function is pure and needs no DOM.
 */

export type EscapeResult = { ok: true; value: string } | { ok: false; error: string };

const ok = (value: string): EscapeResult => ({ ok: true, value });
const fail = (error: string): EscapeResult => ({ ok: false, error });

const hex = (n: number, width: number) => n.toString(16).toUpperCase().padStart(width, "0");

/* ------------------------------------------------------------------ HTML */

export interface HtmlEncodeOptions {
  /** Also write every non-ASCII character as a numeric entity, e.g. `&#xE9;`. */
  nonAscii?: boolean;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape text for HTML content and attribute values. */
export function encodeHtml(text: string, options: HtmlEncodeOptions = {}): string {
  const escaped = text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
  if (!options.nonAscii) return escaped;
  return escaped.replace(/[^\p{ASCII}]/gu, (c) => `&#x${hex(c.codePointAt(0) ?? 0, 1)};`);
}

/**
 * Named entities the decoder knows. This covers markup, typography, currency,
 * Latin-1, arrows, math, and Greek letters, not the full HTML5 list.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00A0",
  iexcl: "¡", cent: "¢", pound: "£", curren: "¤", yen: "¥", brvbar: "¦", sect: "§", uml: "¨",
  copy: "©", ordf: "ª", laquo: "«", not: "¬", shy: "\u00AD", reg: "®", macr: "¯", deg: "°",
  plusmn: "±", sup2: "²", sup3: "³", acute: "´", micro: "µ", para: "¶", middot: "·", cedil: "¸",
  sup1: "¹", ordm: "º", raquo: "»", frac14: "¼", frac12: "½", frac34: "¾", iquest: "¿",
  Agrave: "À", Aacute: "Á", Acirc: "Â", Atilde: "Ã", Auml: "Ä", Aring: "Å", AElig: "Æ", Ccedil: "Ç",
  Egrave: "È", Eacute: "É", Ecirc: "Ê", Euml: "Ë", Igrave: "Ì", Iacute: "Í", Icirc: "Î", Iuml: "Ï",
  ETH: "Ð", Ntilde: "Ñ", Ograve: "Ò", Oacute: "Ó", Ocirc: "Ô", Otilde: "Õ", Ouml: "Ö", times: "×",
  Oslash: "Ø", Ugrave: "Ù", Uacute: "Ú", Ucirc: "Û", Uuml: "Ü", Yacute: "Ý", THORN: "Þ", szlig: "ß",
  agrave: "à", aacute: "á", acirc: "â", atilde: "ã", auml: "ä", aring: "å", aelig: "æ", ccedil: "ç",
  egrave: "è", eacute: "é", ecirc: "ê", euml: "ë", igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
  eth: "ð", ntilde: "ñ", ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö", divide: "÷",
  oslash: "ø", ugrave: "ù", uacute: "ú", ucirc: "û", uuml: "ü", yacute: "ý", thorn: "þ", yuml: "ÿ",
  OElig: "Œ", oelig: "œ", Scaron: "Š", scaron: "š", Yuml: "Ÿ", fnof: "ƒ", circ: "ˆ", tilde: "˜",
  ensp: "\u2002", emsp: "\u2003", thinsp: "\u2009", zwnj: "\u200C", zwj: "\u200D", lrm: "\u200E", rlm: "\u200F",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„",
  dagger: "†", Dagger: "‡", bull: "•", hellip: "…", permil: "‰", prime: "′", Prime: "″",
  lsaquo: "‹", rsaquo: "›", oline: "‾", frasl: "⁄", euro: "€", trade: "™", larr: "←", uarr: "↑",
  rarr: "→", darr: "↓", harr: "↔", crarr: "↵", lArr: "⇐", uArr: "⇑", rArr: "⇒", dArr: "⇓", hArr: "⇔",
  forall: "∀", part: "∂", exist: "∃", empty: "∅", nabla: "∇", isin: "∈", notin: "∉", ni: "∋",
  prod: "∏", sum: "∑", minus: "−", lowast: "∗", radic: "√", prop: "∝", infin: "∞", ang: "∠",
  and: "∧", or: "∨", cap: "∩", cup: "∪", int: "∫", there4: "∴", sim: "∼", cong: "≅", asymp: "≈",
  ne: "≠", equiv: "≡", le: "≤", ge: "≥", sub: "⊂", sup: "⊃", nsub: "⊄", sube: "⊆", supe: "⊇",
  oplus: "⊕", otimes: "⊗", perp: "⊥", sdot: "⋅", lceil: "⌈", rceil: "⌉", lfloor: "⌊", rfloor: "⌋",
  lang: "⟨", rang: "⟩", loz: "◊", spades: "♠", clubs: "♣", hearts: "♥", diams: "♦",
  Alpha: "Α", Beta: "Β", Gamma: "Γ", Delta: "Δ", Epsilon: "Ε", Zeta: "Ζ", Eta: "Η", Theta: "Θ",
  Iota: "Ι", Kappa: "Κ", Lambda: "Λ", Mu: "Μ", Nu: "Ν", Xi: "Ξ", Omicron: "Ο", Pi: "Π", Rho: "Ρ",
  Sigma: "Σ", Tau: "Τ", Upsilon: "Υ", Phi: "Φ", Chi: "Χ", Psi: "Ψ", Omega: "Ω",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", eta: "η", theta: "θ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο", pi: "π", rho: "ρ",
  sigmaf: "ς", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  thetasym: "ϑ", upsih: "ϒ", piv: "ϖ", Tab: "\t", NewLine: "\n", grave: "`", colon: ":", comma: ",",
  period: ".", excl: "!", quest: "?", num: "#", dollar: "$", percnt: "%", lpar: "(", rpar: ")",
  ast: "*", plus: "+", sol: "/", bsol: "\\", semi: ";", equals: "=", commat: "@", lsqb: "[",
  rsqb: "]", lowbar: "_", lcub: "{", rcub: "}", verbar: "|", vert: "|", Hat: "^", check: "✓", cross: "✗",
};

/**
 * Decode named and numeric HTML character references without a DOM, so no
 * markup is ever parsed or run. Unknown names stay as written. Numeric
 * references to 0, to surrogates, or past U+10FFFF become U+FFFD, as browsers do.
 */
export function decodeHtml(text: string): string {
  return text.replace(/&(?:#[xX]([0-9a-fA-F]+)|#([0-9]+)|([A-Za-z][A-Za-z0-9]*));/g, (match, hexDigits, decDigits, name) => {
    if (name !== undefined) {
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : match;
    }
    const codePoint = hexDigits !== undefined ? parseInt(hexDigits, 16) : parseInt(decDigits, 10);
    if (!Number.isFinite(codePoint) || codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return "�";
    }
    return String.fromCodePoint(codePoint);
  });
}

/* ------------------------------------------------------------- Backslash */

/**
 * Escape text for a JavaScript or JSON string literal (without the quotes).
 * Double quotes, backslashes, and control characters are escaped. Line and
 * paragraph separators are escaped too, so the output is safe in old JS engines.
 */
export function encodeBackslash(text: string): string {
  return JSON.stringify(text).slice(1, -1).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

const SIMPLE_ESCAPES: Record<string, string> = {
  n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0", "'": "'", '"': '"', "\\": "\\", "/": "/", "`": "`",
};

interface UnicodeEscape {
  value: string;
  length: number;
}

/** Read `\uXXXX` or `\u{X…}` at `index` (pointing at the backslash). */
function readUnicodeEscape(text: string, index: number): UnicodeEscape | string {
  if (text[index + 2] === "{") {
    const close = text.indexOf("}", index + 3);
    const digits = close === -1 ? "" : text.slice(index + 3, close);
    if (!/^[0-9a-fA-F]{1,6}$/.test(digits)) return `Invalid \\u{…} escape at position ${index + 1}. Use 1 to 6 hex digits.`;
    const codePoint = parseInt(digits, 16);
    if (codePoint > 0x10ffff) return `Code point ${digits} at position ${index + 1} is past U+10FFFF.`;
    return { value: String.fromCodePoint(codePoint), length: close - index + 1 };
  }
  const digits = text.slice(index + 2, index + 6);
  if (!/^[0-9a-fA-F]{4}$/.test(digits)) return `Invalid \\u escape at position ${index + 1}. Use exactly 4 hex digits.`;
  return { value: String.fromCharCode(parseInt(digits, 16)), length: 6 };
}

/** Decode JavaScript and JSON string escapes. Unknown escapes such as `\q` yield the character itself. */
export function decodeBackslash(text: string): EscapeResult {
  const out: string[] = [];
  let start = 0;
  for (let i = text.indexOf("\\"); i !== -1; i = text.indexOf("\\", start)) {
    out.push(text.slice(start, i));
    const next = text[i + 1];
    if (next === undefined) return fail(`The text ends with a lone backslash at position ${i + 1}.`);
    if (next === "u") {
      const escape = readUnicodeEscape(text, i);
      if (typeof escape === "string") return fail(escape);
      out.push(escape.value);
      start = i + escape.length;
    } else if (next === "x") {
      const digits = text.slice(i + 2, i + 4);
      if (!/^[0-9a-fA-F]{2}$/.test(digits)) return fail(`Invalid \\x escape at position ${i + 1}. Use exactly 2 hex digits.`);
      out.push(String.fromCharCode(parseInt(digits, 16)));
      start = i + 4;
    } else if (next === "\r" || next === "\n") {
      // A line continuation: the backslash and the line break are dropped.
      start = i + (next === "\r" && text[i + 2] === "\n" ? 3 : 2);
    } else {
      out.push(SIMPLE_ESCAPES[next] ?? next);
      start = i + 2;
    }
  }
  out.push(text.slice(start));
  return ok(out.join(""));
}

/* --------------------------------------------------------------- Unicode */

export interface UnicodeEncodeOptions {
  /** Write astral characters as `\u{1F600}` instead of a surrogate pair. */
  braces?: boolean;
  /** Escape ASCII characters too, not only non-ASCII ones. */
  all?: boolean;
}

/** Write non-ASCII characters (or all characters) as `\uXXXX` escapes. */
export function encodeUnicode(text: string, options: UnicodeEncodeOptions = {}): string {
  const out: string[] = [];
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint < 0x80 && !options.all) {
      out.push(char);
    } else if (codePoint > 0xffff && options.braces) {
      out.push(`\\u{${hex(codePoint, 1)}}`);
    } else {
      for (let i = 0; i < char.length; i++) out.push(`\\u${hex(char.charCodeAt(i), 4)}`);
    }
  }
  return out.join("");
}

/** Decode `\uXXXX` and `\u{…}` escapes. Other text, including other backslashes, is kept. */
export function decodeUnicode(text: string): EscapeResult {
  const out: string[] = [];
  let start = 0;
  for (let i = text.indexOf("\\u"); i !== -1; i = text.indexOf("\\u", start)) {
    out.push(text.slice(start, i));
    const escape = readUnicodeEscape(text, i);
    if (typeof escape === "string") return fail(escape);
    out.push(escape.value);
    start = i + escape.length;
  }
  out.push(text.slice(start));
  return ok(out.join(""));
}

/* ------------------------------------------------------------------- Hex */

export interface HexEncodeOptions {
  /** Put a space between bytes. */
  spaced?: boolean;
  uppercase?: boolean;
}

/** Write the UTF-8 bytes of the text as hex. */
export function encodeHex(text: string, options: HexEncodeOptions = {}): string {
  const bytes = new TextEncoder().encode(text);
  const parts = new Array<string>(bytes.length);
  for (let i = 0; i < bytes.length; i++) parts[i] = bytes[i].toString(16).padStart(2, "0");
  const joined = parts.join(options.spaced ? " " : "");
  return options.uppercase ? joined.toUpperCase() : joined;
}

/**
 * Read hex bytes as UTF-8 text. Whitespace, `0x` and `\x` prefixes, and
 * `:`, `,`, or `-` separators are ignored.
 */
export function decodeHex(text: string): EscapeResult {
  const digits = text.replace(/0x|\\x/gi, "").replace(/[\s:,-]/g, "");
  const bad = digits.search(/[^0-9a-fA-F]/);
  if (bad !== -1) return fail(`Invalid hex character "${digits[bad]}". Use only 0-9 and A-F.`);
  if (digits.length % 2 !== 0) return fail(`Hex input has ${digits.length} digits. Each byte needs 2 digits, so the count must be even.`);
  const bytes = new Uint8Array(digits.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(digits.slice(i * 2, i * 2 + 2), 16);
  try {
    return ok(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    return fail("The bytes are not valid UTF-8 text.");
  }
}
