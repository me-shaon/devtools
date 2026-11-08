import { describe, expect, it } from "vitest";
import { splitLayout } from "@/utils/db-diagram/layout";
import { parseDbml } from "@/utils/db-diagram/model";
import { DBML_REFERENCE } from "@/utils/db-diagram/reference";

describe("DBML_REFERENCE", () => {
  it.each(DBML_REFERENCE.map((section) => [section.title, section] as const))("has an example that parses: %s", (_title, section) => {
    const { schema, warning } = splitLayout(section.example);
    expect(warning).toBeNull();
    const result = parseDbml(schema);
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it("has a unique id for each section", () => {
    const ids = DBML_REFERENCE.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows the references with their cardinality", () => {
    const section = DBML_REFERENCE.find((item) => item.id === "refs")!;
    const result = parseDbml(section.example);
    if (!result.ok) throw new Error(result.errors[0].message);
    expect(result.model.refs.map((ref) => [ref.from.columns[0], ref.to.cardinality])).toEqual([
      ["author_id", "one"],
      ["editor_id", "zero-or-one"],
      ["reviewer_id", "zero-or-one"],
    ]);
  });

  it("gives the table positions of the positions example", () => {
    const section = DBML_REFERENCE.find((item) => item.id === "positions")!;
    expect(splitLayout(section.example).layout).toEqual({ users: { x: 0, y: 0 } });
  });

  it("is right that keywords can start with a lowercase letter", () => {
    expect(parseDbml("table a {\n  id int\n}\nenum e {\n  x\n}\n").ok).toBe(true);
  });
});
