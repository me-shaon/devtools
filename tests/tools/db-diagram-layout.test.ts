import { describe, expect, it } from "vitest";
import { autoLayout, joinLayout, placeMissing, pruneLayout, splitLayout, tableSize, withLayout, type Layout } from "@/utils/db-diagram/layout";
import { parseDbml, type DbModel } from "@/utils/db-diagram/model";

const SCHEMA = `Table users {
  id int [pk]
}

/* A note about posts */
Table posts {
  id int [pk]
  user_id int [ref: > users.id]
}

Table comments {
  id int [pk]
  post_id int [ref: > posts.id]
}
`;

const parse = (source: string): DbModel => {
  const result = parseDbml(source);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.model;
};

const overlaps = (model: DbModel, layout: Layout) => {
  const boxes = model.tables.map((table) => ({ ...layout[table.id], ...tableSize(table) }));
  return boxes.some((a, i) =>
    boxes.some((b, j) => i < j && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height),
  );
};

describe("layout block", () => {
  it("round-trips the text", () => {
    const text = joinLayout(SCHEMA, { users: { x: 0, y: 10 }, posts: { x: 300, y: -20 } });
    const split = splitLayout(text);
    expect(split.layout).toEqual({ users: { x: 0, y: 10 }, posts: { x: 300, y: -20 } });
    expect(split.warning).toBeNull();
    expect(joinLayout(split.schema, split.layout)).toBe(text);
  });

  it("keeps offsets in the DBML the same as in the full text", () => {
    const text = joinLayout(SCHEMA, { users: { x: 0, y: 0 } });
    expect(text.startsWith(splitLayout(text).schema)).toBe(true);
  });

  it("rewrites only the layout block", () => {
    const text = joinLayout(SCHEMA, { users: { x: 0, y: 0 } });
    const moved = withLayout(text, { users: { x: 40, y: 50 } });
    expect(splitLayout(moved).schema).toBe(splitLayout(text).schema);
    expect(splitLayout(moved).layout).toEqual({ users: { x: 40, y: 50 } });
  });

  it("writes tables in name order and rounds positions", () => {
    const text = joinLayout("Table b { id int }\n", { b: { x: 1.6, y: 2.2 }, a: { x: 0, y: 0 } });
    expect(text.indexOf('"a"')).toBeLessThan(text.indexOf('"b"'));
    expect(text).toContain('"b": {"x": 2, "y": 2}');
  });

  it("has no block when no table has a position", () => {
    expect(splitLayout(SCHEMA)).toEqual({ schema: SCHEMA, layout: {}, warning: null });
    expect(joinLayout(SCHEMA, {})).toBe(SCHEMA);
  });

  it("gives a warning for a block that is not valid JSON, and the DBML still parses", () => {
    const split = splitLayout(`${SCHEMA}\n/* @devtools-layout\n{"tables": {oops}}\n*/\n`);
    expect(split.layout).toEqual({});
    expect(split.warning).toMatch(/not valid/);
    expect(parseDbml(split.schema).ok).toBe(true);
  });

  it("keeps DBML typed after the layout block, and moves the block to the end on the next write", () => {
    const typed = `${joinLayout(SCHEMA, { users: { x: 10, y: 20 } })}\nTable extra {\n  id int\n}\n`;
    const split = splitLayout(typed);
    expect(split.layout).toEqual({ users: { x: 10, y: 20 } });
    expect(split.warning).toBeNull();
    expect(parse(split.schema).tables.map((table) => table.id)).toContain("extra");
    // Line numbers in the DBML stay the same as in the full text
    expect(split.schema.split("\n").indexOf("Table extra {")).toBe(typed.split("\n").indexOf("Table extra {"));

    const moved = withLayout(typed, { users: { x: 1, y: 2 }, extra: { x: 3, y: 4 } });
    expect(moved.match(/@devtools-layout/g)).toHaveLength(1);
    expect(moved.trimEnd().endsWith("*/")).toBe(true);
    const again = splitLayout(moved);
    expect(again.layout).toEqual({ extra: { x: 3, y: 4 }, users: { x: 1, y: 2 } });
    expect(parse(again.schema).tables.map((table) => table.id)).toContain("extra");
  });

  it("reads the last of two layout blocks and keeps the DBML between them", () => {
    const text = `${joinLayout("Table a {\n  id int\n}\n", { a: { x: 0, y: 0 } })}Table b {\n  id int\n}\n${joinLayout("", { a: { x: 5, y: 5 } })}`;
    const split = splitLayout(text);
    expect(split.layout).toEqual({ a: { x: 5, y: 5 } });
    expect(parse(split.schema).tables.map((table) => table.id)).toEqual(["a", "b"]);
  });

  it("does not take other block comments as the layout", () => {
    expect(splitLayout(SCHEMA).schema).toContain("/* A note about posts */");
  });

  it("escapes a table name that would end the comment", () => {
    const text = joinLayout("", { "a*/b": { x: 1, y: 2 } });
    expect(text.match(/\*\//g)).toHaveLength(1);
    expect(splitLayout(text).layout).toEqual({ "a*/b": { x: 1, y: 2 } });
  });
});

describe("auto-layout", () => {
  it("places related tables without overlap, parents first", () => {
    const model = parse(SCHEMA);
    const layout = autoLayout(model);
    expect(Object.keys(layout).sort()).toEqual(["comments", "posts", "users"]);
    expect(overlaps(model, layout)).toBe(false);
    expect(layout.users.x).toBeLessThan(layout.posts.x);
    expect(layout.posts.x).toBeLessThan(layout.comments.x);
  });

  it("keeps saved positions and places new tables to their right", () => {
    const model = parse(`${SCHEMA}\nTable tags { id int }\n`);
    const saved = { users: { x: 0, y: 0 }, posts: { x: 300, y: 0 }, comments: { x: 600, y: 0 } };
    const layout = placeMissing(model, saved);
    expect(layout.users).toEqual(saved.users);
    expect(layout.comments).toEqual(saved.comments);
    expect(layout.tags.x).toBeGreaterThan(600);
    expect(overlaps(model, layout)).toBe(false);
  });

  it("drops positions of tables that no longer exist", () => {
    const model = parse("Table users { id int }\n");
    expect(pruneLayout(model, { users: { x: 1, y: 1 }, gone: { x: 2, y: 2 } })).toEqual({ users: { x: 1, y: 1 } });
  });

  it("sizes a table from its columns", () => {
    const [table] = parse("Table t {\n  a int\n  b int\n}\n").tables;
    expect(tableSize(table).height).toBeGreaterThan(tableSize({ ...table, columns: [table.columns[0]] }).height);
    expect(tableSize(table).width).toBeGreaterThanOrEqual(180);
  });
});
