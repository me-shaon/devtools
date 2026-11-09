import { describe, expect, it } from "vitest";
import { cardinalityOf, isForeignKey, parseDbml, quoteName, refKey, type DbModel } from "@/utils/db-diagram/model";

const SAMPLE = `// users
Table users [headercolor: #3498DB] {
  id integer [pk, increment] // the id
  email varchar(255) [unique, not null, note: 'Login']
  status post_status [default: 'draft']
  Note: 'All users'
}

Table auth.sessions as S {
  id int [pk]
  user_id int [ref: > users.id]
}

Enum post_status {
  draft
  published
}

Ref: S.id - users.id [delete: cascade]

TableGroup accounts [color: #ff0000] {
  users
  auth.sessions
}
`;

const parse = (source: string): DbModel => {
  const result = parseDbml(source);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.model;
};

describe("parseDbml", () => {
  it("reads tables, columns, and column flags", () => {
    const model = parse(SAMPLE);
    expect(model.tables.map((table) => table.id)).toEqual(["users", "auth.sessions"]);
    const users = model.tables[0];
    expect(users).toMatchObject({ schema: null, name: "users", color: "#3498DB", note: "All users", alias: null });
    expect(users.columns.map((column) => column.name)).toEqual(["id", "email", "status"]);
    expect(users.columns[0]).toMatchObject({ type: "integer", pk: true, increment: true, notNull: false });
    expect(users.columns[1]).toMatchObject({ type: "varchar(255)", unique: true, notNull: true, note: "Login" });
    expect(users.columns[2].default).toBe("'draft'");
  });

  it("keeps the schema and the alias", () => {
    const sessions = parse(SAMPLE).tables[1];
    expect(sessions).toMatchObject({ id: "auth.sessions", schema: "auth", name: "sessions", alias: "S" });
  });

  it("reads inline and top-level references", () => {
    const { refs } = parse(SAMPLE);
    expect(refs).toHaveLength(2);
    const inline = refs.find((ref) => ref.inline)!;
    expect([inline.from, inline.to]).toEqual(
      expect.arrayContaining([
        { table: "users", columns: ["id"], cardinality: "one" },
        { table: "auth.sessions", columns: ["user_id"], cardinality: "many" },
      ]),
    );
    const line = refs.find((ref) => !ref.inline)!;
    expect(line.onDelete).toBe("cascade");
    expect([line.from.cardinality, line.to.cardinality]).toEqual(["one", "one"]);
  });

  it("reads enums and table groups", () => {
    const model = parse(SAMPLE);
    expect(model.enums).toEqual([{ id: "post_status", schema: null, name: "post_status", values: ["draft", "published"] }]);
    expect(model.groups).toEqual([{ name: "accounts", color: "#ff0000", tables: ["users", "auth.sessions"] }]);
  });

  it("gives ranges that point at the source of each element", () => {
    const model = parse(SAMPLE);
    const slice = (range: { start: number; end: number }) => SAMPLE.slice(range.start, range.end);
    expect(slice(model.tables[0].range)).toMatch(/^Table users[\s\S]*\}$/);
    expect(slice(model.tables[0].columns[1].range)).toBe("email varchar(255) [unique, not null, note: 'Login']");
    expect(slice(model.refs.find((ref) => !ref.inline)!.range)).toBe("Ref: S.id - users.id [delete: cascade]");
    expect(slice(model.refs.find((ref) => ref.inline)!.range)).toBe("ref: > users.id");
  });

  it("marks foreign keys", () => {
    const model = parse(SAMPLE);
    expect(isForeignKey(model, "auth.sessions", "user_id")).toBe(true);
    expect(isForeignKey(model, "users", "email")).toBe(false);
    expect(isForeignKey(model, "users", "id")).toBe(false);
  });

  it("does not mark the referenced column of a many-to-one reference as a foreign key", () => {
    const model = parse("Table users {\n  id int [pk]\n  email varchar [unique]\n}\nTable orders {\n  e varchar\n}\nRef: orders.e > users.email\n");
    expect(isForeignKey(model, "users", "email")).toBe(false);
    expect(isForeignKey(model, "orders", "e")).toBe(true);
  });

  it("adds TablePartial columns at the injection line, and a table column wins over a partial column", () => {
    const model = parse(
      "TablePartial base {\n  id bigint\n  created_at timestamp\n}\nTable users {\n  id integer [pk]\n  ~base\n  name text\n}\n",
    );
    const users = model.tables[0];
    expect(users.columns.map((column) => [column.name, column.partial])).toEqual([
      ["id", null],
      ["created_at", "base"],
      ["name", null],
    ]);
    expect(users.columns[0].type).toBe("integer");
  });

  it("takes a column from the later partial when two partials define it", () => {
    const model = parse("TablePartial p1 {\n  x int\n}\nTablePartial p2 {\n  x varchar\n}\nTable t {\n  id int\n  ~p1\n  ~p2\n}\n");
    expect(model.tables[0].columns.map((column) => [column.name, column.type, column.partial])).toEqual([
      ["id", "int", null],
      ["x", "varchar", "p2"],
    ]);
  });

  it("adds the inline references of partial columns for each table that takes them", () => {
    const model = parse(
      "Table users {\n  id int [pk]\n}\nTablePartial tracked {\n  creator_id int [ref: > users.id]\n}\nTable posts {\n  id int\n  ~tracked\n}\nTable pages {\n  id int\n  ~tracked\n}\n",
    );
    expect(model.refs.map((ref) => [ref.from.table, ref.from.columns[0], ref.from.cardinality, ref.to.table, ref.to.cardinality, ref.partial])).toEqual([
      ["posts", "creator_id", "many", "users", "one", "tracked"],
      ["pages", "creator_id", "many", "users", "one", "tracked"],
    ]);
    expect(isForeignKey(model, "posts", "creator_id")).toBe(true);
    expect(model.tables[1].injections).toHaveLength(1);
  });

  it("gives each reference a key from its ends", () => {
    const [ref] = parse("Table a { id int }\nTable b { a_id int [ref: > a.id] }\n").refs;
    expect(refKey(ref)).toBe(JSON.stringify(["a", ["id"], "b", ["a_id"]]));
  });

  it("gives an empty model for empty text", () => {
    expect(parseDbml("  \n")).toEqual({ ok: true, model: { tables: [], refs: [], enums: [], groups: [] } });
  });

  it("gives the line and column of a syntax error", () => {
    const result = parseDbml("Table a {\n  id int [pk]\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/brace/i);
    expect(result.errors[0].line).toBeGreaterThan(0);
  });

  it("gives an error for a reference to a column that does not exist", () => {
    const result = parseDbml("Table a { id int }\nTable b { id int }\nRef: a.nope > b.id\n");
    expect(result.ok).toBe(false);
  });
});

describe("helpers", () => {
  it("reads DBML cardinality", () => {
    expect(["1", "*", "0..1", "0..*"].map(cardinalityOf)).toEqual(["one", "many", "zero-or-one", "zero-or-many"]);
  });

  it("quotes names only when they need quotes", () => {
    expect(quoteName("user_id")).toBe("user_id");
    expect(quoteName("order items")).toBe('"order items"');
    expect(quoteName('say "hi"')).toBe('"say \\"hi\\""');
  });
});
