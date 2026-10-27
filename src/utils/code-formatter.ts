export type CodeLanguage = "html" | "css" | "javascript" | "xml" | "sql";
export type FormatMode = "beautify" | "minify";
export type IndentChoice = "2" | "4" | "tab";
export type SqlDialect = "sql" | "postgresql" | "mysql" | "sqlite";

export interface CodeFormatOptions {
  language: CodeLanguage;
  mode: FormatMode;
  indent: IndentChoice;
  /** Only used for SQL. */
  dialect?: SqlDialect;
}

const indentOptions = (indent: IndentChoice) =>
  indent === "tab"
    ? { indent_size: 1, indent_char: "\t", indent_with_tabs: true }
    : { indent_size: Number(indent), indent_char: " ", indent_with_tabs: false };

/** Loads js-beautify on demand so it stays out of other chunks. It is a CommonJS module. */
const loadBeautify = async () => {
  const mod = await import("js-beautify");
  return (mod as unknown as { default?: typeof mod }).default ?? mod;
};

/** Keeps the first line of a library error. sql-formatter adds a long grammar trace after it. */
const firstLine = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : "";
  return message.split("\n")[0].trim() || fallback;
};

/** Beautifies or minifies `input`. Libraries load on first use. Throws an Error with a short message on invalid input. */
export async function formatCode(input: string, options: CodeFormatOptions): Promise<string> {
  if (!input.trim()) return "";
  const { language, mode, indent } = options;

  if (mode === "minify") {
    switch (language) {
      case "css":
        return minifyCss(input);
      case "html":
        return minifyHtml(input);
      case "xml":
        return minifyXml(input);
      case "sql":
        return minifySql(input);
      case "javascript":
        return minifyJs(input);
    }
  }

  if (language === "sql") {
    const { format } = await import("sql-formatter");
    try {
      return format(input, {
        language: options.dialect ?? "sql",
        tabWidth: indent === "tab" ? 2 : Number(indent),
        useTabs: indent === "tab",
      });
    } catch (error) {
      throw new Error(firstLine(error, "Could not parse the SQL."));
    }
  }

  const beautify = await loadBeautify();
  const base = { ...indentOptions(indent), end_with_newline: false, preserve_newlines: true, max_preserve_newlines: 2 };
  switch (language) {
    case "html":
      return beautify.html(input, { ...base, indent_inner_html: false, wrap_line_length: 0 });
    case "xml":
      // The HTML beautifier handles XML well enough when it treats no element as inline.
      return beautify.html(input, { ...base, inline: [], unformatted: [], content_unformatted: [], wrap_line_length: 0 });
    case "css":
      return beautify.css(input, base);
    default:
      return beautify.js(input, base);
  }
}

/* ------------------------------------------------------------------ CSS */

/** Removes comments and extra whitespace from CSS. Strings stay as they are. */
export function minifyCss(input: string): string {
  let out = "";
  let pendingSpace = false;
  // True when the last thing written was a structural ";", so ";}" can drop the ";".
  let lastSemicolon = false;
  const dropBefore = "{};,>)";
  const dropAfter = "{};,>:(";

  const emit = (text: string) => {
    if (pendingSpace && out && !dropAfter.includes(out[out.length - 1]) && !dropBefore.includes(text[0])) out += " ";
    pendingSpace = false;
    out += text;
  };

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      if (end === -1) throw new Error("Unterminated comment in the CSS.");
      i = end + 1;
      pendingSpace = true;
      continue;
    }
    if (/\s/.test(c)) {
      pendingSpace = true;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < input.length && input[j] !== c) {
        if (input[j] === "\\") j++;
        else if (input[j] === "\n") throw new Error("Unterminated string in the CSS.");
        j++;
      }
      if (j >= input.length) throw new Error("Unterminated string in the CSS.");
      emit(input.slice(i, j + 1));
      lastSemicolon = false;
      i = j;
      continue;
    }
    if (c === "}" && lastSemicolon) out = out.slice(0, -1);
    emit(c);
    lastSemicolon = c === ";";
  }
  return out.trim();
}

/* -------------------------------------------------------- HTML and XML */

type MarkupToken = { kind: "tag" | "text" | "comment" | "raw"; text: string; name?: string; closing?: boolean };

const RAW_TEXT = new Set(["script", "style", "pre", "textarea"]);

