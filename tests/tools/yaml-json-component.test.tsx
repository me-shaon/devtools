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

  it("writes TOON with the chosen delimiter and shows the token comparison", async () => {
    render(<YamlJson />);
    pick("Source format", "json");
    pick("Target format", "toon");
    const users = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}`, active: i % 2 === 0 }));
    fireEvent.change(screen.getByLabelText("JSON input"), { target: { value: JSON.stringify({ users }) } });
    await waitFor(async () => expect(await output("TOON output")).toMatch(/^users\[20\]\{id,name,active\}:\n {2}1,User 1,true\n/));
    expect(await screen.findByTestId("toon-tokens", {}, { timeout: 5000 })).toHaveTextContent(
      /^o200k tokens: TOON [\d,]+, JSON [\d,]+ minified, [\d,]+ pretty\. TOON saves [\d.]+% against minified JSON\.$/,
    );
    pick("TOON delimiter", "\t");
    await waitFor(async () => expect(await output("TOON output")).toMatch(/^users\[20\t\]\{id\tname\tactive\}:\n {2}1\tUser 1\ttrue\n/));
  });

  it("reads pasted TOON and converts it to JSON", async () => {
    render(<YamlJson />);
    fireEvent.change(screen.getByLabelText("YAML input"), { target: { value: "users[2]{id,name}:\n  1,Ada\n  2,Bob" } });
    expect(screen.getByLabelText("Source format")).toHaveValue("toon");
    await waitFor(async () => expect(JSON.parse(await output("JSON output"))).toEqual({ users: [{ id: 1, name: "Ada" }, { id: 2, name: "Bob" }] }));
    expect(await screen.findByTestId("toon-tokens", {}, { timeout: 5000 })).toHaveTextContent(/TOON \d+, JSON \d+ minified/);
  });

  it("does not count tokens when neither side is TOON", async () => {
    render(<YamlJson />);
    fireEvent.change(screen.getByLabelText("YAML input"), { target: { value: "a: 1" } });
    await output("JSON output");
    expect(screen.queryByTestId("toon-tokens")).toBeNull();
    expect(screen.queryByLabelText("TOON delimiter")).toBeNull();
  });

  it("swaps the formats when the source is set to the target format", () => {
    render(<YamlJson />);
    pick("Source format", "json");
    expect(screen.getByLabelText("Target format")).toHaveValue("yaml");
  });
});
