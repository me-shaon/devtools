/**
 * SQL DDL import and export for the DB Diagram tool, through the @dbml/core importer and exporter.
 * @dbml/core holds a large SQL grammar for each dialect, so it loads only when the user imports or exports SQL.
 */

import type { DbError } from "@/utils/db-diagram/model";

let loader: Promise<typeof import("@dbml/core")> | null = null;
const loadCore = () =>
  (loader ??= import("@dbml/core").catch((reason: unknown) => {
    // Let the next call try again
    loader = null;
    throw reason;
  }));

const LOAD_ERROR: SqlResult = { ok: false, errors: [{ message: "Could not load the SQL converter. Try again.", line: 0, column: 0 }] };

export const IMPORT_DIALECTS = [
  { id: "postgres", label: "PostgreSQL" },
  { id: "mysql", label: "MySQL" },
  { id: "mssql", label: "SQL Server" },
  { id: "snowflake", label: "Snowflake" },
  { id: "sqlite", label: "SQLite" },
] as const;

export const EXPORT_DIALECTS = [
  { id: "postgres", label: "PostgreSQL" },
  { id: "mysql", label: "MySQL" },
  { id: "mssql", label: "SQL Server" },
  { id: "oracle", label: "Oracle" },
] as const;

export type ImportDialect = (typeof IMPORT_DIALECTS)[number]["id"];
export type ExportDialect = (typeof EXPORT_DIALECTS)[number]["id"];

export type SqlResult = { ok: true; text: string } | { ok: false; errors: DbError[] };

/** The importer lists every token that it expected. That list is too long to read, so it is cut. */
const MAX_MESSAGE = 160;

function errorsOf(reason: unknown): DbError[] {
  const diags = (reason as { diags?: unknown[] } | null)?.diags;
  if (Array.isArray(diags) && diags.length > 0) {
    return diags.map((diag) => {
      const item = diag as { text?: string; message?: string; location?: { start?: { line?: number; column?: number } } };
      let message = item.text ?? item.message ?? "The SQL is not valid.";
      message = message.replace(/ expecting \{[\s\S]*$/, "");
      if (message.length > MAX_MESSAGE) message = `${message.slice(0, MAX_MESSAGE)}…`;
      return { message, line: item.location?.start?.line ?? 0, column: item.location?.start?.column ?? 0 };
    });
  }
  return [{ message: reason instanceof Error ? reason.message : "The SQL is not valid.", line: 0, column: 0 }];
}

/**
 * Converts SQL DDL to DBML. SQLite goes through the PostgreSQL importer, which reads common SQLite
 * DDL when the SQLite-only AUTOINCREMENT word is removed.
 */
export async function importSql(sql: string, dialect: ImportDialect): Promise<SqlResult> {
  if (!sql.trim()) return { ok: false, errors: [{ message: "Paste CREATE TABLE statements to import.", line: 0, column: 0 }] };
  const source = dialect === "sqlite" ? sql.replace(/\bAUTOINCREMENT\b/gi, "") : sql;
  let core: typeof import("@dbml/core");
  try {
    core = await loadCore();
  } catch {
    return LOAD_ERROR;
  }
  try {
    const text = core.importer.import(source, dialect === "sqlite" ? "postgres" : dialect);
    if (!text.trim()) return { ok: false, errors: [{ message: "The SQL has no CREATE TABLE statements.", line: 0, column: 0 }] };
    return { ok: true, text: text.replace(/\s*$/, "\n") };
  } catch (reason) {
    return { ok: false, errors: errorsOf(reason) };
  }
}

/** Converts DBML to SQL DDL. */
export async function exportSql(dbml: string, dialect: ExportDialect): Promise<SqlResult> {
  let core: typeof import("@dbml/core");
  try {
    core = await loadCore();
  } catch {
    return LOAD_ERROR;
  }
  try {
    return { ok: true, text: core.exporter.export(dbml, dialect).replace(/\s*$/, "\n") };
  } catch (reason) {
    return { ok: false, errors: errorsOf(reason) };
  }
}
