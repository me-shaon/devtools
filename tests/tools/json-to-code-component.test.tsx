import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JsonToTypeScript } from "@/components/tools/JsonToTypeScript";

const output = async (name: string) => ((await screen.findByLabelText(name)) as HTMLTextAreaElement).value;

describe("JsonToTypeScript", () => {
  it("generates TypeScript as the user types", async () => {
    render(<JsonToTypeScript />);
    fireEvent.change(screen.getByLabelText("JSON input"), { target: { value: '{"id": 1, "address": {"city": "x"}}' } });
    expect(await output("TypeScript output")).toContain("export interface Root {\n  id: number;\n  address: Address;\n}");
    expect(screen.getByText("2 types · TypeScript")).toBeInTheDocument();
  });

  it("switches the output language", async () => {
    render(<JsonToTypeScript />);
    fireEvent.change(screen.getByLabelText("JSON input"), { target: { value: '{"first-name": "Ada"}' } });
    await output("TypeScript output");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Go" }));
    expect(await output("Go output")).toContain('FirstName string `json:"first-name"`');
    expect(screen.getByText("1 type · Go")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Rust" }));
    expect(await output("Rust output")).toContain('#[serde(rename = "first-name")]');

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Python" }));
    fireEvent.change(screen.getByLabelText("Python style"), { target: { value: "pydantic" } });
    await waitFor(async () => expect(await output("Python output")).toContain('first_name: str = Field(alias="first-name")'));
  });

  it("uses the root name option", async () => {
    render(<JsonToTypeScript />);
    fireEvent.change(screen.getByLabelText("Root name"), { target: { value: "User" } });
    fireEvent.change(screen.getByLabelText("JSON input"), { target: { value: '{"a": 1}' } });
    await waitFor(async () => expect(await output("TypeScript output")).toContain("export interface User {"));
  });

  it("shows the error position inline", async () => {
    render(<JsonToTypeScript />);
    fireEvent.change(screen.getByLabelText("JSON input"), { target: { value: '{\n  "a": 1,\n}' } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Line 3, column 1/);
    expect(screen.queryByLabelText("TypeScript output")).toBeNull();
    expect(screen.getByText("Invalid JSON")).toBeInTheDocument();
  });
});