const BLOCK = new Set([
  "html", "head", "body", "title", "meta", "link", "script", "style", "base", "noscript",
  "div", "p", "section", "article", "aside", "header", "footer", "nav", "main", "form", "fieldset",
  "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
  "colgroup", "col", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "br", "blockquote", "figure", "figcaption",
  "pre", "address", "details", "summary", "dialog", "template", "option", "optgroup", "select", "!doctype",
]);

/** Splits markup into tags, text, comments, and raw sections. Quoted attribute values may contain ">". */
function tokenizeMarkup(input: string, html: boolean): MarkupToken[] {
  const tokens: MarkupToken[] = [];
  let i = 0;
  while (i < input.length) {
    if (input.startsWith("<!--", i)) {
      const end = input.indexOf("-->", i + 4);
      if (end === -1) throw new Error("Unterminated comment.");
      tokens.push({ kind: "comment", text: input.slice(i, end + 3) });
      i = end + 3;
      continue;
    }
    if (input.startsWith("<![CDATA[", i)) {
      const end = input.indexOf("]]>", i);
      if (end === -1) throw new Error("Unterminated CDATA section.");
      tokens.push({ kind: "raw", text: input.slice(i, end + 3) });
      i = end + 3;
      continue;
    }
    if (input[i] === "<" && /[A-Za-z/!?]/.test(input[i + 1] ?? "")) {
      let j = i + 1;
      let quote = "";
      while (j < input.length) {
        const c = input[j];
        if (quote) {
          if (c === quote) quote = "";
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === ">") {
          break;
        }
        j++;
      }
      if (j >= input.length) throw new Error("Unterminated tag.");
      const raw = input.slice(i, j + 1);
      const match = /^<(\/?)([^\s/>]+)/.exec(raw);
      const name = match ? match[2].toLowerCase() : "";
      const closing = Boolean(match?.[1]);
      tokens.push({ kind: "tag", text: raw, name, closing });
      i = j + 1;
      if (html && !closing && RAW_TEXT.has(name) && !raw.endsWith("/>")) {
        const close = input.toLowerCase().indexOf(`</${name}`, i);
        const end = close === -1 ? input.length : close;
        if (end > i) tokens.push({ kind: "raw", text: input.slice(i, end) });
        i = end;
      }
      continue;
    }
    const next = input.indexOf("<", i + 1);
    const end = next === -1 ? input.length : next;
    tokens.push({ kind: "text", text: input.slice(i, end) });
    i = end;
  }
  return tokens;
}

/** Collapses whitespace inside a tag but not inside quoted attribute values. */
function compactTag(tag: string): string {
  if (tag.startsWith("<?") || tag.startsWith("<!")) return tag.replace(/\s+/g, " ");
  let out = "";
  let quote = "";
  let space = false;
  for (const c of tag) {
    if (quote) {
      out += c;
      if (c === quote) quote = "";
      continue;
    }
    if (/\s/.test(c)) {
      space = true;
      continue;
    }
    if (space && c !== ">" && c !== "/" && c !== "=" && !out.endsWith("=")) out += " ";
    if (space && c === "/" && !out.endsWith("<")) out += " ";
    space = false;
    if (c === '"' || c === "'") quote = c;
    out += c;
  }
  // "<br />" keeps its space, because an unquoted value would otherwise absorb the slash.
  return out;
}

/** Removes comments and collapses whitespace in HTML. Content of pre, textarea, script, and style stays as it is. */
export function minifyHtml(input: string): string {
  const tokens = tokenizeMarkup(input, true).filter(
    (t) => t.kind !== "comment" || t.text.startsWith("<!--[if") || t.text.startsWith("<!--<!"),
  );
  let out = "";
  tokens.forEach((token, index) => {
    if (token.kind === "tag") {
      out += compactTag(token.text);
      return;
    }
    if (token.kind !== "text") {
      out += token.text;
      return;
    }
    const collapsed = token.text.replace(/\s+/g, " ");
    if (collapsed !== " ") {
      out += collapsed;
      return;
    }
    // Whitespace next to a block element does not render, so drop it. Keep one space between inline content.
    const prev = tokens[index - 1];
    const next = tokens[index + 1];
    const isBlock = (t?: MarkupToken) => !t || (t.kind === "tag" && BLOCK.has(t.name ?? "")) || t.kind === "comment";
    if (!isBlock(prev) && !isBlock(next)) out += " ";
  });
  return out.trim();
}

/** Removes comments and whitespace-only text between XML tags. Text with content stays as it is. */
export function minifyXml(input: string): string {
  let out = "";
  for (const token of tokenizeMarkup(input, false)) {
    if (token.kind === "comment") continue;
    if (token.kind === "tag") out += compactTag(token.text);
    else if (token.kind === "text") out += token.text.trim() ? token.text : "";
    else out += token.text;
  }
  return out.trim();
}

