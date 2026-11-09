/**
 * Canvas edits for the DB Diagram tool. Each edit changes the DBML text only where it must, so
 * comments and formatting in the rest of the text stay. The result is parsed again, and an edit
 * that gives text that does not parse is refused.
 */

import { DEFAULT_ENTRY, SymbolKind } from "@dbml/parse";
import { compilerFor, findTable, parseDbml, quoteName, quoteTableId, tableId, type DbColumn, type DbModel, type DbTable, type SourceRange } from "@/utils/db-diagram/model";

export type ColumnFlag = "pk" | "not null" | "unique";

export interface ColumnRef {
  table: string;
  column: string;
}

export type EditOp =
  | { kind: "add-table"; name?: string }
  | { kind: "rename-table"; table: string; name: string }
  | { kind: "delete-table"; table: string }
  | { kind: "set-color"; table: string; color: string | null }
  | { kind: "add-column"; table: string; name: string; type: string }
  | { kind: "rename-column"; table: string; column: string; name: string }
  | { kind: "set-type"; table: string; column: string; type: string }
  | { kind: "set-flag"; table: string; column: string; flag: ColumnFlag; on: boolean }
  | { kind: "delete-column"; table: string; column: string }
  /** `from` is the column that refers (the many side), `to` is the column that it refers to. */
  | { kind: "add-ref"; from: ColumnRef; to: ColumnRef }
  /** `index` is the position of the reference in `model.refs`. */
  | { kind: "delete-ref"; index: number };

/** `model` is the parse result of `text`. `table` is the id of the table that the edit added, for `add-table`. */
export type EditResult = { ok: true; text: string; model: DbModel; table?: string } | { ok: false; error: string };

interface Splice extends SourceRange {
  text: string;
}

class EditError extends Error {}

function applySplices(text: string, splices: Splice[]): string {
  let result = text;
  for (const splice of [...splices].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, splice.start) + splice.text + result.slice(splice.end);
    // A removed block between two blank lines leaves one blank line
    if (!splice.text) {
      const at = splice.start;
      while (result.slice(at - 2, at) === "\n\n" && result[at] === "\n") result = result.slice(0, at) + result.slice(at + 1);
      if (at === 0) result = result.replace(/^\n+/, "");
    }
  }
  return result;
}

/** Gives the index after the string that starts at `index`. */
function skipString(text: string, index: number): number {
  if (text.startsWith("'''", index)) {
    const close = text.indexOf("'''", index + 3);
    return close < 0 ? text.length : close + 3;
  }
  const quote = text[index];
  for (let i = index + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === quote) return i + 1;
  }
  return text.length;
}

const isQuote = (char: string) => char === "'" || char === '"' || char === "`";
const isSpace = (char: string | undefined) => char === " " || char === "\t";

function trimSpan(text: string, start: number, end: number): SourceRange {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return { start, end };
}

interface FieldParts {
  name: SourceRange;
  type: SourceRange;
  /** The settings with their brackets, or null when the column has none. */
  settings: SourceRange | null;
  items: SourceRange[];
}

/** Finds the name, the type, and each setting in a column definition. */
function fieldParts(text: string, column: DbColumn): FieldParts {
  const { start, end } = column.range;
  let i = start;
  if (text[i] === '"') i = skipString(text, i);
  else while (i < end && !/\s/.test(text[i])) i++;
  const name = { start, end: i };
  while (i < end && /\s/.test(text[i])) i++;

  const typeStart = i;
  let depth = 0;
  while (i < end) {
    const char = text[i];
    if (char === '"' || char === "'") {
      i = skipString(text, i);
      continue;
    }
    // An array type such as text[] or int[3] ends with brackets. Settings start with a bracket that is not empty.
    const array = depth === 0 && char === "[" ? /^\[\d*\]/.exec(text.slice(i, end)) : null;
    if (array) {
      i += array[0].length;
      continue;
    }
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (depth === 0 && (/\s/.test(char) || char === "[")) break;
    i++;
  }
  const type = { start: typeStart, end: i };
  while (i < end && /\s/.test(text[i])) i++;
  if (text[i] !== "[") return { name, type, settings: null, items: [] };

  const open = i;
  const items: SourceRange[] = [];
  let itemStart = ++i;
  depth = 0;
  while (i < end) {
    const char = text[i];
    if (isQuote(char)) {
      i = skipString(text, i);
      continue;
    }
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || (char === "]" && depth > 0)) depth--;
    else if (char === "]") break;
    else if (char === "," && depth === 0) {
      items.push(trimSpan(text, itemStart, i));
      itemStart = i + 1;
    }
    i++;
  }
  const last = trimSpan(text, itemStart, i);
  if (last.end > last.start) items.push(last);
  return { name, type, settings: { start: open, end: i + 1 }, items };
}

