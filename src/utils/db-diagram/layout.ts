/**
 * Table positions for the DB Diagram tool. The positions live in a block comment at the end of
 * the DBML file, so one .dbml file holds the schema and the layout, and other DBML tools ignore it.
 */

import dagre from "@dagrejs/dagre";
import type { Cardinality, DbModel, DbRef, DbTable } from "@/utils/db-diagram/model";

export interface Point {
  x: number;
  y: number;
}

/** Table id to the top-left corner of the table. */
export type Layout = Record<string, Point>;

const MARKER = "@devtools-layout";
const BLOCK = /\/\*\s*@devtools-layout\b([\s\S]*?)\*\//g;

export interface SplitText {
  /** The DBML without the layout block. Its line numbers are the line numbers in the full text. */
  schema: string;
  layout: Layout;
  warning: string | null;
}

/** Sizes of a table on the canvas and in exported images. */
export const HEADER_HEIGHT = 36;
export const ROW_HEIGHT = 28;
const MIN_WIDTH = 180;
const MAX_WIDTH = 420;
const CHAR_WIDTH = 7.4;

export function tableSize(table: Pick<DbTable, "name" | "schema" | "columns">): { width: number; height: number } {
  const title = (table.schema ? table.schema.length + 1 : 0) + table.name.length;
  const longestRow = Math.max(0, ...table.columns.map((column) => column.name.length + column.type.length));
  const width = Math.max(title * CHAR_WIDTH + 40, longestRow * CHAR_WIDTH + 76);
  return {
    width: Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width))),
    height: HEADER_HEIGHT + Math.max(1, table.columns.length) * ROW_HEIGHT,
  };
}

function readLayout(json: string): Layout | null {
  try {
    const value: unknown = JSON.parse(json);
    const tables = (value as { tables?: unknown } | null)?.tables;
    if (!tables || typeof tables !== "object" || Array.isArray(tables)) return null;
    const layout: Layout = {};
    for (const [id, point] of Object.entries(tables as Record<string, unknown>)) {
      const { x, y } = (point ?? {}) as Partial<Point>;
      if (Number.isFinite(x) && Number.isFinite(y)) layout[id] = { x: x as number, y: y as number };
    }
    return layout;
  } catch {
    return null;
  }
}

/**
 * Splits the text into the DBML and the layout block. The tool writes the block at the end, but the
 * user can type after it. The last block holds the positions. Each block becomes its line breaks in
 * the DBML, so the text after a block stays and line numbers do not change.
 */
export function splitLayout(text: string): SplitText {
  const blocks = Array.from(text.matchAll(BLOCK));
  if (blocks.length === 0) return { schema: text, layout: {}, warning: null };
  const last = blocks[blocks.length - 1];
  let schema = "";
  let at = 0;
  for (const block of blocks) {
    schema += text.slice(at, block.index) + block[0].replace(/[^\n]/g, "");
    at = block.index! + block[0].length;
  }
  const rest = text.slice(at);
  // A block at the end leaves only the DBML before it
  if (blocks.length === 1 && !rest.trim()) schema = text.slice(0, last.index);
  else schema += rest;
  const layout = readLayout(last[1]);
  return {
    schema,
    layout: layout ?? {},
    warning: layout ? null : "The table positions at the end of the file are not valid. The tool lays out the tables again.",
  };
}

/** Writes the layout block. Each table is on its own line, in name order, so saved files give small diffs. */
export function layoutBlock(layout: Layout): string {
  const ids = Object.keys(layout).sort();
  // "*/" in a name would end the comment, so write the slash as a JSON escape
  const lines = ids.map((id) => `  ${JSON.stringify(id).replace(/\*\//g, "*\\/")}: {"x": ${Math.round(layout[id].x)}, "y": ${Math.round(layout[id].y)}}`);
  return `/* ${MARKER}\n{"version": 1, "tables": {\n${lines.join(",\n")}\n}}\n*/\n`;
}

/** Joins the DBML and the layout. With no positions, the text has no layout block. */
export function joinLayout(schema: string, layout: Layout): string {
  if (Object.keys(layout).length === 0) return schema;
  const body = schema.replace(/\s*$/, "");
  return `${body}${body ? "\n\n" : ""}${layoutBlock(layout)}`;
}

/** Replaces the layout block of a text and keeps the DBML as it is. */
export function withLayout(text: string, layout: Layout): string {
  return joinLayout(splitLayout(text).schema, layout);
}

/** Keeps only the positions of tables in the model. */
export function pruneLayout(model: DbModel, layout: Layout): Layout {
  const ids = new Set(model.tables.map((table) => table.id));
  return Object.fromEntries(Object.entries(layout).filter(([id]) => ids.has(id)));
}

const GAP = 80;

function dagreLayout(model: DbModel, tables: DbTable[]): Layout {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 40, ranksep: GAP, marginx: 0, marginy: 0 });
  graph.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(tables.map((table) => table.id));
  for (const table of tables) graph.setNode(table.id, tableSize(table));
  for (const ref of model.refs) {
    // The table on the "one" side goes to the left of the table that refers to it
    const [parent, child] = ref.from.cardinality.endsWith("many") ? [ref.to.table, ref.from.table] : [ref.from.table, ref.to.table];
    if (parent !== child && ids.has(parent) && ids.has(child)) graph.setEdge(parent, child);
  }
  dagre.layout(graph);
  const layout: Layout = {};
  for (const table of tables) {
    const node = graph.node(table.id);
    const size = tableSize(table);
    layout[table.id] = { x: Math.round(node.x - size.width / 2), y: Math.round(node.y - size.height / 2) };
  }
  return layout;
}

