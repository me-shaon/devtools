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
});
