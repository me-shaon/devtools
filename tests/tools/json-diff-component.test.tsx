import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JsonDiff } from "@/components/tools/JsonDiff";

const writeText = vi.mocked(navigator.clipboard.writeText);

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

const rows = () => within(screen.getByRole("list", { name: "Changes" })).getAllByRole("listitem");

describe("JsonDiff", () => {
  beforeEach(() => {
    writeText.mockClear();
  });

  it("lists changes by path as the user types", async () => {
    render(<JsonDiff />);
    type("Original", '{"name": "app", "port": 80, "old": true}');
    type("Modified", '{"port": "80", "name": "app", "tags": ["a"]}');
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.getByText("$.port")).toBeInTheDocument();
    expect(screen.getByText("$.old")).toBeInTheDocument();
    expect(screen.getByText("$.tags")).toBeInTheDocument();
    expect(screen.getByText(/1 added/)).toBeInTheDocument();
  });

  it("says when there are no differences", async () => {
    render(<JsonDiff />);
    type("Original", '{"a": 1, "b": 2}');
    type("Modified", "b: 2\na: 1\n");
    expect(await screen.findByText("The two documents have the same values.")).toBeInTheDocument();
    expect(screen.getByText("JSON and YAML")).toBeInTheDocument();
  });

  it("shows a parse error for each side with the line", async () => {
    render(<JsonDiff />);
    type("Original", '{\n  "a": 1,\n  "b": }');
    type("Modified", "{}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Original: Line 3, column/);
  });

  it("filters the list by kind and copies the changes and the patch", async () => {
    render(<JsonDiff />);
    type("Original", '{"a": 1, "b": 2}');
    type("Modified", '{"a": 5, "c": 3}');
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Added/ }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /Copy changes/ }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("+ $.c: 3"));
    fireEvent.click(screen.getByRole("button", { name: /Copy JSON Patch/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(JSON.parse(writeText.mock.calls[1][0])).toEqual([
      { op: "replace", path: "/a", value: 5 },
      { op: "remove", path: "/b" },
      { op: "add", path: "/c", value: 3 },
    ]);
  });

  it("matches reordered array items by key", async () => {
    render(<JsonDiff />);
    type("Original", '[{"id": 1, "v": "a"}, {"id": 2, "v": "b"}]');
    type("Modified", '[{"id": 2, "v": "b"}, {"id": 1, "v": "c"}]');
    await waitFor(() => expect(rows().length).toBeGreaterThan(1));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "By key" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByText("$[?(@.id==1)].v")).toBeInTheDocument();
  });
});