function settingsSplice(parts: FieldParts, items: string[]): Splice {
  if (parts.settings) {
    return items.length > 0
      ? { ...parts.settings, text: `[${items.join(", ")}]` }
      : { start: parts.type.end, end: parts.settings.end, text: "" };
  }
  return { start: parts.type.end, end: parts.type.end, text: items.length > 0 ? ` [${items.join(", ")}]` : "" };
}

const settingKey = (setting: string) => setting.toLowerCase().replace(/\s+/g, " ");

const FLAG_KEYS: Record<ColumnFlag, string[]> = { pk: ["pk", "primary key"], "not null": ["not null", "null"], unique: ["unique"] };

/** Removes a range. When the range is the only thing on its lines, the lines go too, with a comment at the end. */
function removal(text: string, range: SourceRange): Splice {
  let start = range.start;
  while (start > 0 && isSpace(text[start - 1])) start--;
  let end = range.end;
  while (isSpace(text[end])) end++;
  if (text.startsWith("//", end)) {
    const newline = text.indexOf("\n", end);
    end = newline < 0 ? text.length : newline;
  }
  if (text[end] === "\r") end++;
  const lineStart = start === 0 || text[start - 1] === "\n";
  const lineEnd = end >= text.length || text[end] === "\n";
  if (lineStart && lineEnd) return { start, end: Math.min(text.length, end + 1), text: "" };
  return { ...range, text: "" };
}

/** End of the line that `index` is on, before the newline. */
function lineEnd(text: string, index: number): number {
  const newline = text.indexOf("\n", index);
  return newline < 0 ? text.length : newline;
}

function indentOf(text: string, index: number): string {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  const before = text.slice(lineStart, index);
  return /^[ \t]+$/.test(before) ? before : "  ";
}

interface Token extends SourceRange {
  kind: "id" | "." | "(" | ")" | "," | "other";
  value: string;
}

/** Splits text into names and punctuation. Stops at a `[`, where reference settings start. */
function tokens(text: string, range: SourceRange, stopAtBracket = true): Token[] {
  const list: Token[] = [];
  let i = range.start;
  while (i < range.end) {
    const char = text[i];
    if (/\s/.test(char)) i++;
    else if (char === "[" && stopAtBracket) break;
    else if (char === '"') {
      const end = skipString(text, i);
      list.push({ kind: "id", value: text.slice(i + 1, end - 1).replace(/\\(.)/g, "$1"), start: i, end });
      i = end;
    } else if (char === "'" || char === "`") {
      const end = skipString(text, i);
      list.push({ kind: "other", value: text.slice(i, end), start: i, end });
      i = end;
    } else if (/[A-Za-z0-9_]/.test(char)) {
      let end = i;
      while (end < range.end && /[A-Za-z0-9_]/.test(text[end])) end++;
      list.push({ kind: "id", value: text.slice(i, end), start: i, end });
      i = end;
    } else {
      const kind = char === "." || char === "(" || char === ")" || char === "," ? char : "other";
      list.push({ kind, value: char, start: i, end: i + 1 });
      i++;
    }
  }
  return list;
}

interface EndpointText {
  table: string[];
  columns: Token[];
}

