/**
 * Renders Mermaid diagrams to SVG. Mermaid loads only when the first diagram renders.
 * The strict security level strips HTML and scripts from labels and turns off click handlers.
 * Labels are plain SVG text, so the SVG shows in an <img> and draws to a canvas for PNG export.
 */

import type { Mermaid } from "mermaid";

export interface MermaidDiagram {
  svg: string;
  /** The diagram type that Mermaid detected, such as `flowchart-v2` or `sequence`. */
  type: string;
  width: number;
  height: number;
}

let loader: Promise<Mermaid> | null = null;
const loadMermaid = () => (loader ??= import("mermaid").then((module) => module.default));

let renderCount = 0;

/** Settings that a %%{init}%% directive in the diagram cannot change. */
export const LOCKED_SETTINGS = ["secure", "securityLevel", "startOnLoad", "maxTextSize", "suppressErrorRendering", "maxEdges", "htmlLabels"];

/**
 * Gives the SVG a fixed width and height from its viewBox. Mermaid sets width="100%" and a
 * max-width style, so an <img> would not know the diagram's size.
 */
export function sizeSvg(svg: string): { svg: string; width: number; height: number } {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  const [, , viewWidth, viewHeight] = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const width = Math.ceil(viewWidth > 0 ? viewWidth : Number.parseFloat(root.getAttribute("width") ?? "") || 300);
  const height = Math.ceil(viewHeight > 0 ? viewHeight : Number.parseFloat(root.getAttribute("height") ?? "") || 150);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.style.removeProperty("max-width");
  return { svg: new XMLSerializer().serializeToString(root), width, height };
}

/** Renders the diagram. Throws the Mermaid error for invalid syntax. */
export async function renderMermaid(source: string, dark: boolean): Promise<MermaidDiagram> {
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: false,
    suppressErrorRendering: true,
    theme: dark ? "dark" : "default",
    secure: LOCKED_SETTINGS,
  });
  const parsed = await mermaid.parse(source);
  const { svg } = await mermaid.render(`mermaid-diagram-${++renderCount}`, source);
  return { ...sizeSvg(svg), type: parsed ? parsed.diagramType : "unknown" };
}

/** The largest side of an exported PNG, so the canvas stays within browser limits. */
export const MAX_PNG_SIDE = 8192;

/** Draws the SVG to a PNG at `scale`, on a solid background. */
export async function svgToPng(diagram: Pick<MermaidDiagram, "svg" | "width" | "height">, scale: number, background: string): Promise<Blob> {
  const factor = Math.min(scale, MAX_PNG_SIDE / diagram.width, MAX_PNG_SIDE / diagram.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(diagram.width * factor));
  canvas.height = Math.max(1, Math.round(diagram.height * factor));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This window cannot draw a PNG.");

  const image = new Image();
  image.src = svgDataUrl(diagram.svg);
  await image.decode();
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The PNG could not be created."))), "image/png"),
  );
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** The first line of a Mermaid error, without the parser's long list of expected tokens. */
export function errorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lines = message.split("\n").filter((line) => line.trim());
  const expecting = lines.findIndex((line) => line.startsWith("Expecting "));
  return (expecting > 0 ? lines.slice(0, expecting) : lines.slice(0, 3)).join("\n") || "The diagram could not be rendered.";
}
