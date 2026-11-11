/**
 * Reads and writes Mermaid flowcharts for the Draw mode of the Mermaid Renderer.
 * The parser reads nodes, shapes, links, and link labels. It keeps style, class, and comment lines
 * as they are, and it refuses syntax that it cannot edit, such as subgraphs.
 */

import dagre from "@dagrejs/dagre";

export type Direction = "TB" | "TD" | "BT" | "LR" | "RL";

export type Shape =
  | "rect"
  | "round"
  | "stadium"
  | "subroutine"
  | "cylinder"
  | "circle"
  | "diamond"
  | "hexagon"
  | "parallelogram"
  | "parallelogram-alt"
  | "trapezoid"
  | "trapezoid-alt"
  | "asymmetric";

export type LineStyle = "solid" | "dotted" | "thick";

export type Head = "arrow" | "none" | "circle" | "cross";

export interface FlowNode {
  id: string;
  label: string;
  shape: Shape;
  /** The class from an `id:::name` suffix. */
  className?: string;
}

export interface FlowEdge {
  from: string;
  to: string;
  label: string;
  line: LineStyle;
  head: Head;
  /** True when the link has the head at both ends, such as `<-->`. */
  both: boolean;
  /** Extra length, from more dashes in the link. 0 is the shortest link. */
  length: number;
}

export interface Flowchart {
  keyword: "flowchart" | "graph";
  direction: Direction;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** The text before the header, such as front matter or an %%{init}%% line. */
  preamble: string;
  /** Lines that Draw mode keeps as they are: styles, classes, clicks, and comments. */
  extra: string[];
}

/** `notFlowchart` is true when the text is another diagram type, or empty. */
export type ParseResult = { chart: Flowchart } | { error: string; line: number; notFlowchart?: boolean };

/** The open and close marks of each shape. The longer marks come first, so `([` wins over `(`. */
export const SHAPES: { shape: Shape; label: string; open: string; close: string }[] = [
  { shape: "stadium", label: "Stadium", open: "([", close: "])" },
  { shape: "subroutine", label: "Subroutine", open: "[[", close: "]]" },
  { shape: "cylinder", label: "Database", open: "[(", close: ")]" },
  { shape: "circle", label: "Circle", open: "((", close: "))" },
  { shape: "hexagon", label: "Hexagon", open: "{{", close: "}}" },
  { shape: "parallelogram", label: "Parallelogram", open: "[/", close: "/]" },
  { shape: "parallelogram-alt", label: "Parallelogram (left)", open: "[\\", close: "\\]" },
  { shape: "trapezoid", label: "Trapezoid", open: "[/", close: "\\]" },
  { shape: "trapezoid-alt", label: "Trapezoid (upside down)", open: "[\\", close: "/]" },
  { shape: "asymmetric", label: "Flag", open: ">", close: "]" },
  { shape: "rect", label: "Rectangle", open: "[", close: "]" },
  { shape: "round", label: "Rounded", open: "(", close: ")" },
  { shape: "diamond", label: "Decision", open: "{", close: "}" },
];

/** The shapes in the order that the shape menu shows them. */
export const SHAPE_MENU: Shape[] = [
  "rect",
  "round",
  "stadium",
  "diamond",
  "circle",
  "hexagon",
  "cylinder",
  "subroutine",
  "parallelogram",
  "trapezoid",
  "asymmetric",
];

export const shapeLabel = (shape: Shape) => SHAPES.find((item) => item.shape === shape)!.label;

const HEADER = /^(flowchart|graph)\b(?:[ \t]+(TB|TD|BT|LR|RL)\b)?[ \t]*;?/i;
const KEPT = /^(classDef|class|style|linkStyle|click|accTitle|accDescr)\b/;
const REFUSED = /^(subgraph|end|direction)\b/;
const ID = /^[\p{L}\p{N}_]+/u;

