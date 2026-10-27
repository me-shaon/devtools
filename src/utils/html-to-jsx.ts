/**
 * Converts HTML markup to JSX. The markup is parsed into an inert document
 * that is never attached to the page, so scripts do not run and nothing loads.
 */

export interface HtmlToJsxOptions {
  /** Wrap the JSX in `export function Name() { return (...) }`. */
  component?: boolean;
  /** Name of the wrapping component. Must be a PascalCase identifier. */
  componentName?: string;
}

export type HtmlToJsxResult = { ok: true; value: string; handlers: number } | { ok: false; error: string };

const INDENT = "  ";
const LINE_WIDTH = 80;
const SVG_NS = "http://www.w3.org/2000/svg";

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

/** Elements whose text content is kept exactly as written. */
const RAW_TEXT_ELEMENTS = new Set(["pre", "textarea", "script", "style", "listing", "xmp", "plaintext"]);

const BOOLEAN_ATTRIBUTES = new Set([
  "allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "defer", "disabled",
  "formnovalidate", "hidden", "inert", "ismap", "itemscope", "loop", "multiple", "muted", "nomodule", "novalidate",
  "open", "playsinline", "readonly", "required", "reversed", "selected",
]);

/** HTML attribute names that React spells differently. */
const HTML_ATTRIBUTES: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  "accept-charset": "acceptCharset",
  accesskey: "accessKey",
  allowfullscreen: "allowFullScreen",
  autocapitalize: "autoCapitalize",
  autocomplete: "autoComplete",
  autofocus: "autoFocus",
  autoplay: "autoPlay",
  cellpadding: "cellPadding",
  cellspacing: "cellSpacing",
  charset: "charSet",
  colspan: "colSpan",
  contenteditable: "contentEditable",
  contextmenu: "contextMenu",
  controlslist: "controlsList",
  crossorigin: "crossOrigin",
  datetime: "dateTime",
  enctype: "encType",
  enterkeyhint: "enterKeyHint",
  fetchpriority: "fetchPriority",
  formaction: "formAction",
  formenctype: "formEncType",
  formmethod: "formMethod",
  formnovalidate: "formNoValidate",
  formtarget: "formTarget",
  frameborder: "frameBorder",
  hreflang: "hrefLang",
  "http-equiv": "httpEquiv",
  inputmode: "inputMode",
  itemid: "itemID",
  itemprop: "itemProp",
  itemref: "itemRef",
  itemscope: "itemScope",
  itemtype: "itemType",
  marginheight: "marginHeight",
  marginwidth: "marginWidth",
  maxlength: "maxLength",
  mediagroup: "mediaGroup",
  minlength: "minLength",
  nomodule: "noModule",
  novalidate: "noValidate",
  playsinline: "playsInline",
  popovertarget: "popoverTarget",
  popovertargetaction: "popoverTargetAction",
  readonly: "readOnly",
  referrerpolicy: "referrerPolicy",
  rowspan: "rowSpan",
  spellcheck: "spellCheck",
  srcdoc: "srcDoc",
  srclang: "srcLang",
  srcset: "srcSet",
  tabindex: "tabIndex",
  usemap: "useMap",
};