/* ------------------------------------------------------------------ SQL */

/** Removes comments and collapses whitespace in SQL. Quoted strings, identifiers, and dollar-quoted bodies stay as they are. */
export function minifySql(input: string): string {
  let out = "";
  let pendingSpace = false;
  const tight = "(),;";
  const emit = (text: string) => {
    if (pendingSpace && out && !"(,".includes(out[out.length - 1]) && !tight.includes(text[0])) out += " ";
    pendingSpace = false;
    out += text;
  };

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "-" && input[i + 1] === "-") {
      const end = input.indexOf("\n", i);
      i = end === -1 ? input.length : end;
      pendingSpace = true;
      continue;
    }
    if (c === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      if (end === -1) throw new Error("Unterminated comment in the SQL.");
      i = end + 1;
      pendingSpace = true;
      continue;
    }
    if (/\s/.test(c)) {
      pendingSpace = true;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      while (j < input.length) {
        if (input[j] === "\\" && c === "'") j++;
        else if (input[j] === c) {
          if (input[j + 1] === c) j++;
          else break;
        }
        j++;
      }
      if (j >= input.length) throw new Error("Unterminated quoted value in the SQL.");
      emit(input.slice(i, j + 1));
      i = j;
      continue;
    }
    if (c === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(input.slice(i));
      if (tag) {
        const end = input.indexOf(tag[0], i + tag[0].length);
        if (end === -1) throw new Error("Unterminated dollar-quoted string in the SQL.");
        emit(input.slice(i, end + tag[0].length));
        i = end + tag[0].length - 1;
        continue;
      }
    }
    // Keep words together so "SELECT a" never becomes "SELECTa".
    if (/[\w$#@.]/.test(c)) {
      let j = i;
      while (j < input.length && /[\w$#@.]/.test(input[j])) j++;
      emit(input.slice(i, j));
      i = j - 1;
      continue;
    }
    emit(c);
  }
  return out.trim();
}

/* ------------------------------------------------------------ JavaScript */

type JsKind = "word" | "number" | "string" | "template" | "regex" | "punct";
interface JsToken {
  kind: JsKind;
  text: string;
  /** Whitespace before this token: none, spaces only, or at least one line break. */
  gap: "" | " " | "\n";
}

const REGEX_AFTER_WORD = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await",
]);

