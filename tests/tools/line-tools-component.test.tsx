import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LineTools } from "@/components/tools/LineTools";

describe("LineTools", () => {
  it("sorts, dedupes, and reports the counts", async () => {
    render(<LineTools />);
    fireEvent.change(screen.getByLabelText("Lines"), { target: { value: "file10\nfile2\nfile2\nfile1" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Natural" }));
    fireEvent.click(screen.getByRole("switch", { name: "Remove duplicates" }));
    const output = await screen.findByLabelText("Result");
    await waitFor(() => expect(output).toHaveValue("file1\nfile2\nfile10"));
    expect(screen.getByText(/4 lines → 3 lines · 1 duplicate removed/)).toBeInTheDocument();
  });

  it("offers Shuffle again in shuffle mode", async () => {
    render(<LineTools />);
    fireEvent.change(screen.getByLabelText("Lines"), { target: { value: "a\nb\nc" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Shuffle" }));
    const again = await screen.findByRole("button", { name: "Shuffle again" });
    fireEvent.click(again);
    const output = (await screen.findByLabelText("Result")) as HTMLTextAreaElement;
    expect(output.value.split("\n").sort()).toEqual(["a", "b", "c"]);
  });

  it("filters lines, counts the matches, and reports a bad regex inline", async () => {
    render(<LineTools />);
    fireEvent.change(screen.getByLabelText("Lines"), { target: { value: "api-users\nweb\napi-orders" } });
    const filter = screen.getByLabelText("Filter lines");
    fireEvent.change(filter, { target: { value: "api" } });
    const output = await screen.findByLabelText("Result");
    await waitFor(() => expect(output).toHaveValue("api-users\napi-orders"));
    expect(screen.getByText(/2 matched/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter mode"), { target: { value: "remove" } });
    await waitFor(() => expect(screen.getByLabelText("Result")).toHaveValue("web"));

    fireEvent.click(screen.getByRole("switch", { name: "Regex" }));
    fireEvent.change(filter, { target: { value: "(" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Invalid regular expression/);
  });

  it("compares two lists and copies each result", async () => {
    render(<LineTools />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Compare" }));
    fireEvent.change(await screen.findByLabelText("List A"), { target: { value: "a\nb\nc\n" } });
    fireEvent.change(screen.getByLabelText("List B"), { target: { value: " c\nd\nA" } });

    const onlyA = await screen.findByRole("tab", { name: "Only in A (2)" });
    expect(screen.getByRole("tab", { name: "Only in B (2)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "In both (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Union (5)" })).toBeInTheDocument();
    expect(onlyA).toHaveAttribute("data-state", "active");
    await waitFor(() => expect(screen.getByLabelText("Result")).toHaveValue("a\nb"));

    fireEvent.click(screen.getByRole("switch", { name: "Ignore case" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "In both (2)" })).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByRole("tab", { name: "In both (2)" }));
    await waitFor(() => expect(screen.getByLabelText("Result")).toHaveValue("a\nc"));
    expect(screen.getByRole("button", { name: "Copy In both" })).toBeInTheDocument();
  });
});
