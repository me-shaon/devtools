/**
 * Parses DBML into a plain model for the DB Diagram tool. The @dbml/parse compiler does the parse.
 * The model keeps the source offsets of each table, column, and reference, so that canvas edits
 * can change only the text that they touch.
 */

import { Compiler, DEFAULT_ENTRY, MemoryProjectLayout } from "@dbml/parse";

/** A part of the source text, as character offsets. `end` is exclusive. */
export interface SourceRange {
  start: number;
  end: number;
}

/** One side of a relationship. DBML writes it as `1`, `*`, `0..1`, or `0..*`. */
export type Cardinality = "one" | "zero-or-one" | "many" | "zero-or-many";

export interface DbColumn {
  name: string;
  type: string;
  pk: boolean;
  unique: boolean;
  notNull: boolean;
  increment: boolean;
  /** The default value as DBML writes it, such as `'draft'`, `0`, or `` `now()` ``. */
  default: string | null;
  note: string | null;
  /** The TablePartial that the column comes from, or null for a column of the table itself. */
  partial: string | null;
  /** The column definition. For a partial column, this is the definition in the TablePartial. */
  range: SourceRange;
}

export interface DbTable {
  /** The table name with its schema, without the default `public` schema. */
  id: string;
  schema: string | null;
  name: string;
  alias: string | null;
  note: string | null;
  color: string | null;
  columns: DbColumn[];
  /** The `~partial` lines of the table. */
  injections: SourceRange[];
  range: SourceRange;
}

export interface DbEndpoint {
  table: string;
  columns: string[];
  cardinality: Cardinality;
}

export interface DbRef {
  name: string | null;
  from: DbEndpoint;
  to: DbEndpoint;
  /** True for a `[ref: > table.column]` column setting, false for a `Ref:` line or block. */
  inline: boolean;
  onDelete: string | null;
  onUpdate: string | null;
  /** The TablePartial whose column holds the reference, or null. Canvas edits cannot change it. */
  partial: string | null;
  range: SourceRange;
}

export interface DbEnum {
  id: string;
  schema: string | null;
  name: string;
  values: string[];
}

export interface DbGroup {
  name: string;
  tables: string[];
  color: string | null;
}

export interface DbModel {
  tables: DbTable[];
  refs: DbRef[];
  enums: DbEnum[];
  groups: DbGroup[];
}

export interface DbError {
  message: string;
  /** 1-based line and column, or 0 when the parser gives no location. */
  line: number;
  column: number;
}

export type ParseResult = { ok: true; model: DbModel } | { ok: false; errors: DbError[] };

export const DEFAULT_SCHEMA = "public";

export const EMPTY_MODEL: DbModel = { tables: [], refs: [], enums: [], groups: [] };

export function tableId(schema: string | null | undefined, name: string): string {
  return schema && schema !== DEFAULT_SCHEMA ? `${schema}.${name}` : name;
}

/** Writes a name for DBML, with double quotes when it is not a plain identifier. */
export function quoteName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Writes a table id (`schema.name` or `name`) for DBML. */
export function quoteTableId(table: Pick<DbTable, "schema" | "name">): string {
  return table.schema && table.schema !== DEFAULT_SCHEMA ? `${quoteName(table.schema)}.${quoteName(table.name)}` : quoteName(table.name);
}

export function cardinalityOf(relation: string): Cardinality {
  const many = relation.endsWith("*");
  const optional = relation.startsWith("0");
  if (many) return optional ? "zero-or-many" : "many";
  return optional ? "zero-or-one" : "one";
}

export const isMany = (cardinality: Cardinality) => cardinality === "many" || cardinality === "zero-or-many";

