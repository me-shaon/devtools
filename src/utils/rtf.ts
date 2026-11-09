/**
 * Reads the compressed RTF body of an Outlook message (PidTagRtfCompressed).
 * - decompressRtf follows [MS-OXRTFCP]: LZFu with a 4096-byte dictionary, or the uncompressed MELA form.
 * - deEncapsulateRtf follows [MS-OXRTFEX]: it recovers the original HTML (\fromhtml1) or plain text (\fromtext).
 *   Plain RTF without either word is not converted.
 */

const COMPRESSED = 0x75465a4c; // "LZFu"
const UNCOMPRESSED = 0x414c454d; // "MELA"

const DICTIONARY_PREFIX =
  "{\\rtf1\\ansi\\mac\\deff0\\deftab720{\\fonttbl;}{\\f0\\fnil \\froman \\fswiss \\fmodern \\fscript \\fdecor MS Sans SerifSymbolArialTimes New RomanCourier{\\colortbl\\red0\\green0\\blue0\r\n\\par \\pard\\plain\\f0\\fs20\\b\\i\\u\\tab\\tx";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The [MS-OXRTFCP] CRC: the CRC-32 table, starting at zero, with no final inversion. */
function crc(bytes: Uint8Array): number {
  let value = 0;
  for (const byte of bytes) value = (CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)) >>> 0;
  return value;
}

/**
 * Decompresses a PidTagRtfCompressed stream. Throws on a damaged stream. `maxSize` caps the
 * declared size, so a hostile header cannot ask for a large allocation.
 */
export function decompressRtf(bytes: Uint8Array, maxSize: number): Uint8Array {
  if (bytes.length < 16) throw new Error("The RTF body is too short.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const compSize = view.getUint32(0, true);
  const rawSize = view.getUint32(4, true);
  const type = view.getUint32(8, true);
  const expectedCrc = view.getUint32(12, true);
  if (rawSize > maxSize) throw new Error("The RTF body is too large.");
  const contents = bytes.subarray(16, Math.min(bytes.length, 4 + compSize));

  if (type === UNCOMPRESSED) return contents.slice(0, rawSize);
  if (type !== COMPRESSED) throw new Error("The RTF body has an unknown compression type.");
  if (crc(contents) !== expectedCrc) throw new Error("The RTF body is damaged.");

  const dictionary = new Uint8Array(4096);
  for (let i = 0; i < DICTIONARY_PREFIX.length; i++) dictionary[i] = DICTIONARY_PREFIX.charCodeAt(i);
  let write = DICTIONARY_PREFIX.length;
  const out = new Uint8Array(rawSize);
  let length = 0;
  let at = 0;
  const put = (byte: number) => {
    // Stop at the declared size, so a stream that says more cannot grow the output
    if (length >= rawSize) throw new Error("The RTF body is larger than its header says.");
    out[length++] = byte;
    dictionary[write] = byte;
    write = (write + 1) % 4096;
  };

  while (at < contents.length) {
    const control = contents[at++];
    for (let bit = 0; bit < 8; bit++) {
      if ((control & (1 << bit)) === 0) {
        if (at >= contents.length) throw new Error("The RTF body ends early.");
        put(contents[at++]);
        continue;
      }
      if (at + 1 >= contents.length) throw new Error("The RTF body ends early.");
      const reference = (contents[at] << 8) | contents[at + 1];
      at += 2;
      let read = reference >>> 4;
      if (read === write) return out.subarray(0, length);
      const count = (reference & 0xf) + 2;
      for (let i = 0; i < count; i++) {
        put(dictionary[read]);
        read = (read + 1) % 4096;
      }
    }
  }
  throw new Error("The RTF body ends early.");
}

/** Windows code pages for the RTF \fcharsetN values. */
const CHARSET_CODEPAGES: Record<number, number> = {
  0: 1252, 128: 932, 129: 949, 134: 936, 136: 950, 161: 1253, 162: 1254, 163: 1258, 177: 1255, 178: 1256, 186: 1257, 204: 1251, 222: 874, 238: 1250,
};

const codepageDecoder = (page: number) => {
  const label = page === 65001 ? "utf-8" : page === 932 ? "shift_jis" : page === 936 ? "gbk" : page === 949 ? "euc-kr" : page === 950 ? "big5" : `windows-${page}`;
  try {
    return new TextDecoder(label);
  } catch {
    return new TextDecoder("windows-1252");
  }
};

/** Keywords that stand for one character, in RTF text and in \htmltag content. */
const SYMBOLS: Record<string, string> = {
  lquote: "‘", rquote: "’", ldblquote: "“", rdblquote: "”", bullet: "•", endash: "–", emdash: "—", emspace: " ", enspace: " ",
};

/** Destinations that hold no visible text. The font table is read for its code pages, then skipped. */
const HIDDEN_DESTINATIONS = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "listtable", "listoverridetable", "rsidtbl", "revtbl", "generator", "xmlnstbl", "themedata",
  "colorschememapping", "datastore", "latentstyles", "pgdsctbl", "mmathPr", "fldinst", "header", "footer", "headerl", "headerr", "footerl", "footerr", "pntext", "pntxta", "pntxtb",
]);

