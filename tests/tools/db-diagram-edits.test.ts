import { describe, expect, it } from "vitest";
import { applyEdit, type EditOp } from "@/utils/db-diagram/edits";
import { parseDbml, type DbModel } from "@/utils/db-diagram/model";

const SAMPLE = `// Accounts
Table users {
  // The primary key
  id integer [pk, increment]
  email varchar(255) [not null] // login name
}

Table auth.sessions as S {
  id int [pk]
  user_id integer [ref: > users.id, note: 'owner']
}

Table posts {
  id int [pk]
  author_id int
  indexes {
    (author_id, id) [unique]
  }
}

Ref: posts.author_id > users.id [delete: cascade]
Ref fk_compound: posts.(author_id, id) > users.(id, email)

TableGroup core {
  users
  posts
}
`;

const parse = (source: string): DbModel => {
  const result = parseDbml(source);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.model;
};

const edit = (op: EditOp, source = SAMPLE): string => {
  const result = applyEdit(source, parse(source), op);
  if (!result.ok) throw new Error(result.error);
  expect(parseDbml(result.text).ok).toBe(true);
  return result.text;
};

const columns = (source: string, table: string) => parse(source).tables.find((item) => item.id === table)!.columns;

describe("table edits", () => {
  it("adds a table with a unique name and gives its id", () => {
    const result = applyEdit(SAMPLE, parse(SAMPLE), { kind: "add-table" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.table).toBe("table_1");
    expect(parse(result.text).tables.map((table) => table.id)).toContain("table_1");
    expect(result.text.startsWith(SAMPLE.trimEnd())).toBe(true);
  });

  it("renames a table and every reference to it", () => {
    const text = edit({ kind: "rename-table", table: "users", name: "accounts" });
    const model = parse(text);
    expect(model.tables.map((table) => table.id)).toContain("accounts");
    expect(model.refs.every((ref) => ref.from.table !== "users" && ref.to.table !== "users")).toBe(true);
    expect(model.refs.filter((ref) => ref.from.table === "accounts" || ref.to.table === "accounts")).toHaveLength(3);
    expect(model.groups[0].tables).toContain("accounts");
    expect(text).toContain("// The primary key");
  });

  it("does not rename a table to a name that exists", () => {
    const result = applyEdit(SAMPLE, parse(SAMPLE), { kind: "rename-table", table: "users", name: "posts" });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/already/) });
  });

  it("deletes a table, its references, and its table group entry", () => {
    const text = edit({ kind: "delete-table", table: "users" });
    const model = parse(text);
    expect(model.tables.map((table) => table.id).sort()).toEqual(["auth.sessions", "posts"]);
    expect(model.refs).toEqual([]);
    expect(model.groups[0].tables).toEqual(["posts"]);
    expect(text).toContain("note: 'owner'");
    expect(text).not.toContain("\n\n\n");
  });

  it("sets and removes the header color", () => {
    const colored = edit({ kind: "set-color", table: "auth.sessions", color: "#ff8800" });
    const color = (source: string) => parse(source).tables.find((table) => table.id === "auth.sessions")!.color;
    expect(color(colored)).toBe("#ff8800");
    expect(color(edit({ kind: "set-color", table: "auth.sessions", color: null }, colored))).toBeNull();
  });
});