/* The parser model is loosely typed, so these are the parts that the tool reads. */
interface RawToken {
  start: { offset: number };
  end: { offset: number };
}
interface RawField {
  name: string;
  type: { type_name: string };
  pk: boolean;
  unique: boolean;
  not_null?: boolean;
  increment?: boolean;
  dbdefault?: { type: string; value: unknown } | null;
  note?: { value: string } | null;
  inline_refs?: (RawInlineRef & { token: RawToken })[];
  token: RawToken;
}
interface RawInlineRef {
  schemaName: string | null;
  tableName: string;
  fieldNames: string[];
  /** The operator: `>`, `<`, `-`, or `<>`, with `?` on an optional side. */
  relation: string;
}
interface RawTable {
  name: string;
  schemaName: string | null;
  alias: string | null;
  note?: { value: string } | null;
  headerColor?: string | null;
  fields: RawField[];
  partials?: { name: string; token: RawToken }[];
  token: RawToken;
}
interface RawEndpoint {
  schemaName: string | null;
  tableName: string;
  fieldNames: string[];
  relation: string;
}
interface RawRef {
  name?: string | null;
  endpoints: RawEndpoint[];
  onDelete?: string | null;
  onUpdate?: string | null;
  token: RawToken;
}
interface RawDatabase {
  tables: RawTable[];
  tablePartials?: { name: string; fields: RawField[] }[];
  refs: RawRef[];
  enums: { name: string; schemaName: string | null; values: { name: string }[] }[];
  tableGroups: { name: string; color?: string | null; tables: { name: string; schemaName: string | null }[] }[];
}
interface RawError {
  diagnostic: string;
  nodeOrToken?: { startPos?: { line: number; column: number } };
}

const range = (token: RawToken): SourceRange => ({ start: token.start.offset, end: token.end.offset });

function defaultText(value: RawField["dbdefault"]): string | null {
  if (!value) return null;
  if (value.type === "string") return `'${String(value.value).replace(/'/g, "\\'")}'`;
  if (value.type === "expression") return `\`${String(value.value)}\``;
  return String(value.value);
}

/** A compiler that holds one DBML text. */
export function compilerFor(source: string): Compiler {
  const layout = new MemoryProjectLayout();
  layout.setSource(DEFAULT_ENTRY, source);
  return new Compiler(layout);
}

function errorOf(error: RawError): DbError {
  const position = error.nodeOrToken?.startPos;
  return { message: error.diagnostic || "The DBML is not valid.", line: position ? position.line + 1 : 0, column: position ? position.column + 1 : 0 };
}

function columnOf(field: RawField, partial: string | null): DbColumn {
  return {
    name: field.name,
    type: field.type.type_name,
    pk: Boolean(field.pk),
    unique: Boolean(field.unique),
    notNull: Boolean(field.not_null),
    increment: Boolean(field.increment),
    default: defaultText(field.dbdefault),
    note: field.note?.value || null,
    partial,
    range: range(field.token),
  };
}

/**
 * The columns of a table in source order. A `~partial` line adds the partial's columns at that
 * place. A column that the table defines itself wins over a partial column with the same name, and
 * a later partial wins over an earlier one.
 */
function columnsOf(table: RawTable, partials: Map<string, RawField[]>): DbColumn[] {
  const own = new Set(table.fields.map((field) => field.name));
  const injections = [...(table.partials ?? [])].sort((a, b) => a.token.start.offset - b.token.start.offset);
  const winner = new Map<string, number>();
  injections.forEach((injection, index) => (partials.get(injection.name) ?? []).forEach((field) => winner.set(field.name, index)));
  return [
    ...table.fields.map((field) => ({ at: field.token.start.offset, columns: [columnOf(field, null)] })),
    ...injections.map((injection, index) => ({
      at: injection.token.start.offset,
      columns: (partials.get(injection.name) ?? [])
        .filter((field) => !own.has(field.name) && winner.get(field.name) === index)
        .map((field) => columnOf(field, injection.name)),
    })),
  ]
    .sort((a, b) => a.at - b.at)
    .flatMap((item) => item.columns);
}

/** Reads an inline reference operator, such as `>` or `?<`, as the cardinality of each side. */
function inlineCardinalities(relation: string): [Cardinality, Cardinality] {
  const operator = relation.replace(/\?/g, "");
  const left = operator === ">" || operator === "<>" ? "*" : "1";
  const right = operator === "<" || operator === "<>" ? "*" : "1";
  return [cardinalityOf(`${relation.startsWith("?") ? "0.." : ""}${left}`), cardinalityOf(`${relation.endsWith("?") ? "0.." : ""}${right}`)];
}

const nullable = (schema: string | null | undefined) => (schema && schema !== DEFAULT_SCHEMA ? schema : null);

