/**
 * Markdown to HTML for the Markdown tool and the in-app release notes. The parser follows
 * CommonMark and GitHub Flavored Markdown, so raw HTML blocks, tables, and task lists work.
 * Raw HTML passes through the parser, and `sanitizeHtml` removes what is not safe.
 */

import DOMPurify from "dompurify";
import { Marked } from "marked";

const parser = new Marked({ gfm: true, breaks: false, async: false });

/** Converts Markdown to HTML. The result is not sanitized. */
export function convertMarkdown(markdown: string): string {
  return parser.parse(markdown) as string;
}

// A separate instance, so the hooks below do not change how other tools sanitize
const purify = typeof window === "undefined" ? null : DOMPurify(window);

// Tags that could restyle the app, load other documents, or take input
const FORBID_TAGS = ["style", "link", "meta", "base", "form", "button", "textarea", "select", "option", "iframe", "frame", "frameset", "object", "embed"];

purify?.addHook("uponSanitizeElement", (node, data) => {
  // A task list item has a checkbox. Every other input is removed.
  if (data.tagName === "input" && (node as Element).getAttribute("type") !== "checkbox") node.parentNode?.removeChild(node);
});

purify?.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName === "INPUT") node.setAttribute("disabled", "");
});

/** Removes scripts, event handlers, unsafe URLs, and the tags in FORBID_TAGS. */
export function sanitizeHtml(html: string): string {
  if (!purify) return "";
  return purify.sanitize(html, { ADD_ATTR: ["target"], FORBID_TAGS });
}

const REMOTE_URL = /^\s*(?:https?:)?\/\//i;

/** The number of images that would load from the network: img and source elements, and CSS url() in style attributes. */
export function countRemoteImages(html: string): number {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let count = 0;
  for (const element of Array.from(doc.querySelectorAll("img, source, video, [style]"))) {
    const urls = [element.getAttribute("src"), element.getAttribute("poster"), ...(element.getAttribute("srcset") ?? "").split(",").map((part) => part.trim().split(/\s+/)[0])];
    const style = element.getAttribute("style") ?? "";
    if (urls.some((url) => url && REMOTE_URL.test(url)) || /url\(\s*["']?\s*(?:https?:)?\/\//i.test(style)) count++;
  }
  return count;
}

/** Styles for rendered Markdown, close to how GitHub shows a README. */
export function markdownCss(dark: boolean): string {
  const [border, link, code, muted, stripe] = dark
    ? ["#3d444d", "#4493f8", "rgba(101,108,118,.3)", "#9198a1", "#151b23"]
    : ["#d0d7de", "#0969da", "rgba(175,184,194,.25)", "#59636e", "#f6f8fa"];
  return `
body{margin:0}
.markdown-body{font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;padding:16px 20px;overflow-wrap:break-word}
.markdown-body>:first-child{margin-top:0}
.markdown-body>:last-child{margin-bottom:0}
.markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4,.markdown-body h5,.markdown-body h6{margin:24px 0 16px;font-weight:600;line-height:1.25}
.markdown-body h1{font-size:2em}
.markdown-body h2{font-size:1.5em}
.markdown-body h3{font-size:1.25em}
.markdown-body h1,.markdown-body h2{padding-bottom:.3em;border-bottom:1px solid ${border}}
.markdown-body p,.markdown-body ul,.markdown-body ol,.markdown-body blockquote,.markdown-body table,.markdown-body pre,.markdown-body details,.markdown-body dl{margin:0 0 16px}
.markdown-body ul,.markdown-body ol{padding-left:2em}
.markdown-body li+li{margin-top:.25em}
.markdown-body li>input[type=checkbox]{margin:0 .4em 0 -1.4em;vertical-align:middle}
.markdown-body li:has(>input[type=checkbox]){list-style:none}
.markdown-body a{color:${link};text-decoration:none}
.markdown-body a:hover{text-decoration:underline}
.markdown-body code,.markdown-body kbd,.markdown-body pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:85%}
.markdown-body code{padding:.2em .4em;border-radius:6px;background:${code}}
.markdown-body pre{padding:16px;overflow:auto;line-height:1.45;border-radius:6px;background:${code}}
.markdown-body pre code{padding:0;font-size:100%;background:none}
.markdown-body kbd{padding:2px 5px;border:1px solid ${border};border-bottom-width:2px;border-radius:6px}
.markdown-body blockquote{margin-left:0;padding:0 1em;color:${muted};border-left:.25em solid ${border}}
.markdown-body table{display:block;width:max-content;max-width:100%;overflow:auto;border-collapse:collapse}
.markdown-body th,.markdown-body td{padding:6px 13px;border:1px solid ${border}}
.markdown-body th{font-weight:600}
.markdown-body tr:nth-child(2n){background:${stripe}}
.markdown-body img{max-width:100%}
.markdown-body hr{height:0;margin:24px 0;border:0;border-top:1px solid ${border}}
.markdown-body summary{cursor:pointer}
`;
}
