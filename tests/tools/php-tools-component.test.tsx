import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhpTools } from "@/components/tools/PhpTools";

describe("PhpTools", () => {
  it("unserializes to JSON and swaps the result into the serializer", async () => {
    render(<PhpTools />);
    fireEvent.change(screen.getByLabelText("Serialized"), { target: { value: 'a:1:{s:1:"a";i:1;}' } });
    expect(await screen.findByLabelText("JSON")).toHaveValue('{\n  "a": 1\n}');
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect(await screen.findByDisplayValue('a:1:{s:1:"a";i:1;}')).toHaveAttribute("readonly");
  });

  it("reports repaired string lengths", async () => {
    render(<PhpTools />);
    fireEvent.change(screen.getByLabelText("Serialized"), { target: { value: 's:2:"hello";' } });
    expect(await screen.findByRole("status")).toHaveTextContent(/Repaired 1 string length/);
  });

  it("writes long array syntax when asked", async () => {
    render(<PhpTools />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Array" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "From JSON" }));
    fireEvent.click(screen.getByRole("switch", { name: "Use array()" }));
    fireEvent.change(screen.getByLabelText("JSON"), { target: { value: "[1]" } });
    expect(await screen.findByLabelText("PHP array")).toHaveValue("array(\n    1,\n)");
  });

  it("shows syntax errors inline", async () => {
    render(<PhpTools />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Array" }));
    fireEvent.change(screen.getByLabelText("PHP array"), { target: { value: "['a' => ]" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/position 8/);
  });
});
