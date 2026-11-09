/** Mermaid, JSON, and SVG export for the DB Diagram tool. */

import {
  cardinalityMark,
  edgePath,
  HEADER_HEIGHT,
  refEnds,
  ROW_HEIGHT,
  rowCenter,
  tableSize,
  type Layout,
} from "@/utils/db-diagram/layout";
import { findTable, isForeignKey, isMany, type Cardinality, type DbModel } from "@/utils/db-diagram/model";

export type DiagramTheme = "light" | "dark";

/** Colors of the diagram, on the canvas and in exported images. */
export const DIAGRAM_COLORS: Record<DiagramTheme, Record<"background" | "table" | "header" | "headerText" | "text" | "muted" | "border" | "line", string>> = {
  light: { background: "#ffffff", table: "#ffffff", header: "#475569", headerText: "#ffffff", text: "#0f172a", muted: "#64748b", border: "#cbd5e1", line: "#64748b" },
  dark: { background: "#1e1e1e", table: "#262626", header: "#334155", headerText: "#f8fafc", text: "#e5e5e5", muted: "#a3a3a3", border: "#404040", line: "#94a3b8" },
};

/**
 * Mermaid entity names, which have only letters, digits, `_`, and `-`. Two tables that give the
 * same name, such as `s.users` and `s_users`, get a number at the end so they stay apart.
 */
function entityNames(model: DbModel): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const table of model.tables) {
    const base = table.id.replace(/[^A-Za-z0-9_-]/g, "_");
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
    used.add(name);
    names.set(table.id, name);
  }
  return names;
}
const attributeWord = (text: string) => text.replace(/[^A-Za-z0-9_()[\]-]/g, "_") || "_";

const LEFT_MARK: Record<Cardinality, string> = { one: "||", "zero-or-one": "|o", many: "}|", "zero-or-many": "}o" };
const RIGHT_MARK: Record<Cardinality, string> = { one: "||", "zero-or-one": "o|", many: "|{", "zero-or-many": "o{" };