describe("column edits", () => {
  it("adds a column after the last column", () => {
    const text = edit({ kind: "add-column", table: "users", name: "created_at", type: "timestamp" });
    expect(columns(text, "users").map((column) => column.name)).toEqual(["id", "email", "created_at"]);
    expect(text).toContain("  email varchar(255) [not null] // login name\n  created_at timestamp\n");
  });

  it("adds a column to a one-line table", () => {
    const oneLine = "Table t { a int }\n";
    expect(columns(edit({ kind: "add-column", table: "t", name: "b", type: "int" }, oneLine), "t").map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("quotes a column name that needs quotes", () => {
    const text = edit({ kind: "add-column", table: "users", name: "first name", type: "text" });
    expect(text).toContain('"first name" text');
  });

  it("renames a column and updates references and indexes", () => {
    const text = edit({ kind: "rename-column", table: "users", column: "id", name: "user_id" });
    const model = parse(text);
    expect(columns(text, "users")[0]).toMatchObject({ name: "user_id", pk: true, increment: true });
    const toUsers = model.refs.filter((ref) => ref.to.table === "users" || ref.from.table === "users");
    expect(toUsers.flatMap((ref) => [ref.from, ref.to]).filter((end) => end.table === "users").map((end) => end.columns)).toEqual(
      expect.arrayContaining([["user_id"], ["user_id", "email"]]),
    );
    // The column in another table that has the same name stays the same
    expect(columns(text, "posts")[0].name).toBe("id");
  });

  it("renames a column that is in an index", () => {
    const text = edit({ kind: "rename-column", table: "posts", column: "author_id", name: "writer_id" });
    expect(text).toContain("(writer_id, id) [unique]");
    expect(text).toContain("Ref: posts.writer_id > users.id");
  });

  it("does not rename a column to a name that exists", () => {
    const result = applyEdit(SAMPLE, parse(SAMPLE), { kind: "rename-column", table: "users", column: "id", name: "email" });
    expect(result.ok).toBe(false);
  });

  it("changes the type", () => {
    const text = edit({ kind: "set-type", table: "users", column: "email", type: "text" });
    expect(text).toContain("  email text [not null] // login name\n");
  });

  it("turns flags on and off", () => {
    let text = edit({ kind: "set-flag", table: "users", column: "email", flag: "unique", on: true });
    expect(text).toContain("email varchar(255) [not null, unique] // login name");
    text = edit({ kind: "set-flag", table: "users", column: "email", flag: "not null", on: false }, text);
    expect(text).toContain("email varchar(255) [unique] // login name");
    text = edit({ kind: "set-flag", table: "users", column: "email", flag: "unique", on: false }, text);
    expect(text).toContain("  email varchar(255) // login name\n");
    text = edit({ kind: "set-flag", table: "posts", column: "author_id", flag: "not null", on: true }, text);
    expect(columns(text, "posts")[1].notNull).toBe(true);
    text = edit({ kind: "set-flag", table: "users", column: "id", flag: "pk", on: false }, text);
    expect(text).toContain("  id integer [increment]\n");
  });

  it("replaces a null setting when not null turns on", () => {
    const text = edit({ kind: "set-flag", table: "t", column: "a", flag: "not null", on: true }, "Table t {\n  a int [null]\n}\n");
    expect(text).toContain("a int [not null]");
  });

  it("deletes a column with its comment and its references", () => {
    const text = edit({ kind: "delete-column", table: "auth.sessions", column: "user_id" });
    expect(text).not.toContain("user_id");
    expect(parse(text).refs).toHaveLength(2);
  });

  it("keeps the comment line above a deleted column's neighbor", () => {
    const text = edit({ kind: "delete-column", table: "users", column: "email" });
    expect(text).toContain("  // The primary key\n  id integer [pk, increment]\n}");
  });
});

describe("indexes and partials", () => {
  const INDEXED = `Table posts {
  id int [pk]
  user_id int
  slug varchar
  indexes {
    (user_id, id) [unique]
    slug
  }
}
`;

  it("removes a deleted column from a composite index and keeps the other columns", () => {
    const text = edit({ kind: "delete-column", table: "posts", column: "user_id" }, INDEXED);
    expect(text).toContain("    (id) [unique]\n    slug\n");
  });

  it("removes a one-column index with its column", () => {
    const text = edit({ kind: "delete-column", table: "posts", column: "slug" }, INDEXED);
    expect(text).toContain("  indexes {\n    (user_id, id) [unique]\n  }\n");
  });

  it("removes the indexes block when no index is left", () => {
    const text = edit({ kind: "delete-column", table: "t", column: "a" }, "Table t {\n  id int\n  a int\n  indexes {\n    a\n  }\n}\n");
    expect(text).toBe("Table t {\n  id int\n}\n");
  });

  const PARTIAL = "TablePartial base {\n  created_at timestamp\n}\nTable users {\n  id integer [pk]\n  ~base\n}\n";

  it("refuses to edit a column that comes from a TablePartial", () => {
    const result = applyEdit(PARTIAL, parse(PARTIAL), { kind: "rename-column", table: "users", column: "created_at", name: "made_at" });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/TablePartial base/) });
  });

  it("adds a column after the ~partial line", () => {
    const text = edit({ kind: "add-column", table: "users", name: "name", type: "text" }, PARTIAL);
    expect(text).toContain("  ~base\n  name text\n}");
    expect(columns(text, "users").map((column) => column.name)).toEqual(["id", "created_at", "name"]);
  });
});

describe("reference edits", () => {
  it("adds a reference after the last Ref line", () => {
    const text = edit({ kind: "add-ref", from: { table: "posts", column: "id" }, to: { table: "auth.sessions", column: "id" } });
    expect(text).toContain("Ref fk_compound: posts.(author_id, id) > users.(id, email)\nRef: posts.id > auth.sessions.id\n");
  });

  it("adds a reference at the end when there is no Ref line", () => {
    const source = "Table a {\n  id int\n}\nTable b {\n  a_id int\n}\n";
    expect(edit({ kind: "add-ref", from: { table: "b", column: "a_id" }, to: { table: "a", column: "id" } }, source)).toBe(
      `${source}\nRef: b.a_id > a.id\n`,
    );
  });

  it("deletes a top-level and an inline reference", () => {
    const model = parse(SAMPLE);
    const topLevel = model.refs.findIndex((ref) => !ref.inline && ref.name === null);
    let text = edit({ kind: "delete-ref", index: topLevel });
    expect(text).not.toContain("[delete: cascade]");
    const inline = parse(text).refs.findIndex((ref) => ref.inline);
    text = edit({ kind: "delete-ref", index: inline }, text);
    expect(text).toContain("user_id integer [note: 'owner']");
    expect(parse(text).refs).toHaveLength(1);
  });
});

