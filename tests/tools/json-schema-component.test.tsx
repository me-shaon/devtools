import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JsonSchemaValidator } from "@/components/tools/JsonSchemaValidator";

const SCHEMA = JSON.stringify({
  type: "object",
  properties: { items: { type: "array", items: { type: "object", properties: { price: { type: "number" } } } } },
});

describe("JsonSchemaValidator", () => {
  it("shows Valid when the data matches", async () => {
    render(<JsonSchemaValidator />);
    fireEvent.change(screen.getByLabelText("Schema"), { target: { value: SCHEMA } });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: '{"items": [{"price": 1}]}' } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Valid/));
  });

  it("lists each error and selects its location in the data", async () => {
    const data = '{\n  "items": [\n    {"price": 1},\n    {"price": "9"}\n  ]\n}';
    render(<JsonSchemaValidator />);
    fireEvent.change(screen.getByLabelText("Schema"), { target: { value: SCHEMA } });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: data } });
    const issue = await screen.findByRole("button", { name: /\/items\/1\/price/ });
    await waitFor(() => expect(issue).toHaveTextContent("Expected number, got string"));
    expect(issue).toHaveTextContent("type");
    fireEvent.click(issue);
    const field = screen.getByLabelText("Data") as HTMLTextAreaElement;
    expect(data.slice(field.selectionStart, field.selectionEnd)).toBe('"9"');
  });

  it("reports invalid JSON with a line and column", async () => {
    render(<JsonSchemaValidator />);
    fireEvent.change(screen.getByLabelText("Schema"), { target: { value: SCHEMA } });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: '{\n  "a": }' } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Data: Line 2, column 8/));
  });

  it("generates a starter schema from the data", async () => {
    render(<JsonSchemaValidator />);
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: '{"id": 1}' } });
    fireEvent.click(await screen.findByRole("button", { name: "Generate from data" }));
    await waitFor(() => expect((screen.getByLabelText("Schema") as HTMLTextAreaElement).value).toMatch(/"\$schema"/));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Valid/));
  });
});