interface GroupState {
  /** Text in this group is not output: an ignorable or hidden destination. */
  skip: boolean;
  /** \htmltag content: copied to the HTML as it is. */
  htmltag: boolean;
  /** \htmlrtf is on: RTF that was not in the original HTML. */
  htmlrtf: boolean;
  /** The group is the font table, or one font entry in it. */
  fonttbl: boolean;
  codepage: number;
  /** Characters to skip after \uN. */
  uc: number;
}

export type RtfBody = { kind: "html" | "text"; value: string };

/**
 * Recovers the HTML or plain text that Outlook encapsulated in RTF. Returns null for RTF that was
 * not made from HTML or plain text. `defaultCodepage` is used when the RTF does not set \ansicpg.
 */
export function deEncapsulateRtf(rtf: Uint8Array, defaultCodepage = 1252): RtfBody | null {
  const source = rtf;
  let i = 0;

  // [MS-OXRTFEX] 2.2.3.1: look for \fromhtml1 or \fromtext in the first 10 group marks and control words
  if (!startsWith(source, "{\\rtf1")) return null;
  let kind: RtfBody["kind"] | null = null;
  for (let tokens = 0, at = 0; tokens < 10 && at < source.length; ) {
    const ch = source[at];
    if (ch === 0x7b) {
      tokens++;
      at++;
    } else if (ch === 0x5c) {
      const word = readControlWord(source, at);
      tokens++;
      at = word.end;
      if (word.name === "fromhtml" && word.param === 1) kind = "html";
      else if (word.name === "fromtext") kind = "text";
      if (kind) break;
    } else if (ch === 0x0d || ch === 0x0a || ch === 0x20) at++;
    else break;
  }
  if (!kind) return null;

  const fonts = new Map<number, number>();
  let fontId = -1;
  const stack: GroupState[] = [];
  let state: GroupState = { skip: false, htmltag: false, htmlrtf: false, fonttbl: false, codepage: defaultCodepage, uc: 1 };
  let out = "";
  let pending: number[] = [];
  let pendingCodepage = state.codepage;
  let skipChars = 0;

  const flush = () => {
    if (pending.length) out += codepageDecoder(pendingCodepage).decode(Uint8Array.from(pending));
    pending = [];
  };
  const emitByte = (byte: number) => {
    if (pending.length && pendingCodepage !== state.codepage) flush();
    pendingCodepage = state.codepage;
    pending.push(byte);
  };
  const emitText = (text: string) => {
    flush();
    out += text;
  };
  /** True when text at this point goes to the output. */
  const visible = () => !state.skip && (state.htmltag || kind === "text" || !state.htmlrtf);

  while (i < source.length) {
    const ch = source[i];
    if (ch === 0x7b) {
      stack.push(state);
      state = { ...state };
      i++;
      // A group that starts with \* is an ignorable destination. Only \htmltag is kept.
      if (source[i] === 0x5c && source[i + 1] === 0x2a) {
        let at = i + 2;
        while (source[at] === 0x20 || source[at] === 0x0d || source[at] === 0x0a) at++;
        const word = source[at] === 0x5c ? readControlWord(source, at) : null;
        if (word?.name === "htmltag" && kind === "html" && !state.skip) {
          state.htmltag = true;
          // The parameter is a flag value that the reader ignores. A space after it is a delimiter.
          i = word.end;
        } else {
          state.skip = true;
          i = at;
        }
      }
      continue;
    }
    if (ch === 0x7d) {
      state = stack.pop() ?? state;
      i++;
      continue;
    }
    if (ch === 0x0d || ch === 0x0a) {
      i++;
      continue;
    }
    if (ch !== 0x5c) {
      i++;
      if (skipChars > 0) {
        skipChars--;
        continue;
      }
      if (state.fonttbl || !visible()) continue;
      emitByte(ch);
      continue;
    }

    // A control symbol or a control word
    const next = source[i + 1];
    if (next === 0x27) {
      const byte = parseInt(String.fromCharCode(source[i + 2] ?? 0, source[i + 3] ?? 0), 16);
      i += 4;
      if (skipChars > 0) {
        skipChars--;
        continue;
      }
      if (!Number.isNaN(byte) && !state.fonttbl && visible()) emitByte(byte);
      continue;
    }
    if (next === 0x7b || next === 0x7d || next === 0x5c) {
      i += 2;
      if (skipChars > 0) {
        skipChars--;
        continue;
      }
      if (!state.fonttbl && visible()) emitByte(next);
      continue;
    }
    if (next === 0x0d || next === 0x0a) {
      // A backslash before a line break is \par
      i += 2;
      if (visible() && !state.fonttbl) emitText("\r\n");
      continue;
    }
    if (next !== undefined && !isLetter(next)) {
      i += 2;
      if (!visible() || state.fonttbl) continue;
      if (next === 0x7e) emitText(" ");
      else if (next === 0x5f) emitText("­");
      continue;
    }

    const word = readControlWord(source, i);
    i = word.end;
    const { name, param } = word;

    // Destinations that never show text
    if (HIDDEN_DESTINATIONS.has(name)) {
      if (name === "fonttbl") state.fonttbl = true;
      else state.skip = true;
      continue;
    }
    if (state.fonttbl) {
      if (name === "f" && param !== null) fontId = param;
      else if (name === "fcharset" && param !== null && fontId >= 0) fonts.set(fontId, CHARSET_CODEPAGES[param] ?? 1252);
      else if (name === "cpg" && param !== null && fontId >= 0) fonts.set(fontId, param);
      continue;
    }
    switch (name) {
      case "ansicpg":
        if (param !== null) {
          defaultCodepage = param;
          state.codepage = param;
        }
        continue;
      case "f":
        // Track the font even where \htmlrtf hides the text, so later text uses the right code page
        if (param !== null) state.codepage = fonts.get(param) ?? defaultCodepage;
        continue;
      case "htmlrtf":
        state.htmlrtf = param !== 0;
        continue;
      case "uc":
        state.uc = Math.max(0, param ?? 1);
        continue;
      case "u":
        if (param !== null) {
          if (visible()) emitText(String.fromCharCode(param < 0 ? param + 65536 : param));
          skipChars = state.uc;
        }
        continue;
      case "par":
      case "line":
        if (visible()) emitText("\r\n");
        continue;
      case "tab":
        if (visible()) emitText("\t");
        continue;
      default:
        if (SYMBOLS[name] && visible()) emitText(SYMBOLS[name]);
    }
  }
  flush();
  return { kind, value: out };
}

const isLetter = (byte: number) => (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a);

const startsWith = (bytes: Uint8Array, text: string) => Array.from(text).every((ch, index) => bytes[index] === ch.charCodeAt(0));

/** Reads `\name[-]digits[ ]` at `at`. The space after a control word is part of it. */
function readControlWord(source: Uint8Array, at: number): { name: string; param: number | null; end: number } {
  let i = at + 1;
  let name = "";
  while (i < source.length && isLetter(source[i]) && name.length < 32) name += String.fromCharCode(source[i++]);
  let digits = "";
  if (source[i] === 0x2d && source[i + 1] >= 0x30 && source[i + 1] <= 0x39) digits += String.fromCharCode(source[i++]);
  while (i < source.length && source[i] >= 0x30 && source[i] <= 0x39 && digits.length < 11) digits += String.fromCharCode(source[i++]);
  if (source[i] === 0x20) i++;
  return { name, param: digits && digits !== "-" ? Number(digits) : null, end: i };
}