const isWordChar = (c: string | undefined) => !!c && (/[\w$\\#]/.test(c) || c.charCodeAt(0) > 127);

/** Tokenizes JavaScript well enough to strip comments and whitespace without touching strings, templates, or regex literals. */
function tokenizeJs(input: string): JsToken[] {
  const tokens: JsToken[] = [];
  // "brace" for a normal block, "template" for a ${ } expression inside a template literal.
  const braces: ("brace" | "template")[] = [];
  let gap: JsToken["gap"] = "";
  let i = 0;

  const push = (kind: JsKind, text: string) => {
    tokens.push({ kind, text, gap });
    gap = "";
  };
  const addGap = (text: string) => {
    if (text.includes("\n") || text.includes("\r") || text.includes(" ") || text.includes(" ")) gap = "\n";
    else if (gap === "") gap = " ";
  };

  const regexAllowed = () => {
    const prev = tokens[tokens.length - 1];
    if (!prev) return true;
    if (prev.kind === "word") return REGEX_AFTER_WORD.has(prev.text);
    if (prev.kind === "template") return prev.text.endsWith("${");
    if (prev.kind !== "punct") return false;
    return ![")", "]", "++", "--"].includes(prev.text);
  };

  // Reads template text from `start` (just after "`" or "}") up to the closing "`" or the next "${".
  const readTemplate = (start: number) => {
    let j = start;
    while (j < input.length) {
      if (input[j] === "\\") j += 2;
      else if (input[j] === "`") return { end: j + 1, opens: false };
      else if (input[j] === "$" && input[j + 1] === "{") return { end: j + 2, opens: true };
      else j++;
    }
    throw new Error("Unterminated template literal.");
  };

  if (input.startsWith("#!")) {
    const end = input.indexOf("\n");
    push("punct", end === -1 ? input : input.slice(0, end));
    gap = "\n";
    i = end === -1 ? input.length : end;
  }

  while (i < input.length) {
    const c = input[i];
    const next = input[i + 1];

    if (/\s/.test(c)) {
      let j = i;
      while (j < input.length && /\s/.test(input[j])) j++;
      addGap(input.slice(i, j));
      i = j;
      continue;
    }
    if (c === "/" && next === "/") {
      const end = input.indexOf("\n", i);
      gap = "\n";
      i = end === -1 ? input.length : end;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = input.indexOf("*/", i + 2);
      if (end === -1) throw new Error("Unterminated comment.");
      addGap(input.slice(i, end + 2));
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < input.length && input[j] !== c) {
        if (input[j] === "\\") j++;
        else if (input[j] === "\n") throw new Error("Unterminated string literal.");
        j++;
      }
      if (j >= input.length) throw new Error("Unterminated string literal.");
      push("string", input.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (c === "`") {
      const { end, opens } = readTemplate(i + 1);
      if (opens) braces.push("template");
      push("template", input.slice(i, end));
      i = end;
      continue;
    }
    if (c === "{") {
      braces.push("brace");
      push("punct", c);
      i++;
      continue;
    }
    if (c === "}") {
      if (braces.pop() === "template") {
        const { end, opens } = readTemplate(i + 1);
        if (opens) braces.push("template");
        push("template", input.slice(i, end));
        i = end;
      } else {
        push("punct", c);
        i++;
      }
      continue;
    }
    if (c === "/" && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      while (j < input.length) {
        const ch = input[j];
        if (ch === "\n") throw new Error("Unterminated regular expression.");
        if (ch === "\\") j++;
        else if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) break;
        j++;
      }
      if (j >= input.length) throw new Error("Unterminated regular expression.");
      j++;
      while (j < input.length && /[a-z]/i.test(input[j])) j++;
      push("regex", input.slice(i, j));
      i = j;
      continue;
    }
    if (/\d/.test(c) || (c === "." && /\d/.test(next ?? ""))) {
      let j = i;
      while (j < input.length) {
        const ch = input[j];
        if (/[\w.]/.test(ch)) j++;
        else if ((ch === "+" || ch === "-") && /[eE]/.test(input[j - 1]) && !/^0[xX]/.test(input.slice(i, j))) j++;
        else break;
      }
      push("number", input.slice(i, j));
      i = j;
      continue;
    }
    if (isWordChar(c)) {
      let j = i;
      while (j < input.length && isWordChar(input[j])) {
        if (input[j] === "\\") j++;
        j++;
      }
      push("word", input.slice(i, j));
      i = j;
      continue;
    }
    if ((c === "+" || c === "-") && next === c) {
      push("punct", c + c);
      i += 2;
      continue;
    }
    push("punct", c);
    i++;
  }
  return tokens;
}

/** Previous token endings after which a line break can never end a statement. */
const JOIN_AFTER = new Set(["{", "(", "[", ",", ";", ":", "=", "+", "-", "*", "%", "&", "|", "^", "!", "~", "<", ">", "?", "."]);
/** Next token starts before which a line break can be dropped safely. */
const JOIN_BEFORE = new Set(["}", ")", "]", ",", ";", ":", "?", "=", "."]);

const needsSpace = (prev: JsToken, next: JsToken) => {
  const a = prev.text[prev.text.length - 1];
  const b = next.text[0];
  if (prev.kind === "number" && (isWordChar(b) || b === ".")) return true;
  if (prev.kind === "regex" && isWordChar(b)) return true;
  if (isWordChar(a) && isWordChar(b)) return true;
  if ((a === "+" || a === "-") && b === a) return true;
  if (a === "/" && (b === "/" || b === "*")) return true;
  if (a === "<" && b === "!") return true;
  if (a === "-" && b === ">") return true;
  return false;
};

/**
 * Removes comments and whitespace from JavaScript. It is conservative: it keeps a line break wherever
 * removing it could change how semicolons are inserted. It does not rename or rewrite code.
 */
export function minifyJs(input: string): string {
  const tokens = tokenizeJs(input);
  let out = "";
  tokens.forEach((token, index) => {
    const prev = tokens[index - 1];
    if (prev && token.gap) {
      const prevIsOperator = prev.kind === "punct" && JOIN_AFTER.has(prev.text);
      const canJoin =
        token.gap === " " ||
        prevIsOperator ||
        (JOIN_BEFORE.has(token.text[0]) && token.kind === "punct");
      if (!canJoin) out += "\n";
      else if (needsSpace(prev, token)) out += " ";
    } else if (prev && needsSpace(prev, token)) {
      out += " ";
    }
    out += token.text;
  });
  return out;
}