/** Finds `table.column`, `schema.table.column`, and `table.(a, b)` in a reference. */
function endpointsIn(text: string, range: SourceRange): EndpointText[] {
  const list = tokens(text, range);
  const found: EndpointText[] = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].kind !== "id") continue;
    const chain = [list[i]];
    while (list[i + 1]?.kind === "." && list[i + 2]?.kind === "id") {
      chain.push(list[i + 2]);
      i += 2;
    }
    if (list[i + 1]?.kind === "." && list[i + 2]?.kind === "(") {
      const columns: Token[] = [];
      i += 3;
      while (i < list.length && list[i].kind !== ")") {
        if (list[i].kind === "id") columns.push(list[i]);
        i++;
      }
      found.push({ table: chain.map((token) => token.value), columns });
    } else if (chain.length >= 2) {
      found.push({ table: chain.slice(0, -1).map((token) => token.value), columns: [chain[chain.length - 1]] });
    }
  }
  return found;
}

function resolveTable(model: DbModel, parts: string[]): string | null {
  if (parts.length === 1) {
    const byAlias = model.tables.find((table) => table.alias === parts[0]);
    if (byAlias) return byAlias.id;
  }
  const id = parts.length >= 2 ? tableId(parts[parts.length - 2], parts[parts.length - 1]) : tableId(null, parts[0]);
  return findTable(model, id)?.id ?? null;
}

function requireTable(model: DbModel, id: string): DbTable {
  const table = findTable(model, id);
  if (!table) throw new EditError(`The table ${id} does not exist.`);
  return table;
}

function requireColumn(table: DbTable, name: string): DbColumn {
  const column = table.columns.find((item) => item.name === name);
  if (!column) throw new EditError(`The column ${table.id}.${name} does not exist.`);
  return column;
}

/** A column that the table defines itself. A partial column must be changed in its TablePartial. */
function requireOwnColumn(table: DbTable, name: string): DbColumn {
  const column = requireColumn(table, name);
  if (column.partial) throw new EditError(`The column ${name} comes from TablePartial ${column.partial}. Change it in the DBML.`);
  return column;
}

function requireName(name: string, what: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new EditError(`Type a ${what} name.`);
  return trimmed;
}

/** The table and column that hold an inline reference. */
function ownerOf(model: DbModel, range: SourceRange): { table: DbTable; column: DbColumn } | null {
  for (const table of model.tables) {
    const column = table.columns.find((item) => range.start >= item.range.start && range.end <= item.range.end);
    if (column) return { table, column };
  }
  return null;
}

/** Removes references from the text. Inline references leave the column's other settings. */
function refRemovals(text: string, model: DbModel, refs: number[], skip?: (range: SourceRange) => boolean): Splice[] {
  const splices: Splice[] = [];
  const inline = new Map<DbColumn, SourceRange[]>();
  for (const index of refs) {
    const ref = model.refs[index];
    if (skip?.(ref.range)) continue;
    if (!ref.inline) {
      splices.push(removal(text, ref.range));
      continue;
    }
    const owner = ownerOf(model, ref.range);
    if (owner) inline.set(owner.column, [...(inline.get(owner.column) ?? []), ref.range]);
  }
  for (const [column, ranges] of inline) {
    const parts = fieldParts(text, column);
    const kept = parts.items.filter((item) => !ranges.some((range) => range.start >= item.start && range.end <= item.end));
    splices.push(settingsSplice(parts, kept.map((item) => text.slice(item.start, item.end))));
  }
  return splices;
}

/**
 * The references with an end that passes the test. A reference in a TablePartial cannot change on the
 * canvas, so the edit is refused. A partial reference of the table `owner` is left out, because it goes with the table.
 */
function refIndexes(model: DbModel, test: (end: { table: string; columns: string[] }) => boolean, owner?: string): number[] {
  return model.refs.flatMap((ref, index) => {
    if (!test(ref.from) && !test(ref.to)) return [];
    if (!ref.partial) return [index];
    if (ref.from.table === owner) return [];
    throw new EditError(`TablePartial ${ref.partial} refers to ${ref.to.table}.${ref.to.columns.join(", ")}. Change the reference in the DBML.`);
  });
}

