import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegexGenerator } from "@/components/tools/RegexGenerator";
import { ALL_TOOLS } from "@/app/toolRegistry";
import { searchTools } from "@/utils/tool-search";

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("RegexGenerator", () => {
  it("matches live and lists each match with its groups", async () => {
    render(<RegexGenerator />);
    type("Pattern", "(?<key>\\w+)=(\\d+)?");
    type("Test text", "a=1 b=");

    const list = await screen.findByRole("list", { name: "Matches" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("a=1")).toBeInTheDocument();
    expect(within(items[0]).getByText("1 key")).toBeInTheDocument();
    expect(within(items[0]).getByText("0–3")).toBeInTheDocument();
    expect(within(items[1]).getByText("not matched")).toBeInTheDocument();
    expect(screen.getByText("Matches (2)")).toBeInTheDocument();
  });

  it("highlights matches in the test text", async () => {
    render(<RegexGenerator />);
    type("Pattern", "o");
    type("Test text", "foo");

    const highlights = screen.getByTestId("regex-highlights");
    await within(highlights).findAllByText("o", { selector: "mark" });
    expect(highlights.querySelectorAll("mark")).toHaveLength(2);
  });

  it("shows an inline error for an invalid pattern", async () => {
    render(<RegexGenerator />);
    type("Pattern", "(a");
    type("Test text", "a");
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Invalid pattern: /);
  });

  it("finds only the first match when the global flag is off", async () => {
    render(<RegexGenerator />);
    type("Pattern", "a");
    type("Test text", "aaa");
    expect(await screen.findByText("Matches (3)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Global/ }));
    expect(await screen.findByText("Matches (1)")).toBeInTheDocument();
  });

  it("replaces live with group references", async () => {
    render(<RegexGenerator />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Replace" }));
    type("Pattern", "(?<user>\\w+)@(\\w+)");
    type("Replace with", "$2/$<user> [$&]");
    type("Test text", "ann@x bob@y");
    const output = await screen.findByRole("textbox", { name: "Replaced text" });
    expect(output).toHaveValue("x/ann [ann@x] y/bob [bob@y]");
  });

  it("fills the pattern and flags from a pasted literal", () => {
    render(<RegexGenerator />);
    fireEvent.paste(screen.getByLabelText("Pattern"), { clipboardData: { getData: () => "/\\d+/im" } });
    expect(screen.getByLabelText("Pattern")).toHaveValue("\\d+");
    expect(screen.getByRole("button", { name: /^Global/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^Ignore case/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("applies a preset with sample text", async () => {
    render(<RegexGenerator />);
    fireEvent.change(screen.getByLabelText("Preset"), { target: { value: "Hex color" } });
    expect(screen.getByLabelText("Test text")).toHaveValue("#1e90ff\n#abc\n#12345g");
    expect(await screen.findByText("Matches (2)")).toBeInTheDocument();
  });

  it("shows the cheat sheet and FAQ", () => {
    render(<RegexGenerator />);
    expect(screen.getByText("Cheat sheet")).toBeInTheDocument();
    expect(screen.getByText("How do I use groups in the replacement?")).toBeInTheDocument();
  });

  it("is named Regex Tester and still found by its old name", () => {
    const ids = (query: string) => searchTools([...ALL_TOOLS], query).map((tool) => tool.id);
    expect(ALL_TOOLS.find((tool) => tool.id === "regex-generator")?.name).toBe("Regex Tester");
    expect(ids("regex generator")[0]).toBe("regex-generator");
  });
});
