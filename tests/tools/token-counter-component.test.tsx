import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { encode } from "gpt-tokenizer/encoding/o200k_base";
import { TokenCounter } from "@/components/tools/TokenCounter";
import { PRICE_STORAGE_KEY, loadO200k } from "@/utils/token-counter";

const TEXT = "Hello world, this is a token test.";
const EXPECTED = encode(TEXT).length;

describe("TokenCounter", () => {
  beforeAll(async () => {
    await loadO200k();
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it("updates the counts as the user types", async () => {
    render(<TokenCounter />);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: TEXT } });
    expect(await screen.findByText(String(EXPECTED), { selector: "[data-testid=token-count]" }, { timeout: 3000 })).toBeInTheDocument();
    const words = screen.getByText("Words", { selector: ".result-row-label" }).nextElementSibling;
    expect(words).toHaveTextContent("7");
    expect(screen.getAllByText("≈ estimate").length).toBeGreaterThan(0);
    expect(screen.getByRole("meter", { name: "Context window used" })).toHaveAttribute("aria-valuenow", String(EXPECTED));
  });

  it("shows tokens with visible whitespace", async () => {
    render(<TokenCounter />);
    fireEvent.click(screen.getByLabelText("Show tokens"));
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "a b\nc" } });
    const view = await screen.findByTestId("token-view", {}, { timeout: 3000 });
    expect(view.textContent).toBe("a·b↵\nc");
  });

  it("adds a price row, computes the cost and saves the table", async () => {
    const { unmount } = render(<TokenCounter />);
    expect(screen.getByText(/Add a model and its price per million tokens/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: TEXT } });
    await screen.findByText(String(EXPECTED), { selector: "[data-testid=token-count]" }, { timeout: 3000 });

    fireEvent.change(screen.getByLabelText("Output tokens"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Model name"), { target: { value: "Team model" } });
    fireEvent.change(screen.getByLabelText("Input price, US dollars per 1M tokens"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Output price, US dollars per 1M tokens"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Add model" }));

    const row = screen.getByTestId("price-row");
    // Input: EXPECTED tokens at $1000 per 1M = EXPECTED × $0.001. Output: 1000 tokens at $10 per 1M = $0.01.
    const inputCost = `$${(EXPECTED * 0.001).toPrecision(2)}`;
    expect(within(row).getByText(inputCost)).toBeInTheDocument();
    expect(within(row).getByText("$0.010")).toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem(PRICE_STORAGE_KEY) ?? "{}");
    expect(saved.models).toEqual([{ name: "Team model", input: 1000, output: 10, basis: "openai" }]);

    unmount();
    render(<TokenCounter />);
    expect(screen.getByText("Team model")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Team model" }));
    expect(JSON.parse(localStorage.getItem(PRICE_STORAGE_KEY) ?? "{}").models).toEqual([]);
  });

  it("rejects an invalid imported table inline", () => {
    render(<TokenCounter />);
    fireEvent.click(screen.getByRole("button", { name: "Import JSON" }));
    fireEvent.change(screen.getByLabelText("Price table JSON"), { target: { value: '{"models":[{"name":"m"}]}' } });
    fireEvent.click(screen.getByRole("button", { name: "Replace table" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Model 1 needs an input price of 0 or more.");

    fireEvent.change(screen.getByLabelText("Price table JSON"), { target: { value: '[{"name":"Shared","input":3,"output":15,"basis":"claude"}]' } });
    fireEvent.click(screen.getByRole("button", { name: "Replace table" }));
    expect(screen.getByText("Shared")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