/** Parses DBML text. Offsets in the model are offsets in `source`. */
export function parseDbml(source: string): ParseResult {
  if (!source.trim()) return { ok: true, model: EMPTY_MODEL };
  let raw: RawDatabase | undefined;
  try {
    const compiler = compilerFor(source);
    const errors = compiler.parse.errors(DEFAULT_ENTRY) as unknown as RawError[];
    if (errors.length > 0) return { ok: false, errors: errors.map(errorOf) };
    raw = compiler.parse.rawDb(DEFAULT_ENTRY) as unknown as RawDatabase | undefined;
  } catch (reason) {
    return { ok: false, errors: [{ message: reason instanceof Error ? reason.message : "The DBML is not valid.", line: 0, column: 0 }] };
  }
  if (!raw) return { ok: false, errors: [{ message: "The DBML is not valid.", line: 0, column: 0 }] };

  const partials = new Map((raw.tablePartials ?? []).map((partial) => [partial.name, partial.fields]));
  const tables: DbTable[] = raw.tables.map((table) => ({
    id: tableId(table.schemaName, table.name),
    schema: nullable(table.schemaName),
    name: table.name,
    alias: table.alias ?? null,
    note: table.note?.value || null,
    color: table.headerColor || null,
    range: range(table.token),
    columns: columnsOf(table, partials),
    injections: (table.partials ?? []).map((injection) => range(injection.token)),
  }));
  // A reference inside a table block is a column setting
  const inTable = (refRange: SourceRange) => tables.some((table) => refRange.start > table.range.start && refRange.end < table.range.end);
  const refs: DbRef[] = raw.refs.map((ref) => {
    const [from, to] = ref.endpoints.map((endpoint) => ({
      table: tableId(endpoint.schemaName, endpoint.tableName),
      columns: [...endpoint.fieldNames],
      cardinality: cardinalityOf(endpoint.relation),
    }));
    const refRange = range(ref.token);
    return { name: ref.name || null, from, to, inline: inTable(refRange), onDelete: ref.onDelete || null, onUpdate: ref.onUpdate || null, partial: null, range: refRange };
  });
  // The parser keeps an inline reference of a partial column in the partial. Each table that takes the column gets it.
  const byAlias = new Map(tables.filter((table) => table.alias).map((table) => [table.alias!, table.id]));
  const partialFields = new Map((raw.tablePartials ?? []).map((partial) => [partial.name, new Map(partial.fields.map((field) => [field.name, field]))]));
  for (const table of tables) {
    for (const column of table.columns) {
      const field = column.partial ? partialFields.get(column.partial)?.get(column.name) : undefined;
      for (const inline of field?.inline_refs ?? []) {
        const [fromCardinality, toCardinality] = inlineCardinalities(inline.relation);
        const target = (!inline.schemaName && byAlias.get(inline.tableName)) || tableId(inline.schemaName, inline.tableName);
        refs.push({
          name: null,
          from: { table: table.id, columns: [column.name], cardinality: fromCardinality },
          to: { table: target, columns: [...inline.fieldNames], cardinality: toCardinality },
          inline: true,
          onDelete: null,
          onUpdate: null,
          partial: column.partial,
          range: range(inline.token),
        });
      }
    }
  }
  return {
    ok: true,
    model: {
      tables,
      refs,
      enums: raw.enums.map((item) => ({ id: tableId(item.schemaName, item.name), schema: nullable(item.schemaName), name: item.name, values: item.values.map((value) => value.name) })),
      groups: raw.tableGroups.map((group) => ({ name: group.name, color: group.color || null, tables: group.tables.map((table) => tableId(table.schemaName, table.name)) })),
    },
  };
}

export const findTable = (model: DbModel, id: string) => model.tables.find((table) => table.id === id);

/** True when a column is the many side of a reference, or a column other than the primary key in a one-to-one reference. */
export function isForeignKey(model: DbModel, table: string, column: string): boolean {
  const pk = findTable(model, table)?.columns.find((item) => item.name === column)?.pk ?? false;
  return model.refs.some((ref) =>
    [
      [ref.from, ref.to],
      [ref.to, ref.from],
    ].some(([end, other]) => end.table === table && end.columns.includes(column) && (isMany(end.cardinality) || (!isMany(other.cardinality) && !pk))),
  );
}

/** Names a reference by its ends. DBML does not allow two references with the same ends, so the key is unique. */
export const refKey = (ref: Pick<DbRef, "from" | "to">) => JSON.stringify([ref.from.table, ref.from.columns, ref.to.table, ref.to.columns]);