/** Finds names of tables in TableGroup blocks. */
function groupEntries(text: string, model: DbModel, id: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  const header = /\bTableGroup\b[^{]*\{/g;
  for (let match = header.exec(text); match; match = header.exec(text)) {
    const open = match.index + match[0].length;
    const close = text.indexOf("}", open);
    if (close < 0) break;
    const list = tokens(text, { start: open, end: close }, false);
    for (let i = 0; i < list.length; i++) {
      if (list[i].kind !== "id") continue;
      const first = list[i];
      const parts = [first.value];
      let last = first;
      if (list[i + 1]?.kind === "." && list[i + 2]?.kind === "id") {
        last = list[i + 2];
        parts.push(last.value);
        i += 2;
      }
      if (resolveTable(model, parts) === id) ranges.push({ start: first.start, end: last.end });
    }
  }
  return ranges;
}

interface IndexBlock extends SourceRange {
  /** From the `indexes` keyword to the closing brace. */
  whole: SourceRange;
}

function indexBlock(text: string, table: DbTable): IndexBlock | null {
  const body = text.slice(table.range.start, table.range.end);
  const match = /\bindexes\s*\{/i.exec(body);
  if (!match) return null;
  const keyword = table.range.start + match.index;
  const start = keyword + match[0].length;
  let depth = 1;
  for (let i = start; i < table.range.end; i++) {
    if (isQuote(text[i])) {
      i = skipString(text, i) - 1;
      continue;
    }
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return { start, end: i, whole: { start: keyword, end: i + 1 } };
  }
  return null;
}

/**
 * Removes a column from the indexes of a table. A one-column index goes; a composite index keeps
 * its other columns. An `indexes` block with no index left goes too.
 */
function indexRemovals(text: string, table: DbTable, column: string): Splice[] {
  const block = indexBlock(text, table);
  if (!block) return [];
  const splices: Splice[] = [];
  let entries = 0;
  let removed = 0;
  for (let start = block.start; start < block.end; ) {
    const newline = text.indexOf("\n", start);
    const end = newline < 0 || newline > block.end ? block.end : newline;
    const line = trimSpan(text, start, end);
    start = end + 1;
    if (line.end <= line.start || text.startsWith("//", line.start)) continue;
    entries++;
    const list = tokens(text, line);
    const open = list.findIndex((token) => token.kind === "(");
    if (open < 0) {
      if (list.length === 1 && list[0].kind === "id" && list[0].value === column) {
        splices.push(removal(text, line));
        removed++;
      }
      continue;
    }
    const close = list.findIndex((token, index) => index > open && token.kind === ")");
    if (close < 0) continue;
    const parts: string[] = [];
    let part: Token[] = [];
    let found = false;
    for (const token of [...list.slice(open + 1, close), { kind: "," } as Token]) {
      if (token.kind !== ",") {
        part.push(token);
        continue;
      }
      if (part.length === 1 && part[0].kind === "id" && part[0].value === column) found = true;
      else if (part.length > 0) parts.push(text.slice(part[0].start, part[part.length - 1].end));
      part = [];
    }
    if (!found) continue;
    if (parts.length === 0) {
      splices.push(removal(text, line));
      removed++;
    } else {
      splices.push({ start: list[open].start, end: list[close].end, text: `(${parts.join(", ")})` });
    }
  }
  if (entries > 0 && removed === entries) return [removal(text, block.whole)];
  return splices;
}

function addTable(text: string, model: DbModel, name: string | undefined) {
  let next = name?.trim();
  if (next !== undefined) requireName(next, "table");
  for (let n = 1; !next; n++) if (!findTable(model, `table_${n}`)) next = `table_${n}`;
  if (findTable(model, tableId(null, next))) throw new EditError(`A table named ${next} already exists.`);
  const body = text.replace(/\s*$/, "");
  return { text: `${body}${body ? "\n\n" : ""}Table ${quoteName(next)} {\n  id integer [pk]\n}\n`, table: tableId(null, next) };
}

function renameTableText(text: string, model: DbModel, id: string, name: string): string {
  const table = requireTable(model, id);
  const next = requireName(name, "table");
  if (next === table.name) return text;
  if (findTable(model, tableId(table.schema, next))) throw new EditError(`A table named ${next} already exists.`);
  const schema = table.schema ?? undefined;
  const renamed = compilerFor(text).renameTable(DEFAULT_ENTRY, { schema, table: table.name }, { schema, table: next }).get(DEFAULT_ENTRY.absolute) ?? text;
  if (renamed === text) throw new EditError(`The table ${id} could not be renamed.`);
  return renamed;
}

function deleteTable(text: string, model: DbModel, id: string): string {
  const table = requireTable(model, id);
  const inside = (range: SourceRange) => range.start >= table.range.start && range.end <= table.range.end;
  return applySplices(text, [
    removal(text, table.range),
    ...refRemovals(text, model, refIndexes(model, (end) => end.table === id, id), inside),
    ...groupEntries(text, model, id).map((range) => removal(text, range)),
  ]);
}

function setColor(text: string, model: DbModel, id: string, color: string | null): string {
  const table = requireTable(model, id);
  if (color !== null && !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color)) throw new EditError("Use a color such as #3498db.");
  return compilerFor(text).updateElementSetting(DEFAULT_ENTRY, { kind: SymbolKind.Table, schema: table.schema ?? undefined, table: table.name }, "headercolor", color);
}

function addColumn(text: string, model: DbModel, id: string, name: string, type: string): string {
  const table = requireTable(model, id);
  const next = requireName(name, "column");
  const columnType = requireName(type, "type");
  if (table.columns.some((column) => column.name === next)) throw new EditError(`The column ${next} already exists in ${id}.`);
  const line = `${quoteName(next)} ${columnType}`;
  // The new column goes after the last column line or `~partial` line of the table
  const own = table.columns.filter((column) => !column.partial);
  const lastEnd = Math.max(...own.map((column) => column.range.end), ...table.injections.map((injection) => injection.end));
  const first = own[0]?.range.start ?? lastEnd;
  const indent = indentOf(text, first);
  const end = lineEnd(text, lastEnd);
  // In a one-line table the closing brace is on the same line as the column
  const at = table.range.end <= end ? lastEnd : end;
  return applySplices(text, [{ start: at, end: at, text: `\n${indent}${line}` }]);
}

function renameColumn(text: string, model: DbModel, id: string, columnName: string, name: string): string {
  const table = requireTable(model, id);
  const column = requireOwnColumn(table, columnName);
  const next = requireName(name, "column");
  if (next === column.name) return text;
  if (table.columns.some((item) => item.name === next)) throw new EditError(`The column ${next} already exists in ${id}.`);
  const quoted = quoteName(next);
  const splices: Splice[] = [{ ...fieldParts(text, column).name, text: quoted }];

  for (const index of refIndexes(model, (end) => end.table === id && end.columns.includes(columnName))) {
    for (const endpoint of endpointsIn(text, model.refs[index].range)) {
      if (resolveTable(model, endpoint.table) !== id) continue;
      for (const token of endpoint.columns) if (token.value === columnName) splices.push({ start: token.start, end: token.end, text: quoted });
    }
  }
  const indexes = indexBlock(text, table);
  if (indexes) {
    const list = tokens(text, indexes, false);
    let inSettings = false;
    for (const token of list) {
      if (token.value === "[") inSettings = true;
      else if (token.value === "]") inSettings = false;
      else if (!inSettings && token.kind === "id" && token.value === columnName) splices.push({ start: token.start, end: token.end, text: quoted });
    }
  }
  return applySplices(text, splices);
}

function setType(text: string, model: DbModel, id: string, columnName: string, type: string): string {
  const column = requireOwnColumn(requireTable(model, id), columnName);
  return applySplices(text, [{ ...fieldParts(text, column).type, text: requireName(type, "type") }]);
}

function setFlag(text: string, model: DbModel, id: string, columnName: string, flag: ColumnFlag, on: boolean): string {
  const column = requireOwnColumn(requireTable(model, id), columnName);
  const parts = fieldParts(text, column);
  const items = parts.items.map((item) => text.slice(item.start, item.end));
  const kept = items.filter((item) => !FLAG_KEYS[flag].includes(settingKey(item)));
  const has = items.some((item) => settingKey(item) === FLAG_KEYS[flag][0] || (flag === "pk" && settingKey(item) === "primary key"));
  if (has === on && (flag !== "not null" || !items.some((item) => settingKey(item) === "null"))) return text;
  if (on) kept.push(flag);
  return applySplices(text, [settingsSplice(parts, kept)]);
}

function deleteColumn(text: string, model: DbModel, id: string, columnName: string): string {
  const table = requireTable(model, id);
  const column = requireOwnColumn(table, columnName);
  const inside = (range: SourceRange) => range.start >= column.range.start && range.end <= column.range.end;
  return applySplices(text, [
    removal(text, column.range),
    ...refRemovals(text, model, refIndexes(model, (end) => end.table === id && end.columns.includes(columnName)), inside),
    ...indexRemovals(text, table, columnName),
  ]);
}

function addRef(text: string, model: DbModel, from: ColumnRef, to: ColumnRef): string {
  const fromTable = requireTable(model, from.table);
  const toTable = requireTable(model, to.table);
  requireColumn(fromTable, from.column);
  requireColumn(toTable, to.column);
  if (from.table === to.table && from.column === to.column) throw new EditError("A column cannot refer to itself.");
  const line = `Ref: ${quoteTableId(fromTable)}.${quoteName(from.column)} > ${quoteTableId(toTable)}.${quoteName(to.column)}`;
  const last = model.refs.filter((ref) => !ref.inline).sort((a, b) => b.range.end - a.range.end)[0];
  if (last) {
    const at = lineEnd(text, last.range.end);
    return applySplices(text, [{ start: at, end: at, text: `\n${line}` }]);
  }
  const body = text.replace(/\s*$/, "");
  return `${body}${body ? "\n\n" : ""}${line}\n`;
}

function deleteRef(text: string, model: DbModel, index: number): string {
  const ref = model.refs[index];
  if (!ref) throw new EditError("The reference does not exist.");
  if (ref.partial) throw new EditError(`The reference is in TablePartial ${ref.partial}. Delete it in the DBML.`);
  return applySplices(text, refRemovals(text, model, [index]));
}

/** The column that an edit adds or changes, as it must be after the edit. */
function changedColumn(op: EditOp): { table: string; name: string; type?: string } | null {
  if (op.kind === "add-column") return { table: op.table, name: op.name.trim(), type: op.type.trim() };
  if (op.kind === "rename-column") return { table: op.table, name: op.name.trim() };
  if (op.kind === "set-type") return { table: op.table, name: op.column, type: op.type.trim() };
  return null;
}

/** Applies a canvas edit to DBML text. `model` must be the parse result of `text`. */
export function applyEdit(text: string, model: DbModel, op: EditOp): EditResult {
  let next: string;
  let table: string | undefined;
  try {
    switch (op.kind) {
      case "add-table":
        ({ text: next, table } = addTable(text, model, op.name));
        break;
      case "rename-table":
        next = renameTableText(text, model, op.table, op.name);
        break;
      case "delete-table":
        next = deleteTable(text, model, op.table);
        break;
      case "set-color":
        next = setColor(text, model, op.table, op.color);
        break;
      case "add-column":
        next = addColumn(text, model, op.table, op.name, op.type);
        break;
      case "rename-column":
        next = renameColumn(text, model, op.table, op.column, op.name);
        break;
      case "set-type":
        next = setType(text, model, op.table, op.column, op.type);
        break;
      case "set-flag":
        next = setFlag(text, model, op.table, op.column, op.flag, op.on);
        break;
      case "delete-column":
        next = deleteColumn(text, model, op.table, op.column);
        break;
      case "add-ref":
        next = addRef(text, model, op.from, op.to);
        break;
      case "delete-ref":
        next = deleteRef(text, model, op.index);
        break;
    }
  } catch (reason) {
    if (reason instanceof EditError) return { ok: false, error: reason.message };
    throw reason;
  }
  const parsed = parseDbml(next);
  if ("errors" in parsed) return { ok: false, error: `The change does not give valid DBML: ${parsed.errors[0].message}` };
  // A name or type with comment marks can give valid DBML that means something different
  const changed = changedColumn(op);
  if (changed) {
    const column = findTable(parsed.model, changed.table)?.columns.find((item) => item.name === changed.name);
    // The parser gives a type without quotes, and it can change the spaces in it
    const plain = (type: string) => type.replace(/^"(.*)"$/, "$1").replace(/\s+/g, "");
    if (!column || (changed.type !== undefined && plain(column.type) !== plain(changed.type))) return { ok: false, error: "The change did not give the expected column. Edit the DBML instead." };
  }
  return table === undefined ? { ok: true, text: next, model: parsed.model } : { ok: true, text: next, model: parsed.model, table };
}