/** DOM event names whose React prop is not simply `on` + the capitalized name. */
const EVENT_NAMES: Record<string, string> = {
  dblclick: "DoubleClick",
  doubleclick: "DoubleClick",
  contextmenu: "ContextMenu",
  mousedown: "MouseDown",
  mouseup: "MouseUp",
  mouseover: "MouseOver",
  mouseout: "MouseOut",
  mousemove: "MouseMove",
  mouseenter: "MouseEnter",
  mouseleave: "MouseLeave",
  keydown: "KeyDown",
  keyup: "KeyUp",
  keypress: "KeyPress",
  focusin: "Focus",
  focusout: "Blur",
  dragstart: "DragStart",
  dragend: "DragEnd",
  dragenter: "DragEnter",
  dragleave: "DragLeave",
  dragover: "DragOver",
  dragexit: "DragExit",
  touchstart: "TouchStart",
  touchend: "TouchEnd",
  touchmove: "TouchMove",
  touchcancel: "TouchCancel",
  pointerdown: "PointerDown",
  pointerup: "PointerUp",
  pointermove: "PointerMove",
  pointerover: "PointerOver",
  pointerout: "PointerOut",
  pointerenter: "PointerEnter",
  pointerleave: "PointerLeave",
  pointercancel: "PointerCancel",
  gotpointercapture: "GotPointerCapture",
  lostpointercapture: "LostPointerCapture",
  animationstart: "AnimationStart",
  animationend: "AnimationEnd",
  animationiteration: "AnimationIteration",
  transitionend: "TransitionEnd",
  beforeinput: "BeforeInput",
  compositionstart: "CompositionStart",
  compositionend: "CompositionEnd",
  compositionupdate: "CompositionUpdate",
  canplay: "CanPlay",
  canplaythrough: "CanPlayThrough",
  durationchange: "DurationChange",
  loadeddata: "LoadedData",
  loadedmetadata: "LoadedMetadata",
  loadstart: "LoadStart",
  ratechange: "RateChange",
  timeupdate: "TimeUpdate",
  volumechange: "VolumeChange",
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** `stroke-width` → `strokeWidth`, `xlink:href` → `xlinkHref`. */
const camelCase = (value: string) => value.replace(/[-:]([a-z0-9])/gi, (_, c: string) => c.toUpperCase());

/** Converts a CSS property name to a React style key. Custom properties stay as written. */
export function cssPropertyToKey(property: string): string {
  const name = property.trim();
  if (name.startsWith("--")) return name;
  const lower = name.toLowerCase();
  if (lower.startsWith("-ms-")) return camelCase(lower.slice(1));
  if (lower.startsWith("-")) return capitalize(camelCase(lower.slice(1)));
  return camelCase(lower);
}

/** Splits a declaration list at semicolons that are outside quotes and parentheses. */
const splitDeclarations = (css: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (ch === "\\") {
        current += ch + (css[i + 1] ?? "");
        i++;
        continue;
      }
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
    } else if (ch === ";" && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
};

/** Parses an inline style attribute into React style entries. */
export function parseInlineStyle(css: string): [string, string][] {
  const entries: [string, string][] = [];
  for (const declaration of splitDeclarations(css.replace(/\/\*[\s\S]*?\*\//g, ""))) {
    const colon = declaration.indexOf(":");
    if (colon <= 0) continue;
    const property = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();
    if (!property || !value) continue;
    entries.push([cssPropertyToKey(property), value]);
  }
  return entries;
}

const isIdentifier = (value: string) => /^[A-Za-z_$][\w$]*$/.test(value);

const formatStyle = (css: string): string | null => {
  const entries = parseInlineStyle(css);
  if (entries.length === 0) return null;
  const body = entries
    .map(([key, value]) => `${isIdentifier(key) ? key : JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(", ");
  return `{{ ${body} }}`;
};

/** Text inside a JSX comment must not close it early. */
const commentText = (value: string) => value.replace(/\*\//g, "* /");

/** Escapes characters that JSX text cannot hold as written. */
export function escapeJsxText(text: string): string {
  return text
    .replace(/&(?=#?\w+;)/g, "&amp;")
    .replace(/[{}<>\u00a0]/g, (ch) => {
      switch (ch) {
        case "{":
          return '{"{"}';
        case "}":
          return '{"}"}';
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        default:
          return "&nbsp;";
      }
    });
}

const templateLiteral = (text: string) => "{`" + text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`}";

const attributeValue = (value: string) =>
  /["\n\\]|&#?\w+;/.test(value) ? `{${JSON.stringify(value)}}` : `"${value}"`;

interface Context {
  handlers: number;
}

const eventProp = (name: string) => {
  const event = name.slice(2).toLowerCase();
  return `on${EVENT_NAMES[event] ?? capitalize(event)}`;
};

/** Converts one attribute to a JSX prop, or null to drop it. */
const convertAttribute = (element: Element, attr: Attr, context: Context): string | null => {
  const name = attr.name;
  const lower = name.toLowerCase();
  const value = attr.value;
  const isSvg = element.namespaceURI === SVG_NS;
  const tag = element.localName;

  if (lower === "style") {
    const style = formatStyle(value);
    return style ? `style=${style}` : null;
  }

  if (/^on[a-z]+$/i.test(name)) {
    context.handlers++;
    const code = value.trim();
    return `${eventProp(lower)}={() => {}${code ? ` /* ${commentText(code)} */` : ""}}`;
  }

  if (lower.startsWith("data-") || lower.startsWith("aria-")) return `${lower}=${attributeValue(value)}`;

  // Form fields keep their initial state without becoming controlled inputs
  if ((tag === "input" || tag === "select") && lower === "value") return `defaultValue=${attributeValue(value)}`;
  if (tag === "input" && lower === "checked") return "defaultChecked";

  if (BOOLEAN_ATTRIBUTES.has(lower) && !isSvg && (value === "" || value.toLowerCase() === lower)) {
    return HTML_ATTRIBUTES[lower] ?? lower;
  }

  let prop: string;
  if (lower === "class") prop = "className";
  else if (isSvg || name.includes(":")) prop = name === "xmlns" ? name : camelCase(name);
  else prop = HTML_ATTRIBUTES[lower] ?? lower;
  return `${prop}=${attributeValue(value)}`;
};

const tagName = (element: Element) => element.localName;

/** HTML whitespace. Unlike `\s`, it leaves non-breaking spaces alone. */
const isWhitespace = (text: string) => !/[^ \t\n\r\f]/.test(text);
const collapse = (text: string) => text.replace(/[ \t\n\r\f]+/g, " ");

/** Children that take part in the output: whitespace that only formats the source is dropped. */
const isMeaningful = (child: ChildNode) => {
  if (child.nodeType === Node.TEXT_NODE) return !(isWhitespace(child.textContent ?? "") && /\n/.test(child.textContent ?? ""));
  return child.nodeType === Node.ELEMENT_NODE || child.nodeType === Node.COMMENT_NODE;
};

const meaningfulChildren = (element: Element): ChildNode[] => childrenOf(element).filter(isMeaningful);

const openTag = (element: Element, context: Context): { name: string; attrs: string[] } => {
  const attrs: string[] = [];
  for (const attr of Array.from(element.attributes)) {
    const prop = convertAttribute(element, attr, context);
    if (prop) attrs.push(prop);
  }
  if (tagName(element) === "textarea" && element.textContent) {
    attrs.push(`defaultValue=${attributeValue(element.textContent)}`);
  }
  return { name: tagName(element), attrs };
};

const childrenOf = (element: Element): ChildNode[] =>
  tagName(element) === "template" ? Array.from((element as HTMLTemplateElement).content?.childNodes ?? element.childNodes) : Array.from(element.childNodes);

/** Renders content inside `<pre>` and similar elements without changing any whitespace. */
const renderRaw = (node: ChildNode, context: Context): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return /[\s`\\]/.test(text) || text.includes("${") ? templateLiteral(text) : escapeJsxText(text);
  }
  if (node.nodeType === Node.COMMENT_NODE) return `{/* ${commentText((node.textContent ?? "").trim())} */}`;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  const { name, attrs } = openTag(element, context);
  const head = `<${name}${attrs.length ? ` ${attrs.join(" ")}` : ""}`;
  const inner = tagName(element) === "textarea" ? "" : childrenOf(element).map((child) => renderRaw(child, context)).join("");
  return inner ? `${head}>${inner}</${name}>` : `${head} />`;
};

/** Renders a node on one line, or returns null when it must span several lines. */
const renderInline = (node: ChildNode, context: Context): string | null => {
  if (node.nodeType === Node.TEXT_NODE) return escapeJsxText(collapse(node.textContent ?? ""));
  if (node.nodeType === Node.COMMENT_NODE) return `{/* ${commentText((node.textContent ?? "").trim())} */}`;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  if (RAW_TEXT_ELEMENTS.has(tagName(element))) return renderRaw(element, context);
  const { name, attrs } = openTag(element, context);
  const head = `<${name}${attrs.length ? ` ${attrs.join(" ")}` : ""}`;
  const children = meaningfulChildren(element);
  if (children.length === 0 || VOID_ELEMENTS.has(name)) return `${head} />`;
  const parts: string[] = [];
  for (const child of children) {
    const part = renderInline(child, context);
    if (part === null) return null;
    parts.push(part);
  }
  return `${head}>${parts.join("")}</${name}>`;
};

/** Renders the children of an element, one per line, keeping spaces that render. */
const renderChildLines = (children: ChildNode[], depth: number, context: Context): string[] => {
  const pad = INDENT.repeat(depth);
  const lines: string[] = [];
  children.forEach((child, index) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const raw = child.textContent ?? "";
      const hasBefore = index > 0;
      const hasAfter = index < children.length - 1;
      if (isWhitespace(raw)) {
        if (hasBefore && hasAfter) lines.push(`${pad}{" "}`);
        return;
      }
      const text = escapeJsxText(collapse(raw).replace(/^ | $/g, ""));
      const lead = hasBefore && /^[ \t\n\r\f]/.test(raw) ? '{" "}' : "";
      const trail = hasAfter && /[ \t\n\r\f]$/.test(raw) ? '{" "}' : "";
      lines.push(`${pad}${lead}${text}${trail}`);
      return;
    }
    lines.push(...renderNode(child, depth, context));
  });
  return lines;
};

/** Renders a node as indented lines. */
const renderNode = (node: ChildNode, depth: number, context: Context): string[] => {
  const pad = INDENT.repeat(depth);
  if (node.nodeType === Node.COMMENT_NODE) return [`${pad}{/* ${commentText((node.textContent ?? "").trim())} */}`];
  if (node.nodeType === Node.TEXT_NODE) {
    const text = collapse(node.textContent ?? "").replace(/^ | $/g, "");
    return text ? [`${pad}${escapeJsxText(text)}`] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const element = node as Element;

  // Count handlers once: the inline attempt below would count them a second time
  const probe: Context = { handlers: 0 };
  const inline = renderInline(element, probe);
  if (inline !== null && !inline.includes("\n") && pad.length + inline.length <= LINE_WIDTH) {
    context.handlers += probe.handlers;
    return [pad + inline];
  }

  if (RAW_TEXT_ELEMENTS.has(tagName(element))) {
    context.handlers += probe.handlers;
    return [pad + renderRaw(element, { handlers: 0 })];
  }

  const { name, attrs } = openTag(element, context);
  const children = meaningfulChildren(element);
  const selfClosing = children.length === 0 || VOID_ELEMENTS.has(name);
  const oneLineHead = `${pad}<${name}${attrs.length ? ` ${attrs.join(" ")}` : ""}`;
  const head =
    oneLineHead.length + 3 <= LINE_WIDTH || attrs.length <= 1
      ? [`${oneLineHead}${selfClosing ? " />" : ">"}`]
      : [`${pad}<${name}`, ...attrs.map((attr) => `${pad}${INDENT}${attr}`), `${pad}${selfClosing ? "/>" : ">"}`];
  if (selfClosing) return head;
  return [...head, ...renderChildLines(children, depth + 1, context), `${pad}</${name}>`];
};

/** Picks the nodes to convert: a whole document, its body, or a fragment. */
const parseRoots = (html: string): ChildNode[] => {
  const parser = new DOMParser();
  if (/<html[\s>]/i.test(html)) {
    const doc = parser.parseFromString(html, "text/html");
    return [doc.documentElement];
  }
  if (/<(body|head)[\s>]/i.test(html)) {
    const doc = parser.parseFromString(html, "text/html");
    return /<head[\s>]/i.test(html) ? [doc.head, doc.body] : [doc.body];
  }
  const doc = parser.parseFromString("<!doctype html><title></title>", "text/html");
  const template = doc.createElement("template");
  template.innerHTML = html;
  return Array.from(template.content.childNodes);
};

/** Converts HTML to JSX. Several root nodes are wrapped in a fragment. */
export function htmlToJsx(html: string, options: HtmlToJsxOptions = {}): HtmlToJsxResult {
  const componentName = (options.componentName ?? "Component").trim();
  if (options.component && !/^[A-Z][A-Za-z0-9_$]*$/.test(componentName)) {
    return { ok: false, error: "The component name must start with a capital letter and use only letters, digits, $, or _." };
  }
  if (!html.trim()) return { ok: true, value: "", handlers: 0 };

  const roots = parseRoots(html).filter(
    (node) => isMeaningful(node) && (node.nodeType !== Node.TEXT_NODE || !isWhitespace(node.textContent ?? "")),
  );
  if (roots.length === 0) return { ok: true, value: "", handlers: 0 };

  const context: Context = { handlers: 0 };
  const base = options.component ? 2 : 0;
  const fragment = roots.length > 1 || roots[0].nodeType !== Node.ELEMENT_NODE;
  const body = fragment
    ? [`${INDENT.repeat(base)}<>`, ...renderChildLines(roots, base + 1, context), `${INDENT.repeat(base)}</>`]
    : renderNode(roots[0], base, context);

  const value = options.component
    ? [`export function ${componentName}() {`, `${INDENT}return (`, ...body, `${INDENT});`, "}"].join("\n")
    : body.join("\n");
  return { ok: true, value, handlers: context.handlers };
}
