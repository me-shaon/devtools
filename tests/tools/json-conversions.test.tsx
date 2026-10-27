import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JsonViewer } from "@/components/tools/JsonViewer";
import { getJsonPaths, jsonToXml, jsonToYaml, queryJson, runJsonQuery, sortJsonKeys } from "@/utils/json";

describe("jsonToYaml", () => {
  it("handles arrays of objects", () => {
    expect(jsonToYaml('{"users":[{"name":"A","age":1},{"name":"B","age":2}]}')).toBe(
      'users:\n  - name: "A"\n    age: 1\n  - name: "B"\n    age: 2'
    );
  });
  it("handles nested arrays and empty containers", () => {
    expect(jsonToYaml('{"m":[[1,2],[3]],"e":[],"o":{}}')).toBe('m:\n  - - 1\n    - 2\n  - - 3\ne: []\no: {}');
  });
  it("escapes strings and quotes odd keys", () => {
    expect(jsonToYaml('{"a b":"say \\"hi\\"\\nnow"}')).toBe('"a b": "say \\"hi\\"\\nnow"');
  });
  it("handles root scalars and arrays", () => {
    expect(jsonToYaml("5")).toBe("5");
    expect(jsonToYaml("[1,[2]]")).toBe("- 1\n- - 2");
  });
});

describe("jsonToXml", () => {
  it("repeats the key for arrays of objects", () => {
    expect(jsonToXml('{"u":[{"n":1},{"n":2}]}')).toBe("<root>\n  <u>\n    <n>1</n>\n  </u>\n  <u>\n    <n>2</n>\n  </u>\n</root>");
  });
  it("wraps root arrays and nested arrays", () => {
    expect(jsonToXml("[1,[2]]")).toBe("<root>\n  <item>1</item>\n  <item>\n    <item>2</item>\n  </item>\n</root>");
  });
  it("escapes text and sanitizes tag names", () => {
    expect(jsonToXml('{"a b":"<x>&"}')).toBe("<root>\n  <a_b>&lt;x&gt;&amp;</a_b>\n</root>");
  });
  it("does not print [object Object]", () => {
    expect(jsonToXml('{"a":[{"b":[{"c":1}]}]}')).not.toContain("[object");
  });
});

describe("queryJson", () => {
  const data = { users: [{ name: "A", tags: ["x", "y"] }, { name: "B", tags: [] }], "my key": 1, matrix: [[1, 2], [3, 4]] };
  it("supports $ root, chained indexes and bracket keys", () => {
    expect(queryJson(data, "$.users[0].tags[1]")).toBe("y");
    expect(queryJson(data, "matrix[1][0]")).toBe(3);
    expect(queryJson(data, "$['my key']")).toBe(1);
    expect(queryJson(data, "$")).toBe(data);
  });
  it("supports wildcards", () => {
    expect(queryJson(data, "users[*].name")).toEqual(["A", "B"]);
    expect(queryJson(data, "matrix[*][1]")).toEqual([2, 4]);
  });
  it("returns not found instead of throwing", () => {
    expect(runJsonQuery(data, "users[5].name")).toEqual({ ok: true, found: false, value: null });
    expect(runJsonQuery(data, "name.first.x")).toMatchObject({ found: false });
    expect(runJsonQuery({ a: null }, "a")).toEqual({ ok: true, found: true, value: null });
    expect(runJsonQuery(data, "users[")).toMatchObject({ ok: false });
  });
  it("round-trips paths from getJsonPaths", () => {
    for (const path of getJsonPaths(data)) expect(runJsonQuery(data, path)).toMatchObject({ ok: true, found: true });
  });
});

describe("sortJsonKeys", () => {
  it("sorts nested objects inside arrays", () => {
    expect(sortJsonKeys('{"b":[{"z":1,"a":2}],"a":1}')).toBe(JSON.stringify({ a: 1, b: [{ a: 2, z: 1 }] }, null, 2));
  });
});

describe("JSON Viewer conversions", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  });
  const setup = (value: string) => {
    render(<JsonViewer />);
    fireEvent.change(screen.getByRole("textbox", { name: "JSON Input" }), { target: { value } });
  };
  const text = () => [...screen.getByRole("region", { name: "Output" }).querySelectorAll("code")].map((el) => el.textContent).join("\n");

  it("sorts keys", () => {
    setup('{"b":1,"a":2}');
    fireEvent.click(screen.getByRole("button", { name: "Sort keys" }));
    expect(text()).toBe('{\n  "a": 2,\n  "b": 1\n}');
  });
  it("converts to YAML and XML", () => {
    setup('{"a":[1,2]}');
    fireEvent.click(screen.getByRole("button", { name: "YAML" }));
    expect(text()).toBe("a:\n  - 1\n  - 2");
    fireEvent.click(screen.getByRole("button", { name: "XML" }));
    expect(text()).toContain("<a>1</a>");
  });
  it("runs a query and reports no match", () => {
    setup('{"a":{"b":[10,20]}}');
    fireEvent.change(screen.getByLabelText("Query"), { target: { value: "$.a.b[1]" } });
    fireEvent.click(screen.getByRole("button", { name: "Run query" }));
    expect(text()).toBe("20");
    fireEvent.change(screen.getByLabelText("Query"), { target: { value: "a.zzz" } });
    fireEvent.keyDown(screen.getByLabelText("Query"), { key: "Enter" });
    expect(screen.getByRole("status")).toHaveTextContent("No match");
    expect(text()).toBe("");
  });
});