/** Splits a line into statements at each `;` outside quotes, brackets, and `|label|` text. */
function statements(line: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = false;
  let pipe = false;
  let start = 0;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') quote = !quote;
    if (quote) continue;
    if ("[({".includes(char)) depth++;
    else if ("])}".includes(char)) depth = Math.max(0, depth - 1);
    else if (char === "|" && depth === 0) pipe = !pipe;
    else if (char === ";" && depth === 0 && !pipe) {
      parts.push(line.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(line.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

const unquote = (text: string) => text.replace(/#quot;/g, '"');

interface NodeRef {
  id: string;
  label?: string;
  shape?: Shape;
  className?: string;
}

/** Reads one node at the start of `text`. Returns the node and the rest of the text. */
function readNode(text: string): { node: NodeRef; rest: string } | null {
  const id = ID.exec(text);
  if (!id) return null;
  let rest = text.slice(id[0].length);
  const node: NodeRef = { id: id[0] };
  for (const item of SHAPES) {
    if (!rest.startsWith(item.open)) continue;
    let body = rest.slice(item.open.length);
    let label: string;
    if (body.trimStart().startsWith('"')) {
      body = body.trimStart();
      const end = body.indexOf('"', 1);
      if (end < 0) return null;
      label = body.slice(1, end);
      body = body.slice(end + 1).trimStart();
      if (!body.startsWith(item.close)) continue;
    } else {
      const end = body.indexOf(item.close);
      if (end < 0) continue;
      label = body.slice(0, end);
      body = body.slice(end);
      // Text without quotes has no brackets. So `[/a\]` is a trapezoid, not a parallelogram that ends later.
      if (/[[\]{}()]/.test(label)) continue;
    }
    node.label = unquote(label.trim());
    node.shape = item.shape;
    rest = body.slice(item.close.length);
    break;
  }
  const className = /^:::([\w-]+)/.exec(rest);
  if (className) {
    node.className = className[1];
    rest = rest.slice(className[0].length);
  }
  return { node, rest };
}

/** Reads the nodes of a group such as `A & B`. */
function readGroup(text: string): { nodes: NodeRef[]; rest: string } | null {
  const nodes: NodeRef[] = [];
  let rest = text;
  for (;;) {
    const read = readNode(rest.trimStart());
    if (!read) return null;
    nodes.push(read.node);
    rest = read.rest;
    const amp = /^\s*&\s*/.exec(rest);
    if (!amp) return { nodes, rest };
    rest = rest.slice(amp[0].length);
  }
}

const HEADS: Record<string, Head> = { ">": "arrow", o: "circle", x: "cross" };

type Link = Omit<FlowEdge, "from" | "to">;

/** Reads one link at the start of `text`, with its label. */
function readLink(text: string): { link: Link; rest: string } | null {
  const patterns: { regex: RegExp; line: LineStyle; minimum: number }[] = [
    // Links with text between the marks: `-- text -->`, `-. text .->`, `== text ==>`
    { regex: /^([<ox])?--(?![-.>])\s*(.*?)\s*(-{2,})(>|[ox](?![\p{L}\p{N}_]))/u, line: "solid", minimum: 2 },
    { regex: /^([<ox])?--(?![-.>])\s*(.*?)\s*(-{3,})()/u, line: "solid", minimum: 3 },
    { regex: /^([<ox])?-\.(?![-.])\s*(.*?)\s*\.(-+)([>ox])?/u, line: "dotted", minimum: 1 },
    { regex: /^([<ox])?==(?![=>])\s*(.*?)\s*(={2,})(>|[ox](?![\p{L}\p{N}_]))/u, line: "thick", minimum: 2 },
    { regex: /^([<ox])?==(?![=>])\s*(.*?)\s*(={3,})()/u, line: "thick", minimum: 3 },
  ];
  const plain: { regex: RegExp; line: LineStyle; minimum: number }[] = [
    { regex: /^([<ox])?()(-{2,})(>|[ox](?![\p{L}\p{N}_]))/u, line: "solid", minimum: 2 },
    { regex: /^([<ox])?()(-{3,})()/, line: "solid", minimum: 3 },
    { regex: /^([<ox])?-()(\.+)-([>ox])?/, line: "dotted", minimum: 1 },
    { regex: /^([<ox])?()(={2,})(>|[ox](?![\p{L}\p{N}_]))/u, line: "thick", minimum: 2 },
    { regex: /^([<ox])?()(={3,})()/, line: "thick", minimum: 3 },
  ];
  // A plain link first, so `A --> B -- text --> C` reads the first link without text
  for (const { regex, line, minimum } of [...plain, ...patterns]) {
    const match = regex.exec(text);
    if (!match) continue;
    const [all, start, inline, marks, end] = match;
    const head = end ? HEADS[end] : "none";
    let rest = text.slice(all.length);
    let label = inline ?? "";
    const pipe = /^\s*\|("[^"]*"|[^|]*)\|/.exec(rest);
    if (pipe) {
      label = pipe[1];
      rest = rest.slice(pipe[0].length);
    }
    label = label.trim();
    if (label.startsWith('"') && label.endsWith('"') && label.length > 1) label = label.slice(1, -1);
    const length = line === "dotted" ? marks.length - 1 : marks.length - minimum;
    return { link: { label: unquote(label), line, head, both: Boolean(start) && head !== "none", length: Math.max(0, length) }, rest };
  }
  return null;
}

/** Parses a flowchart. The result names the first line that Draw mode cannot read. */
export function parseFlowchart(text: string): ParseResult {
  const lines = text.split("\n");
  let index = 0;
  // Front matter, init lines, comments, and blank lines can come before the header
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((line, at) => at > 0 && line.trim() === "---");
    if (close > 0) index = close + 1;
  }
  while (index < lines.length && (!lines[index].trim() || lines[index].trim().startsWith("%%"))) index++;
  const header = HEADER.exec(lines[index]?.trim() ?? "");
  if (!header) return { error: "Draw mode edits flowcharts. The text must start with flowchart or graph.", line: index + 1, notFlowchart: true };

  const chart: Flowchart = {
    keyword: header[1].toLowerCase() as Flowchart["keyword"],
    direction: (header[2]?.toUpperCase() as Direction) ?? "TD",
    nodes: [],
    edges: [],
    preamble: lines.slice(0, index).join("\n"),
    extra: [],
  };
  const byId = new Map<string, FlowNode>();
  const use = (ref: NodeRef) => {
    let node = byId.get(ref.id);
    if (!node) {
      node = { id: ref.id, label: ref.id, shape: "rect" };
      byId.set(ref.id, node);
      chart.nodes.push(node);
    }
    if (ref.shape) {
      node.shape = ref.shape;
      node.label = ref.label ?? "";
    }
    if (ref.className) node.className = ref.className;
  };

  const bodyLines = [lines[index].trim().slice(header[0].length), ...lines.slice(index + 1)];
  for (let at = 0; at < bodyLines.length; at++) {
    const lineNumber = index + at + 1;
    const line = bodyLines[at].trim();
    if (!line) continue;
    if (line.startsWith("%%") || KEPT.test(line)) {
      chart.extra.push(line);
      continue;
    }
    if (REFUSED.test(line))
      return { error: `Draw mode cannot edit ${line.split(/\s/)[0]} lines yet. Use the text, or remove line ${lineNumber}.`, line: lineNumber };
    for (const statement of statements(line)) {
      let group = readGroup(statement);
      if (!group) return { error: `Draw mode cannot read line ${lineNumber}: ${statement}`, line: lineNumber };
      group.nodes.forEach(use);
      let rest = group.rest.trimStart();
      while (rest) {
        const link = readLink(rest);
        if (!link) return { error: `Draw mode cannot read line ${lineNumber}: ${statement}`, line: lineNumber };
        const next = readGroup(link.rest);
        if (!next) return { error: `Draw mode cannot read line ${lineNumber}: ${statement}`, line: lineNumber };
        next.nodes.forEach(use);
        for (const from of group.nodes) for (const to of next.nodes) chart.edges.push({ from: from.id, to: to.id, ...link.link });
        group = next;
        rest = next.rest.trimStart();
      }
    }
  }
  return { chart };
}

/** Labels that need quotes: text with marks that Mermaid reads as syntax. */
const needsQuotes = (label: string) => !/^[\p{L}\p{N}_ .,:!?'+*=@$%-]+$/u.test(label) || /^\s|\s$/.test(label);

const quote = (label: string) => (needsQuotes(label) ? `"${label.replace(/"/g, "#quot;")}"` : label);

function nodeText(node: FlowNode): string {
  const className = node.className ? `:::${node.className}` : "";
  if (node.shape === "rect" && node.label === node.id) return node.id + className;
  const { open, close } = SHAPES.find((item) => item.shape === node.shape)!;
  // Mermaid refuses an empty label, so an empty node gets a space
  return `${node.id}${open}${node.label ? quote(node.label) : '" "'}${close}${className}`;
}

const START_MARKS: Record<Head, string> = { arrow: "<", circle: "o", cross: "x", none: "" };
const END_MARKS: Record<Head, string> = { arrow: ">", circle: "o", cross: "x", none: "" };

export function linkText(edge: Pick<FlowEdge, "label" | "line" | "head" | "both" | "length">): string {
  const start = edge.both ? START_MARKS[edge.head] : "";
  const end = END_MARKS[edge.head];
  let marks: string;
  if (edge.line === "dotted") marks = `-${".".repeat(edge.length + 1)}-${end}`;
  else {
    const char = edge.line === "thick" ? "=" : "-";
    marks = end ? char.repeat(edge.length + 2) + end : char.repeat(edge.length + 3);
  }
  const label = edge.label.trim() ? `|${needsQuotes(edge.label) || edge.label.includes("|") ? `"${edge.label.replace(/"/g, "#quot;")}"` : edge.label}|` : "";
  return start + marks + label;
}

/** Writes the flowchart as Mermaid text. Each node shows its shape where it first appears. */
export function toMermaid(chart: Flowchart): string {
  const byId = new Map(chart.nodes.map((node) => [node.id, node]));
  const written = new Set<string>();
  const ref = (id: string) => {
    const node = byId.get(id);
    if (!node || written.has(id)) return id;
    written.add(id);
    return nodeText(node);
  };
  const lines: string[] = [];
  for (const edge of chart.edges) lines.push(`${ref(edge.from)} ${linkText(edge)} ${ref(edge.to)}`);
  for (const node of chart.nodes) if (!written.has(node.id)) lines.push(ref(node.id));
  const header = `${chart.keyword} ${chart.direction}`;
  const body = [...lines, ...chart.extra].map((line) => `    ${line}`);
  return [chart.preamble, header, ...body].filter((line, index) => index > 0 || line).join("\n");
}

/** The first free id from A to Z, then N1, N2, and on. */
export function nextNodeId(chart: Pick<Flowchart, "nodes">): string {
  const used = new Set(chart.nodes.map((node) => node.id));
  for (let code = 65; code <= 90; code++) if (!used.has(String.fromCharCode(code))) return String.fromCharCode(code);
  for (let number = 1; ; number++) if (!used.has(`N${number}`)) return `N${number}`;
}

/** Canvas colors that match Mermaid's default and dark themes. */
export const FLOW_COLORS = {
  light: { background: "#ffffff", node: "#ECECFF", border: "#9370DB", text: "#333333", line: "#333333", label: "#e8e8e8", grid: "#e5e7eb" },
  dark: { background: "#333333", node: "#1f2020", border: "#cccccc", text: "#cccccc", line: "#d3d3d3", label: "#585858", grid: "#4b4b4b" },
};

export type FlowColors = (typeof FLOW_COLORS)["light"];

export interface Point {
  x: number;
  y: number;
}

/** An estimate of the size of a node on the canvas, for the layout. */
export function nodeSize(node: Pick<FlowNode, "label" | "shape">): { width: number; height: number } {
  const longest = Math.max(1, ...node.label.split(/<br\s*\/?>|\n/i).map((line) => line.length));
  const width = Math.max(80, Math.min(260, longest * 7.5 + 32));
  if (node.shape === "circle") return { width: Math.max(width, 80), height: Math.max(width, 80) };
  if (node.shape === "diamond") return { width: width + 40, height: 80 };
  return { width, height: 44 };
}

/** Places all nodes with dagre, in the direction of the flowchart. Points are top-left corners. */
export function layoutFlowchart(chart: Pick<Flowchart, "nodes" | "edges" | "direction">): Record<string, Point> {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: chart.direction === "TD" ? "TB" : chart.direction, nodesep: 50, ranksep: 60, marginx: 20, marginy: 20 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of chart.nodes) graph.setNode(node.id, nodeSize(node));
  // A label takes space between the ranks, so it does not cover a node
  chart.edges.forEach((edge, index) =>
    graph.setEdge(edge.from, edge.to, edge.label ? { width: edge.label.length * 7 + 16, height: 22, labelpos: "c" } : {}, `e${index}`),
  );
  dagre.layout(graph);
  const layout: Record<string, Point> = {};
  for (const node of chart.nodes) {
    const box = graph.node(node.id);
    layout[node.id] = { x: Math.round(box.x - box.width / 2), y: Math.round(box.y - box.height / 2) };
  }
  return layout;
}

/**
 * Keeps the known positions and places the other nodes. A new node goes one step from a placed
 * neighbor, in the direction of the flowchart. A node with no placed neighbor takes its dagre place.
 */
export function placeNodes(chart: Pick<Flowchart, "nodes" | "edges" | "direction">, known: Record<string, Point>): Record<string, Point> {
  const layout: Record<string, Point> = {};
  for (const node of chart.nodes) if (known[node.id]) layout[node.id] = known[node.id];
  const missing = chart.nodes.filter((node) => !layout[node.id]);
  if (missing.length === 0) return layout;
  if (missing.length === chart.nodes.length) return layoutFlowchart(chart);
  const fallback = layoutFlowchart(chart);
  const step: Record<Direction, Point> = { TB: { x: 0, y: 110 }, TD: { x: 0, y: 110 }, BT: { x: 0, y: -110 }, LR: { x: 220, y: 0 }, RL: { x: -220, y: 0 } };
  const across = chart.direction === "LR" || chart.direction === "RL" ? { x: 0, y: 80 } : { x: 180, y: 0 };
  const taken = (point: Point) => Object.values(layout).some((other) => Math.abs(other.x - point.x) < 120 && Math.abs(other.y - point.y) < 60);
  for (const node of missing) {
    const neighbor = chart.edges.find((edge) => edge.to === node.id && layout[edge.from])?.from;
    const before = chart.edges.find((edge) => edge.from === node.id && layout[edge.to])?.to;
    let point: Point;
    if (neighbor) point = { x: layout[neighbor].x + step[chart.direction].x, y: layout[neighbor].y + step[chart.direction].y };
    else if (before) point = { x: layout[before].x - step[chart.direction].x, y: layout[before].y - step[chart.direction].y };
    else point = fallback[node.id];
    for (let tries = 0; taken(point) && tries < 20; tries++) point = { x: point.x + across.x, y: point.y + across.y };
    layout[node.id] = point;
  }
  return layout;
}

/** The nearest place to `point` where a new node does not cover a placed node. `point` is the top-left corner. */
export function freeSpot(chart: Pick<Flowchart, "nodes">, layout: Record<string, Point>, point: Point, size: { width: number; height: number }): Point {
  const gap = 16;
  const boxes = chart.nodes.filter((node) => layout[node.id]).map((node) => ({ ...layout[node.id], ...nodeSize(node) }));
  const free = (at: Point) =>
    !boxes.some(
      (box) => at.x < box.x + box.width + gap && box.x < at.x + size.width + gap && at.y < box.y + box.height + gap && box.y < at.y + size.height + gap,
    );
  if (free(point)) return point;
  const step = 20;
  const candidates: Point[] = [];
  for (let dx = -40; dx <= 40; dx++) for (let dy = -40; dy <= 40; dy++) candidates.push({ x: point.x + dx * step, y: point.y + dy * step });
  const distance = (at: Point) => (at.x - point.x) ** 2 + (at.y - point.y) ** 2;
  return candidates.sort((a, b) => distance(a) - distance(b)).find(free) ?? point;
}