/** Writes the schema as a Mermaid erDiagram. */
export function toMermaid(model: DbModel): string {
  const names = entityNames(model);
  const entityName = (id: string) => names.get(id) ?? id.replace(/[^A-Za-z0-9_-]/g, "_");
  const lines = ["erDiagram"];
  for (const table of model.tables) {
    lines.push(`  ${entityName(table.id)} {`);
    for (const column of table.columns) {
      const keys = [column.pk && "PK", isForeignKey(model, table.id, column.name) && "FK", column.unique && !column.pk && "UK"].filter(Boolean);
      const note = column.note ? ` "${column.note.replace(/["\n]/g, " ")}"` : "";
      lines.push(`    ${attributeWord(column.type)} ${attributeWord(column.name)}${keys.length ? ` ${keys.join(", ")}` : ""}${note}`);
    }
    lines.push("  }");
  }
  for (const ref of model.refs) {
    // The label names the column that refers to the other table
    const label = (isMany(ref.to.cardinality) ? ref.to : ref.from).columns.join(", ").replace(/"/g, "'");
    lines.push(`  ${entityName(ref.from.table)} ${LEFT_MARK[ref.from.cardinality]}--${RIGHT_MARK[ref.to.cardinality]} ${entityName(ref.to.table)} : "${label}"`);
  }
  return `${lines.join("\n")}\n`;
}

/** Writes the schema and the table positions as JSON, without source offsets. */
export function toJson(model: DbModel, layout: Layout): string {
  const value = {
    tables: model.tables.map(({ range: _range, injections: _injections, columns, ...table }) => ({
      ...table,
      position: layout[table.id] ?? null,
      columns: columns.map(({ range: _columnRange, ...column }) => column),
    })),
    refs: model.refs.map(({ range: _range, inline: _inline, partial: _partial, ...ref }) => ref),
    enums: model.enums,
    groups: model.groups,
  };
  return `${JSON.stringify(value, null, 2)}\n`;
}

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const MARGIN = 24;
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

/** Draws the diagram as SVG. Every table must have a position in `layout`. */
export function toSvg(model: DbModel, layout: Layout, theme: DiagramTheme): { svg: string; width: number; height: number } {
  const colors = DIAGRAM_COLORS[theme];
  const boxes = new Map(model.tables.map((table) => [table.id, { ...(layout[table.id] ?? { x: 0, y: 0 }), ...tableSize(table) }]));
  const all = [...boxes.values()];
  const minX = all.length ? Math.min(...all.map((box) => box.x)) - MARGIN : 0;
  const minY = all.length ? Math.min(...all.map((box) => box.y)) - MARGIN : 0;
  const width = Math.ceil(all.length ? Math.max(...all.map((box) => box.x + box.width)) + MARGIN - minX : 2 * MARGIN);
  const height = Math.ceil(all.length ? Math.max(...all.map((box) => box.y + box.height)) + MARGIN - minY : 2 * MARGIN);

  const parts: string[] = [];
  for (const ref of model.refs) {
    const ends = refEnds(model, ref, boxes);
    if (!ends) continue;
    const { fromSide, toSide } = ends;
    const from = boxes.get(ref.from.table)!;
    const to = boxes.get(ref.to.table)!;
    const start = { x: fromSide === "right" ? from.x + from.width : from.x, y: from.y + rowCenter(ends.fromIndex) };
    const end = { x: toSide === "right" ? to.x + to.width : to.x, y: to.y + rowCenter(ends.toIndex) };
    parts.push(`<path class="ref" d="${edgePath(start, fromSide, end, toSide)}" fill="none" stroke="${colors.line}" stroke-width="1.5"/>`);
    for (const [point, side, cardinality] of [
      [start, fromSide, ref.from.cardinality],
      [end, toSide, ref.to.cardinality],
    ] as const) {
      const mark = cardinalityMark(point, side, cardinality);
      parts.push(`<path d="${mark.lines}" fill="none" stroke="${colors.line}" stroke-width="1.5"/>`);
      if (mark.circle) parts.push(`<circle cx="${mark.circle.x}" cy="${mark.circle.y}" r="3.5" fill="${colors.background}" stroke="${colors.line}" stroke-width="1.5"/>`);
    }
  }

  for (const table of model.tables) {
    const box = boxes.get(table.id)!;
    const title = table.schema ? `${table.schema}.${table.name}` : table.name;
    const rows = table.columns.map((column, index) => {
      const y = box.y + HEADER_HEIGHT + index * ROW_HEIGHT;
      const keys = [column.pk && "PK", isForeignKey(model, table.id, column.name) && "FK"].filter(Boolean).join(" ");
      const name = `${escapeXml(column.name)}${column.notNull && !column.pk ? " *" : ""}`;
      return [
        index > 0 ? `<line x1="${box.x}" y1="${y}" x2="${box.x + box.width}" y2="${y}" stroke="${colors.border}"/>` : "",
        `<text x="${box.x + 10}" y="${y + ROW_HEIGHT / 2}" dominant-baseline="central" fill="${colors.text}"${column.pk ? ' font-weight="600"' : ""}>${name}</text>`,
        keys ? `<text x="${box.x + box.width - 10}" y="${y + ROW_HEIGHT / 2}" dominant-baseline="central" text-anchor="end" fill="${colors.muted}" font-size="10">${keys}</text>` : "",
        `<text x="${box.x + box.width - (keys ? 44 : 10)}" y="${y + ROW_HEIGHT / 2}" dominant-baseline="central" text-anchor="end" fill="${colors.muted}">${escapeXml(column.type)}</text>`,
      ].join("");
    });
    parts.push(
      `<g class="table" data-table="${escapeXml(table.id)}">` +
        `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="6" fill="${colors.table}" stroke="${colors.border}"/>` +
        `<path d="M ${box.x} ${box.y + HEADER_HEIGHT} V ${box.y + 6} a 6 6 0 0 1 6 -6 H ${box.x + box.width - 6} a 6 6 0 0 1 6 6 V ${box.y + HEADER_HEIGHT} Z" fill="${escapeXml(table.color ?? colors.header)}"/>` +
        `<text x="${box.x + 10}" y="${box.y + HEADER_HEIGHT / 2}" dominant-baseline="central" fill="${colors.headerText}" font-weight="600">${escapeXml(title)}</text>` +
        rows.join("") +
        `</g>`,
    );
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" font-family="${FONT}" font-size="12">` +
    `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${colors.background}"/>` +
    parts.join("") +
    `</svg>`;
  return { svg, width, height };
}
