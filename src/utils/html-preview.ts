/**
 * Builds the srcdoc for the HTML preview frame. A Content-Security-Policy
 * blocks every network load, so the preview stays offline.
 */

export interface PreviewOptions {
  /** Allow inline scripts. The frame sandbox must also allow them. */
  scripts: boolean;
  /** Paint the canvas dark instead of light. */
  dark: boolean;
}

/** The policy for the preview document. Remote images, styles, fonts, frames, and scripts do not load. */
export function previewCsp(scripts: boolean): string {
  const directives = ["default-src 'none'", "img-src data: blob:", "style-src 'unsafe-inline'", "font-src data:"];
  if (scripts) directives.push("script-src 'unsafe-inline'");
  return directives.join("; ");
}

/** The sandbox tokens for the preview frame. `allow-same-origin` is never included. */
export function previewSandbox(scripts: boolean): string {
  return scripts ? "allow-scripts" : "";
}

/**
 * Wraps user HTML in a document with the policy as the first element of the head.
 * The HTML is parsed in an inert document, so nothing runs or loads here.
 */
export function buildPreviewDocument(html: string, { scripts, dark }: PreviewOptions): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const head = doc.head;

  // A refresh would navigate the frame away to another page
  doc.querySelectorAll('meta[http-equiv="refresh" i]').forEach((meta) => meta.remove());
  // Links open in a new window, which the sandbox blocks, so the frame never navigates to a remote page
  doc.querySelectorAll("a[target], area[target], form[target], base[target]").forEach((el) => el.removeAttribute("target"));

  const csp = doc.createElement("meta");
  csp.setAttribute("http-equiv", "Content-Security-Policy");
  csp.setAttribute("content", previewCsp(scripts));

  const charset = doc.createElement("meta");
  charset.setAttribute("charset", "utf-8");

  const base = doc.createElement("base");
  base.setAttribute("target", "_blank");

  // System colors follow the color scheme, so the canvas needs no fixed values
  const canvas = doc.createElement("style");
  canvas.textContent = `:root{color-scheme:${dark ? "dark" : "light"};background:Canvas;color:CanvasText}`;

  head.prepend(csp, charset, base, canvas);
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
