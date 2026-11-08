import { describe, expect, it } from "vitest";
import { toMermaid } from "@/utils/db-diagram/export";
import { importMermaid } from "@/utils/db-diagram/mermaid-import";
import { parseDbml, type DbModel } from "@/utils/db-diagram/model";

const parse = (source: string): DbModel => {
  const result = parseDbml(source);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.model;
};

const imported = (source: string) => {
  const result = importMermaid(source);
  if (!result.ok) throw new Error(result.errors[0].message);
  return { text: result.text, model: parse(result.text) };
};

const ends = (model: DbModel) =>
  model.refs.map((ref) => [`${ref.from.table}.${ref.from.columns.join(",")}`, ref.from.cardinality, `${ref.to.table}.${ref.to.columns.join(",")}`, ref.to.cardinality]);

describe("importMermaid", () => {
  it("reads entities, attribute keys, and comments", () => {
    const { model } = imported(`erDiagram
    CUSTOMER {
        string id PK
        string email UK "Login name"
        string name
    }
`);
    expect(model.tables[0].columns).toEqual([
      expect.objectContaining({ name: "id", type: "string", pk: true }),
      expect.objectContaining({ name: "email", unique: true, note: "Login name" }),
      expect.objectContaining({ name: "name", pk: false, unique: false }),
    ]);
  });

  it("uses the column that the label names as the foreign key", () => {
    const { model } = imported(`erDiagram
    USERS ||--o{ POSTS : author_id
    USERS { int id PK }
    POSTS {
        int id PK
        int author_id FK
        int editor_id FK
    }
`);
    expect(ends(model)).toEqual([["POSTS.author_id", "zero-or-many", "USERS.id", "one"]]);
  });

  it("finds the foreign key from its name, and from the parent name in an FK column", () => {
    const { model } = imported(`erDiagram
    customers ||--|{ orders : places
    orders ||--o{ line_item : contains
    customers { int id PK }
    orders {
        int id PK
        int customer_id
    }
    line_item {
        int order_ref FK
    }
`);
    expect(ends(model)).toEqual([
      ["orders.customer_id", "many", "customers.id", "one"],
      ["line_item.order_ref", "zero-or-many", "orders.id", "one"],
    ]);
  });

  it("adds a key to the parent and a foreign key column to the child, and marks them", () => {
    const { text, model } = imported("erDiagram\n  CUSTOMER ||--o{ ORDER : places\n");
    expect(model.tables.map((table) => [table.id, table.columns.map((column) => column.name)])).toEqual([
      ["CUSTOMER", ["id"]],
      ["ORDER", ["customer_id"]],
    ]);
    expect(ends(model)).toEqual([["ORDER.customer_id", "zero-or-many", "CUSTOMER.id", "one"]]);
    expect(text).toContain("customer_id integer // Added by the import");
    expect(text).toContain("// places");
  });

  it("gives each relationship the column that names its parent, also when the names share a prefix", () => {
    const { model } = imported(`erDiagram
    USER ||--o{ POST : writes
    USER_PROFILE ||--o{ POST : has
    POST {
        int id PK
        int user_profile_id FK
        int author_user_id FK
    }
`);
    expect(ends(model)).toEqual([
      ["POST.author_user_id", "zero-or-many", "USER.id", "one"],
      ["POST.user_profile_id", "zero-or-many", "USER_PROFILE.id", "one"],
    ]);
  });

  it("does not take the child key for a parent with a one-letter name", () => {
    const { model } = imported("erDiagram\n  S ||--o{ T : has\n  T {\n    int id PK\n    int other_id FK\n    int s_id FK\n  }\n");
    expect(ends(model)).toEqual([["T.s_id", "zero-or-many", "S.id", "one"]]);
  });

  it("reads a self reference with the many side on the left", () => {
    const { model } = imported("erDiagram\n  EMPLOYEE }o--o| EMPLOYEE : manager_id\n  EMPLOYEE {\n    int id PK\n    int manager_id FK\n  }\n");
    expect(ends(model)).toEqual([["EMPLOYEE.manager_id", "zero-or-many", "EMPLOYEE.id", "zero-or-one"]]);
  });

  it("rejects a long attribute line quickly", () => {
    const started = performance.now();
    const result = importMermaid(`erDiagram\n  A {\n    int id${" , PK   ".repeat(40)} junk\n  }\n`);
    expect(result.ok).toBe(false);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("reads the Mermaid documentation example, with hyphens in the names", () => {
    const { model } = imported(`erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses
`);
    expect(model.tables.map((table) => table.id)).toEqual(["CUSTOMER", "ORDER", "LINE-ITEM", "DELIVERY-ADDRESS"]);
    expect(ends(model)[1]).toEqual(["LINE-ITEM.order_id", "many", "ORDER.id", "one"]);
  });

  it("reads one-to-one, many-to-many, the many side on the left, and the word forms", () => {
    const { model } = imported(`erDiagram
    PERSON ||--o| PASSPORT : has
    STUDENT }o--o{ COURSE : takes
    ORDER }|..|| SHOP : at
    CAR one or more to only one DRIVER : "driven by"
`);
    expect(ends(model)).toEqual([
      ["PASSPORT.person_id", "zero-or-one", "PERSON.id", "one"],
      ["STUDENT.id", "zero-or-many", "COURSE.id", "zero-or-many"],
      ["ORDER.shop_id", "many", "SHOP.id", "one"],
      ["CAR.driver_id", "many", "DRIVER.id", "one"],
    ]);
  });

  it("reads quoted names, aliases, comments, front matter, and the lines to ignore", () => {
    const { model } = imported(`---
title: Shop
---
erDiagram
    direction LR
    %% a comment
    "line item"["Line item"] {
        int id PK
    }
    style p fill:#f9f
    accDescr {
      Many lines
    }
`);
    expect(model.tables.map((table) => table.id)).toEqual(["line item"]);
  });

  it("gives the schema back after a Mermaid export", () => {
    const source = `Table users {
  id integer [pk]
  email varchar(255) [unique]
}
Table posts {
  id integer [pk]
  author_id integer [ref: > users.id]
  editor_id integer [ref: > users.id]
}
`;
    const { model } = imported(toMermaid(parse(source)));
    expect(model.tables.map((table) => [table.id, table.columns.map((column) => column.name)])).toEqual([
      ["users", ["id", "email"]],
      ["posts", ["id", "author_id", "editor_id"]],
    ]);
    expect(ends(model)).toEqual([
      ["posts.author_id", "many", "users.id", "one"],
      ["posts.editor_id", "many", "users.id", "one"],
    ]);
  });

  it("gives errors with line numbers", () => {
    expect(importMermaid("graph TD\n  A --> B\n")).toMatchObject({ ok: false, errors: [{ line: 1 }] });
    expect(importMermaid("erDiagram\n  A {\n    not-an attribute line here\n  }\n")).toMatchObject({ ok: false, errors: [{ line: 3 }] });
    expect(importMermaid("erDiagram\n  A -> B\n")).toMatchObject({ ok: false, errors: [{ line: 2 }] });
    expect(importMermaid("erDiagram\n  A {\n    int id\n")).toMatchObject({ ok: false });
    expect(importMermaid("  ").ok).toBe(false);
    expect(importMermaid("erDiagram\n").ok).toBe(false);
  });
});
