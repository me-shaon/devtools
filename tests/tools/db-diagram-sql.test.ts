import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDbml, type DbModel } from "@/utils/db-diagram/model";
import { exportSql, importSql, type ExportDialect } from "@/utils/db-diagram/sql";

const parse = (source: string): DbModel => {
  const result = parseDbml(source);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.model;
};

const imported = async (sql: string, dialect: Parameters<typeof importSql>[1]) => {
  const result = await importSql(sql, dialect);
  if (!result.ok) throw new Error(result.errors[0].message);
  return parse(result.text);
};

const SAMPLE = `Enum status {
  draft
  published
}

Table users {
  id integer [pk, increment]
  email varchar(255) [unique, not null]
}

Table posts {
  id integer [pk]
  user_id integer [not null, ref: > users.id]
  state status
}
`;

describe("importSql", () => {
  it("imports PostgreSQL tables, a foreign key, a unique column, and an enum", async () => {
    const model = await imported(
      `CREATE TYPE status AS ENUM ('draft', 'published');
       CREATE TABLE users (id serial PRIMARY KEY, email varchar(255) NOT NULL UNIQUE);
       CREATE TABLE posts (id int PRIMARY KEY, user_id int REFERENCES users(id), state status);`,
      "postgres",
    );
    expect(model.tables.map((table) => table.id)).toEqual(["users", "posts"]);
    expect(model.tables[0].columns[1]).toMatchObject({ name: "email", unique: true, notNull: true });
    expect(model.enums[0].values).toEqual(["draft", "published"]);
    expect(model.refs).toHaveLength(1);
  });

  it("imports MySQL with AUTO_INCREMENT and a FOREIGN KEY constraint", async () => {
    const model = await imported(
      "CREATE TABLE `a` (`id` int NOT NULL AUTO_INCREMENT, PRIMARY KEY (`id`)) ENGINE=InnoDB;\n" +
        "CREATE TABLE `b` (`id` int, `a_id` int, CONSTRAINT fk FOREIGN KEY (`a_id`) REFERENCES `a` (`id`));",
      "mysql",
    );
    expect(model.tables[0].columns[0]).toMatchObject({ pk: true, increment: true });
    expect(model.refs[0].name).toBe("fk");
  });

  it("reads ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY as a reference", async () => {
    const model = await imported(
      "CREATE TABLE a (id int PRIMARY KEY); CREATE TABLE b (id int, a_id int);\nALTER TABLE b ADD CONSTRAINT f FOREIGN KEY (a_id) REFERENCES a (id);",
      "postgres",
    );
    expect(model.refs).toHaveLength(1);
  });

  it("imports common SQLite DDL", async () => {
    const model = await imported(
      `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE);
       CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);`,
      "sqlite",
    );
    expect(model.tables.map((table) => table.id)).toEqual(["users", "posts"]);
    expect(model.refs[0].onDelete).toBe("cascade");
  });

  it("gives a short error with a line number for SQL that is not valid", async () => {
    const result = await importSql("CREATE TABLE a (\n  id int,,\n);", "postgres");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].line).toBe(2);
    expect(result.errors[0].message.length).toBeLessThanOrEqual(161);
  });

  it("gives an error for empty SQL and for SQL with no tables", async () => {
    expect((await importSql("  ", "postgres")).ok).toBe(false);
    expect((await importSql("SELECT 1;", "postgres")).ok).toBe(false);
  });
});

describe("exportSql", () => {
  it.each<ExportDialect>(["postgres", "mysql", "mssql", "oracle"])("writes CREATE TABLE and a foreign key for %s", async (dialect) => {
    const result = await exportSql(SAMPLE, dialect);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toMatch(/CREATE TABLE/);
    expect(result.text).toMatch(/FOREIGN KEY/);
  });

  it("keeps tables, columns, and foreign keys after export and import", async () => {
    const sql = await exportSql(SAMPLE, "postgres");
    if (!sql.ok) throw new Error("export failed");
    const model = await imported(sql.text, "postgres");
    expect(model.tables.map((table) => [table.id, table.columns.map((column) => column.name)])).toEqual([
      ["users", ["id", "email"]],
      ["posts", ["id", "user_id", "state"]],
    ]);
    expect(model.refs).toHaveLength(1);
  });

  it("gives an error for DBML that is not valid", async () => {
    expect((await exportSql("Table a {", "postgres")).ok).toBe(false);
  });
});

describe("converter loading", () => {
  afterEach(() => {
    vi.doUnmock("@dbml/core");
    vi.resetModules();
  });

  it("gives an error when the converter cannot load, and loads it on the next call", async () => {
    vi.resetModules();
    vi.doMock("@dbml/core", () => {
      throw new Error("offline");
    });
    const first = await import("@/utils/db-diagram/sql");
    expect(await first.importSql("CREATE TABLE a (id int);", "postgres")).toMatchObject({ ok: false, errors: [{ message: /Could not load/ }] });
    expect(await first.exportSql("Table a {\n  id int\n}\n", "postgres")).toMatchObject({ ok: false });
    vi.doUnmock("@dbml/core");
    expect(await first.importSql("CREATE TABLE a (id int);", "postgres")).toMatchObject({ ok: true });
  });
});
