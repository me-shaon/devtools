/**
 * Turns SVG markup into data URIs and CSS snippets. The SVG is parsed as XML
 * into an inert document. It is never added to the page.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

/** Namespaces that editors add for their own bookkeeping. They do not change how the SVG renders. */
const EDITOR_NAMESPACES = [
  "http://www.inkscape.org/namespaces/inkscape",
  "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd",
  "http://inkscape.sourceforge.net/DTD/sodipodi-0.dtd",
  "http://www.bohemiancoding.com/sketch/ns",
  "http://www.serif.com/",
  "http://www.figma.com/figma/ns",
];
const EDITOR_PREFIXES = ["inkscape", "sodipodi", "sketch", "serif", "figma"];

const isEditorNamespace = (ns: string | null) => !!ns && (EDITOR_NAMESPACES.includes(ns) || ns.startsWith("http://ns.adobe.com/"));

export interface SvgConversion {
  ok: true;
  /** The cleaned SVG with double-quoted attributes. */
  svg: string;
  /** URL-encoded data URI with single-quoted attributes. */
  miniDataUri: string;
  base64DataUri: string;
  backgroundCss: string;
  maskCss: string;
  imgTag: string;
  width: string | null;
  height: string | null;
  /** Number of script elements removed. */
  scripts: number;
  /** Number of event handler and javascript: attributes removed. */
  handlers: number;
  /** Notes about changes the tool made, such as an added namespace. */
  notes: string[];
}

export type SvgResult = SvgConversion | { ok: false; error: string };

const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttribute = (value: string, quote: '"' | "'") => {
  const escaped = value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return quote === '"' ? escaped.replace(/"/g, "&quot;") : escaped.replace(/'/g, "&apos;");
};

/** Serializes an element with the given attribute quote. Comments and processing instructions are left out. */
export function serializeSvg(node: Node, quote: '"' | "'" = '"'): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? "");
  if (node.nodeType === Node.CDATA_SECTION_NODE) return `<![CDATA[${node.textContent ?? ""}]]>`;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  const attrs = Array.from(element.attributes)
    .map((attr) => ` ${attr.name}=${quote}${escapeAttribute(attr.value, quote)}${quote}`)
    .join("");
  const children = Array.from(element.childNodes).map((child) => serializeSvg(child, quote)).join("");
  return children ? `<${element.tagName}${attrs}>${children}</${element.tagName}>` : `<${element.tagName}${attrs}/>`;
}

/** Adds the namespace declarations that inline SVG copied from HTML usually leaves out. */
const addMissingNamespaces = (input: string, notes: string[]): string => {
  const match = /<svg\b[^>]*>/i.exec(input);
  if (!match) return input;
  let tag = match[0];
  if (!/\sxmlns\s*=/.test(tag)) {
    tag = tag.replace(/^<svg\b/i, `<svg xmlns="${SVG_NS}"`);
    notes.push("Added the SVG namespace. An SVG image does not render without it.");
  }
  if (/\bxlink:/.test(input) && !/\sxmlns:xlink\s*=/.test(tag)) {
    tag = tag.replace(/^<svg\b/i, `<svg xmlns:xlink="${XLINK_NS}"`);
    notes.push("Added the xlink namespace.");
  }
  return input.slice(0, match.index) + tag + input.slice(match.index + match[0].length);
};

/** Removes whitespace and control characters, which browsers ignore inside a URL scheme. */
const stripControls = (value: string) => Array.from(value).filter((ch) => ch.charCodeAt(0) > 0x20).join("");

