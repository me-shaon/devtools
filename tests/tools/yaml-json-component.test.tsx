import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { YamlJson } from "@/components/tools/YamlJson";

const output = async (name: string) => ((await screen.findByLabelText(name)) as HTMLTextAreaElement).value;
const pick = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });

describe("YamlJson", () => {
  it("converts YAML to JSON as the user types", async () => {
    render(<YamlJson />);
    expect(screen.getByLabelText("Source format")).toHaveValue("yaml");
    expect(screen.getByLabelText("Target format")).toHaveValue("json");
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

  it("swaps the output into the input and flips the formats", async () => {
    render(<YamlJson />);
    fireEvent.change(screen.getByLabelText("YAML input"), { target: { value: "a: 1" } });
    const json = await output("JSON output");
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect(screen.getByLabelText("JSON input")).toHaveValue(json);
    expect(screen.getByLabelText("Source format")).toHaveValue("json");
    expect(screen.getByLabelText("Target format")).toHaveValue("yaml");
    await waitFor(async () => expect(await output("YAML output")).toBe("a: 1\n"));
  });

  it("loads the TOML parser when TOML is picked", async () => {
    render(<YamlJson />);
    pick("Source format", "toml");
    fireEvent.change(screen.getByLabelText("TOML input"), { target: { value: '[package]\nname = "demo"' } });
    await waitFor(async () => expect(JSON.parse(await output("JSON output"))).toEqual({ package: { name: "demo" } }));
  });

  it("picks the source format of text pasted into an empty input", async () => {
    render(<YamlJson />);
    fireEvent.change(screen.getByLabelText("YAML input"), { target: { value: "PORT=3000\nexport HOST=localhost" } });
    expect(screen.getByLabelText("Source format")).toHaveValue("env");
    expect(JSON.parse(await output("JSON output"))).toEqual({ PORT: "3000", HOST: "localhost" });
  });

  it("moves the target away from JSON when JSON is pasted", () => {
    render(<YamlJson />);
    fireEvent.change(screen.getByLabelText("YAML input"), { target: { value: '{"a": 1}' } });
    expect(screen.getByLabelText("Source format")).toHaveValue("json");
    expect(screen.getByLabelText("Target format")).toHaveValue("yaml");
  });

  it("writes nested JSON to .env with the chosen nested key style", async () => {
    render(<YamlJson />);
    pick("Source format", "json");
    pick("Target format", "env");
    expect(screen.queryByLabelText("Indentation")).toBeNull();
    fireEvent.change(screen.getByLabelText("JSON input"), { target: { value: '{"db":{"host":"x"}}' } });
    expect(await output(".env output")).toBe("DB__HOST=x\n");
    pick("Nested keys", "_");
    await waitFor(async () => expect(await output(".env output")).toBe("DB_HOST=x\n"));
  });

  it("swaps the formats when the source is set to the target format", () => {
    render(<YamlJson />);
    pick("Source format", "json");
    expect(screen.getByLabelText("Target format")).toHaveValue("yaml");
  });
});
