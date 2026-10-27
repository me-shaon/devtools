import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextCompare } from "@/components/tools/TextCompare";

const original = () => screen.getByPlaceholderText("Enter original text...") as HTMLTextAreaElement;
const modified = () => screen.getByPlaceholderText("Enter modified text...") as HTMLTextAreaElement;

const enter = (a: string, b: string) => {
  fireEvent.change(original(), { target: { value: a } });
  fireEvent.change(modified(), { target: { value: b } });
};

describe("TextCompare swap, word view and navigation", () => {
  it("swaps the original and modified texts", async () => {
    render(<TextCompare />);
    enter("left", "right");
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect(original()).toHaveValue("right");
    expect(modified()).toHaveValue("left");
  });

  it("shows changed words in the word view", async () => {
    render(<TextCompare />);
    enter("the quick fox", "the slow fox");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Word" }));
    expect(await screen.findByText("quick")).toHaveAttribute("data-diff", "removed");
    expect(screen.getByText("slow")).toHaveAttribute("data-diff", "added");
  });

  it("counts changes and moves between them", async () => {
    render(<TextCompare />);
    enter("a\nb\nc\nd\ne", "a\nB\nc\nd\nE");
    expect(await screen.findByText("Change 1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next change" }));
    expect(screen.getByText("Change 2 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next change" }));
    expect(screen.getByText("Change 1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous change" }));
    expect(screen.getByText("Change 2 of 2")).toBeInTheDocument();
  });

  it("hides navigation when the texts are identical", async () => {
    render(<TextCompare />);
    enter("same", "same");
    expect(await screen.findByText("Identical")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next change" })).toBeNull();
  });
});