/** Reads the first line of a parser error without the browser-specific wrapper text. */
const parserMessage = (error: Element) => {
  const text = (error.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.replace(/^This page contains the following errors:\s*/i, "").replace(/\s*Below is a rendering.*$/i, "") || "The SVG is not well-formed XML.";
};

const usedPrefixes = (root: Element): Set<string> => {
  const prefixes = new Set<string>();
  const visit = (element: Element) => {
    if (element.prefix) prefixes.add(element.prefix);
    for (const attr of Array.from(element.attributes)) if (attr.prefix && attr.prefix !== "xmlns") prefixes.add(attr.prefix);
    Array.from(element.children).forEach(visit);
  };
  visit(root);
  return prefixes;
};

/**
 * Removes scripts, event handlers, editor data, comments, and source formatting.
 * Returns how many scripts and handlers were removed.
 */
const clean = (root: Element): { scripts: number; handlers: number } => {
  let scripts = 0;
  let handlers = 0;

  const visit = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as Element;
        const name = element.localName.toLowerCase();
        if (name === "script") {
          scripts++;
          element.remove();
          continue;
        }
        if (name === "metadata" || isEditorNamespace(element.namespaceURI) || (element.prefix && EDITOR_PREFIXES.includes(element.prefix))) {
          element.remove();
          continue;
        }
        cleanAttributes(element);
        visit(element);
      } else if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? "";
        if (!/\S/.test(text) && /\n/.test(text)) child.remove();
        else child.textContent = text.replace(/\s+/g, " ");
      } else if (child.nodeType !== Node.CDATA_SECTION_NODE) {
        child.remove();
      }
    }
  };

  const cleanAttributes = (element: Element) => {
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (/^on/.test(attr.localName.toLowerCase())) {
        handlers++;
        element.removeAttributeNode(attr);
      } else if ((attr.localName === "href" || name.endsWith(":href")) && /^(javascript|vbscript):/i.test(stripControls(attr.value))) {
        handlers++;
        element.removeAttributeNode(attr);
      } else if (isEditorNamespace(attr.namespaceURI) || (attr.prefix && EDITOR_PREFIXES.includes(attr.prefix))) {
        element.removeAttributeNode(attr);
      }
    }
  };

  cleanAttributes(root);
  visit(root);

  // Drop namespace declarations that nothing uses after the cleanup
  const prefixes = usedPrefixes(root);
  for (const attr of Array.from(root.attributes)) {
    if (attr.namespaceURI === XMLNS_NS && attr.prefix === "xmlns" && !prefixes.has(attr.localName)) root.removeAttributeNode(attr);
  }
  return { scripts, handlers };
};

/** URL-encodes only what a data URI in CSS or HTML needs: the "mini SVG data URI" technique. */
export function encodeMiniSvg(svg: string): string {
  return svg
    .replace(/\s+/g, " ")
    .replace(/["%#<>{}\\]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

const toBase64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const escapeHtmlAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Reads a plain size such as `24` or `24px` from an attribute. */
const plainSize = (value: string | null) => {
  const match = value ? /^\s*(\d+(?:\.\d+)?)(px)?\s*$/.exec(value) : null;
  return match ? match[1] : null;
};

/** Validates, cleans, and converts SVG markup. */
export function convertSvg(input: string): SvgResult {
  if (!input.trim()) return { ok: false, error: "" };
  const notes: string[] = [];
  const source = addMissingNamespaces(input.trim(), notes);

  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const error = doc.getElementsByTagName("parsererror")[0];
  if (error) return { ok: false, error: parserMessage(error) };
  const root = doc.documentElement;
  if (root.localName !== "svg" || root.namespaceURI !== SVG_NS) {
    return { ok: false, error: `The root element is <${root.tagName}>. An SVG file starts with <svg>.` };
  }

  const { scripts, handlers } = clean(root);
  const svg = serializeSvg(root, '"');
  const miniDataUri = `data:image/svg+xml,${encodeMiniSvg(serializeSvg(root, "'"))}`;
  const base64DataUri = `data:image/svg+xml;base64,${toBase64(svg)}`;

  const viewBox = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/);
  const width = plainSize(root.getAttribute("width")) ?? (viewBox.length === 4 ? plainSize(viewBox[2]) : null);
  const height = plainSize(root.getAttribute("height")) ?? (viewBox.length === 4 ? plainSize(viewBox[3]) : null);

  const backgroundCss = `background-image: url("${miniDataUri}");`;
  const maskCss = [
    ".icon {",
    `  width: ${width ? `${width}px` : "1em"};`,
    `  height: ${height ? `${height}px` : "1em"};`,
    "  background-color: currentColor;",
    `  -webkit-mask-image: url("${miniDataUri}");`,
    `  mask-image: url("${miniDataUri}");`,
    "  -webkit-mask-repeat: no-repeat;",
    "  mask-repeat: no-repeat;",
    "  -webkit-mask-size: contain;",
    "  mask-size: contain;",
    "}",
  ].join("\n");
  const size = `${width ? ` width="${width}"` : ""}${height ? ` height="${height}"` : ""}`;
  const imgTag = `<img src="${escapeHtmlAttribute(miniDataUri)}" alt=""${size}>`;

  return { ok: true, svg, miniDataUri, base64DataUri, backgroundCss, maskCss, imgTag, width, height, scripts, handlers, notes };
}

/** UTF-8 size of a string in bytes. */
export const byteLength = (value: string) => new TextEncoder().encode(value).length;
