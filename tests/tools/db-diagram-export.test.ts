import { describe, expect, it } from "vitest";
import mermaid from "mermaid";
import { toJson, toMermaid, toSvg } from "@/utils/db-diagram/export";
import { autoLayout, cardinalityMark, EDGE_STUB, edgePath, edgeSides, tableSize } from "@/utils/db-diagram/layout";
import { parseDbml, type DbModel } from "@/utils/db-diagram/model";

const SAMPLE = `Table users {
  id integer [pk]
  email varchar(255) [unique, not null, note: 'Login "name"']
  price decimal(10, 2)
}

Table auth.sessions {
  id int [pk]
  user_id int [ref: > users.id]
}

Table "order items" {
  id int [pk]
  user_id int
}

Ref: "order items".user_id - users.id
`;

const parse = (source: string): DbModel => {
  const result = parseDbml(source);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.model;
};

describe("toMermaid", () => {
  it("writes entities, keys, and relationships that Mermaid parses", async () => {
    const text = toMermaid(parse(SAMPLE));
    expect(text).toContain("  users {\n    integer id PK\n");
    expect(text).toContain("varchar(255) email UK");
    expect(text).toContain("auth_sessions {");
    expect(text).toContain("order_items {");
    expect(text).toMatch(/users \|\|--\|\{ auth_sessions : "user_id"|auth_sessions \}\|--\|\| users : "user_id"/);
    expect(text).toContain('order_items ||--|| users : "user_id"');
    await expect(mermaid.parse(text)).resolves.toBeTruthy();
  });

  it("marks foreign keys and keeps notes without quotes", () => {
    const text = toMermaid(parse(SAMPLE));
    expect(text).toContain("int user_id FK");
    expect(text).toContain('"Login  name "');
  });

  it("keeps tables apart when their names give the same entity name", async () => {
    const text = toMermaid(parse("Table s.users { id int [pk] }\nTable s_users { id int [pk]\n  u int [ref: > s.users.id] }\n"));
    expect(text).toContain("  s_users {");
    expect(text).toContain("  s_users_2 {");
    expect(text).toMatch(/^ {2}s_users \|\|--\|\{ s_users_2 : "u"$/m);
    await expect(mermaid.parse(text)).resolves.toBeTruthy();
  });

  it("writes optional cardinality", () => {
    const text = toMermaid(parse("Table a { id int [pk] }\nTable b { a_id int }\nRef: a.id ?<? b.a_id\n"));
    expect(text).toContain("a |o--o{ b");
  });
});

describe("toJson", () => {
  it("holds every table, column, reference, and position, without offsets", () => {
    const model = parse(SAMPLE);
    const value = JSON.parse(toJson(model, { users: { x: 10, y: 20 } }));
    expect(value.tables).toHaveLength(3);
    expect(value.tables[0]).toMatchObject({ id: "users", position: { x: 10, y: 20 } });
    expect(value.tables[1].position).toBeNull();
    expect(value.tables[0].columns[0]).toEqual(expect.objectContaining({ name: "id", pk: true }));
    expect(value.refs).toHaveLength(2);
    expect(JSON.stringify(value)).not.toContain("range");
  });
});

describe("toSvg", () => {
  it("draws each table and each reference inside the viewBox", () => {
    const model = parse(SAMPLE);
    const layout = autoLayout(model);
    const { svg, width, height } = toSvg(model, layout, "light");
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelectorAll("g.table")).toHaveLength(3);
    expect(doc.querySelectorAll("path.ref")).toHaveLength(2);
    const [minX, minY] = doc.documentElement.getAttribute("viewBox")!.split(" ").map(Number);
    for (const table of model.tables) {
      const size = tableSize(table);
      expect(layout[table.id].x).toBeGreaterThanOrEqual(minX);
      expect(layout[table.id].y).toBeGreaterThanOrEqual(minY);
      expect(layout[table.id].x + size.width).toBeLessThanOrEqual(minX + width);
      expect(layout[table.id].y + size.height).toBeLessThanOrEqual(minY + height);
    }
  });

  it("escapes names", () => {
    const model = parse('Table "a<b&c" {\n  "x>y" int\n}\n');
    const { svg } = toSvg(model, { "a<b&c": { x: 0, y: 0 } }, "dark");
    expect(svg).toContain("a&lt;b&amp;c");
    expect(svg).toContain("x&gt;y");
    expect(new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror")).toBeNull();
  });

  it("gives an empty image for an empty model", () => {
    expect(toSvg({ tables: [], refs: [], enums: [], groups: [] }, {}, "light")).toMatchObject({ width: 48, height: 48 });
  });
});

describe("geometry", () => {
  it("leaves each table on the side that faces the other table", () => {
    expect(edgeSides({ x: 0, y: 0, width: 100 }, { x: 300, y: 0, width: 100 })).toEqual(["right", "left"]);
    expect(edgeSides({ x: 300, y: 0, width: 100 }, { x: 0, y: 0, width: 100 })).toEqual(["left", "right"]);
    expect(edgeSides({ x: 0, y: 0, width: 100 }, { x: 50, y: 300, width: 100 })).toEqual(["left", "left"]);
  });

  it("draws a ring only for optional ends", () => {
    expect(cardinalityMark({ x: 0, y: 0 }, "right", "one").circle).toBeNull();
    expect(cardinalityMark({ x: 0, y: 0 }, "right", "zero-or-many").circle).toEqual({ x: 18, y: 0 });
    expect(cardinalityMark({ x: 0, y: 0 }, "left", "zero-or-one").circle).toEqual({ x: -16, y: 0 });
  });

  it("keeps the line straight under the cardinality marks, also for a steep line", () => {
    const path = edgePath({ x: 0, y: 0 }, "right", { x: 30, y: 400 }, "left");
    expect(path.startsWith(`M 0 0 L ${EDGE_STUB} 0 C`)).toBe(true);
    expect(path.endsWith(`${30 - EDGE_STUB} 400 L 30 400`)).toBe(true);
    // The widest mark, a crow's foot with a ring, fits on the straight part
    expect(EDGE_STUB).toBeGreaterThanOrEqual(18 + 3.5);
  });
});
