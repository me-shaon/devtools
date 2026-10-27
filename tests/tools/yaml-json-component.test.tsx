import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { YamlJson } from "@/components/tools/YamlJson";

const output = async (name: string) => ((await screen.findByLabelText(name)) as HTMLTextAreaElement).value;

describe("YamlJson", () => {
  it("converts YAML to JSON as the user types", async () => {
    render(<YamlJson />);
    fireEvent.change(screen.getByLabelText("YAML input"), { target: { value: "a: 1\nb: two" } });
    expect(JSON.parse(await output("JSON output"))).toEqual({ a: 1, b: "two" });
  });

  it("says when several documents become an array", async () => {
    render(<YamlJson />);
    fireEvent.change(screen.getByLabelText("YAML input"), { target: { value: "a: 1\n---\na: 2" } });
    expect(await screen.findByText("2 documents converted to a JSON array")).toBeInTheDocument();
  });

  it("shows the error line inline", async () => {
    render(<YamlJson />);
    fireEvent.change(screen.getByLabelText("YAML input"), { target: { value: "a: 1\nb: [1, 2\nc: 3" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Line 3, column 1/);
    expect(screen.queryByLabelText("JSON output")).toBeNull();
    expect(screen.getByText("Invalid input")).toBeInTheDocument();
  });

  it("swaps the output into the input and flips the direction", async () => {
    render(<YamlJson />);
    fireEvent.change(screen.getByLabelText("YAML input"), { target: { value: "a: 1" } });
    const json = await output("JSON output");
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect(screen.getByLabelText("JSON input")).toHaveValue(json);
    expect(screen.getByRole("tab", { name: "JSON to YAML" })).toHaveAttribute("aria-selected", "true");
    await waitFor(async () => expect(await output("YAML output")).toBe("a: 1\n"));
  });
});