describe("errors", () => {
  it("rejects an empty name", () => {
    expect(applyEdit(SAMPLE, parse(SAMPLE), { kind: "rename-table", table: "users", name: "  " }).ok).toBe(false);
  });

  it("rejects an edit whose result does not parse, and keeps the text", () => {
    const result = applyEdit(SAMPLE, parse(SAMPLE), { kind: "set-type", table: "users", column: "email", type: "varchar(" });
    expect(result.ok).toBe(false);
  });

  it("rejects an edit for a table that does not exist", () => {
    expect(applyEdit(SAMPLE, parse(SAMPLE), { kind: "delete-table", table: "nope" }).ok).toBe(false);
  });
});

describe("edits found in review", () => {
  it("keeps the brackets of an array type when the type or a flag changes", () => {
    const source = "Table t {\n  tags text[] [unique]\n  ids int[]\n}\n";
    expect(edit({ kind: "set-type", table: "t", column: "tags", type: "varchar[]" }, source)).toContain("tags varchar[] [unique]");
    expect(edit({ kind: "set-flag", table: "t", column: "ids", flag: "not null", on: true }, source)).toContain("ids int[] [not null]");
  });

  it("adds a column after the ~partial line, not inside a note that contains ~", () => {
    const source = "Table t {\n  id int\n  Note: '''\n  about ~x rows\n  '''\n}\n";
    const text = edit({ kind: "add-column", table: "t", name: "c", type: "int" }, source);
    expect(columns(text, "t").map((column) => column.name)).toEqual(["id", "c"]);
    expect(parse(text).tables[0].note).toBe(parse(source).tables[0].note);
  });

  it("refuses a type that would turn the column settings into a comment", () => {
    const source = "Table t {\n  id int [pk]\n}\n";
    expect(applyEdit(source, parse(source), { kind: "set-type", table: "t", column: "id", type: "int //" })).toMatchObject({ ok: false });
  });

  it("refuses to change a reference in a TablePartial, and deletes a table that takes it", () => {
    const source = "Table users {\n  id int [pk]\n}\nTablePartial tracked {\n  creator_id int [ref: > users.id]\n}\nTable posts {\n  id int\n  ~tracked\n}\n";
    const model = parse(source);
    expect(applyEdit(source, model, { kind: "delete-ref", index: 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/TablePartial tracked/) });
    expect(applyEdit(source, model, { kind: "delete-table", table: "users" })).toMatchObject({ ok: false, error: expect.stringMatching(/TablePartial tracked/) });
    expect(applyEdit(source, model, { kind: "rename-column", table: "users", column: "id", name: "key" })).toMatchObject({ ok: false });
    const text = edit({ kind: "delete-table", table: "posts" }, source);
    expect(text).toContain("creator_id int [ref: > users.id]");
    expect(parse(text).refs).toEqual([]);
  });

  it("refuses edits that are not valid, with a message", () => {
    const model = parse(SAMPLE);
    const refused = (op: EditOp) => {
      const result = applyEdit(SAMPLE, model, op);
      expect(result.ok).toBe(false);
      return result.ok ? "" : result.error;
    };
    expect(refused({ kind: "add-table", name: "users" })).toMatch(/already exists/);
    expect(refused({ kind: "add-table", name: "  " })).toBeTruthy();
    expect(refused({ kind: "set-color", table: "users", color: "red" })).toMatch(/#3498db/);
    expect(refused({ kind: "add-column", table: "users", name: "email", type: "text" })).toMatch(/already exists/);
    expect(refused({ kind: "add-column", table: "users", name: "x", type: " " })).toBeTruthy();
    expect(refused({ kind: "add-ref", from: { table: "users", column: "id" }, to: { table: "users", column: "id" } })).toMatch(/itself/);
    expect(refused({ kind: "add-ref", from: { table: "posts", column: "nope" }, to: { table: "users", column: "id" } })).toBeTruthy();
    expect(refused({ kind: "delete-ref", index: 99 })).toMatch(/does not exist/);
    expect(refused({ kind: "rename-column", table: "users", column: "nope", name: "x" })).toBeTruthy();
  });

  it("edits a quoted column name, a type with a comma, and a note with a comma", () => {
    const source = 'Table t {\n  "full name" varchar\n  price decimal(10, 2) [note: \'a, b]\']\n}\n';
    expect(edit({ kind: "set-type", table: "t", column: "full name", type: "text" }, source)).toContain('"full name" text');
    expect(edit({ kind: "set-flag", table: "t", column: "price", flag: "not null", on: true }, source)).toContain("price decimal(10, 2) [note: 'a, b]', not null]");
  });

  it("deletes a column and a table in text with CRLF line ends", () => {
    const source = "Table a {\r\n  id int\r\n  b int\r\n}\r\n\r\nTable c {\r\n  id int\r\n}\r\n";
    expect(columns(edit({ kind: "delete-column", table: "a", column: "b" }, source), "a").map((column) => column.name)).toEqual(["id"]);
    expect(parse(edit({ kind: "delete-table", table: "c" }, source)).tables.map((table) => table.id)).toEqual(["a"]);
  });
});