/** Lays out every table and ignores saved positions. */
export function autoLayout(model: DbModel): Layout {
  return dagreLayout(model, model.tables);
}

/**
 * Gives a position to each table that has none. New tables go to the right of the tables that
 * have positions, so they do not cover them.
 */
export function placeMissing(model: DbModel, layout: Layout): Layout {
  const missing = model.tables.filter((table) => !layout[table.id]);
  if (missing.length === 0) return layout;
  const placed = model.tables.filter((table) => layout[table.id]);
  if (placed.length === 0) return { ...layout, ...dagreLayout(model, missing) };

  const right = Math.max(...placed.map((table) => layout[table.id].x + tableSize(table).width));
  const top = Math.min(...placed.map((table) => layout[table.id].y));
  const extra = dagreLayout(model, missing);
  const left = Math.min(...Object.values(extra).map((point) => point.x));
  const upper = Math.min(...Object.values(extra).map((point) => point.y));
  const next = { ...layout };
  for (const [id, point] of Object.entries(extra)) next[id] = { x: point.x - left + right + GAP, y: point.y - upper + top };
  return next;
}

export type Side = "left" | "right";

/** Canvas handle ids are `c<column index>-<side>`, so column names with any characters work. */
export const handleId = (index: number, side: Side) => `c${index}-${side}`;

export const columnIndexOf = (handle: string | null | undefined) => Number(/^c(\d+)-/.exec(handle ?? "")?.[1] ?? -1);

/** The distance from the top of a table to the middle of a column row. */
export function columnOffset(table: Pick<DbTable, "columns">, column: string): number {
  return rowCenter(Math.max(0, table.columns.findIndex((item) => item.name === column)));
}

/** The distance from the top of a table to the middle of a column row. */
export const rowCenter = (index: number) => HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;

export interface RefEnds {
  fromSide: Side;
  toSide: Side;
  /** The row of the first column at each end. */
  fromIndex: number;
  toIndex: number;
}

/**
 * Where the line of a reference leaves each table: the side and the row. The canvas and the SVG
 * export both use it, so they draw the same lines. Null when a table has no box.
 */
export function refEnds(model: DbModel, ref: Pick<DbRef, "from" | "to">, boxes: Map<string, Point & { width: number }>): RefEnds | null {
  const fromTable = model.tables.find((table) => table.id === ref.from.table);
  const toTable = model.tables.find((table) => table.id === ref.to.table);
  const from = boxes.get(ref.from.table);
  const to = boxes.get(ref.to.table);
  if (!fromTable || !toTable || !from || !to) return null;
  const [fromSide, toSide] = edgeSides(from, to);
  const row = (table: DbTable, column: string) => Math.max(0, table.columns.findIndex((item) => item.name === column));
  return { fromSide, toSide, fromIndex: row(fromTable, ref.from.columns[0]), toIndex: row(toTable, ref.to.columns[0]) };
}

/** The sides where a line between two tables leaves each table. */
export function edgeSides(from: Point & { width: number }, to: Point & { width: number }): [Side, Side] {
  const fromCenter = from.x + from.width / 2;
  const toCenter = to.x + to.width / 2;
  if (from.x + from.width < to.x) return ["right", "left"];
  if (to.x + to.width < from.x) return ["left", "right"];
  // The tables overlap on the x axis, so the line goes around one side
  return fromCenter <= toCenter ? ["left", "left"] : ["right", "right"];
}

const direction = (side: Side) => (side === "right" ? 1 : -1);

/** The length of the straight part at each end of a line. The cardinality marks sit on it. */
export const EDGE_STUB = 24;

/**
 * A line from one table edge to another. It leaves each table with a straight horizontal part,
 * so the cardinality marks always cross it at a right angle, and a curve joins the two parts.
 */
export function edgePath(source: Point, sourceSide: Side, target: Point, targetSide: Side): string {
  const start = source.x + direction(sourceSide) * EDGE_STUB;
  const end = target.x + direction(targetSide) * EDGE_STUB;
  const reach = Math.max(40, Math.abs(end - start) / 2);
  const c1 = start + direction(sourceSide) * reach;
  const c2 = end + direction(targetSide) * reach;
  return `M ${source.x} ${source.y} L ${start} ${source.y} C ${c1} ${source.y}, ${c2} ${target.y}, ${end} ${target.y} L ${target.x} ${target.y}`;
}

/**
 * The crow's foot mark for one end of a line, at the table edge. `lines` is a path to stroke.
 * `circle` is the center of the "zero" ring, when the side is optional.
 */
export function cardinalityMark(point: Point, side: Side, cardinality: Cardinality): { lines: string; circle: Point | null } {
  const d = direction(side);
  const { x, y } = point;
  const bar = (at: number) => `M ${x + d * at} ${y - 6} L ${x + d * at} ${y + 6}`;
  const crow = `M ${x} ${y - 7} L ${x + d * 12} ${y} L ${x} ${y + 7}`;
  switch (cardinality) {
    case "one":
      return { lines: `${bar(8)} ${bar(13)}`, circle: null };
    case "zero-or-one":
      return { lines: bar(8), circle: { x: x + d * 16, y } };
    case "many":
      return { lines: `${crow} ${bar(16)}`, circle: null };
    case "zero-or-many":
      return { lines: crow, circle: { x: x + d * 18, y } };
  }
}
