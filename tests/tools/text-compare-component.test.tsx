import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextCompare } from "@/components/tools/TextCompare";

describe("TextCompare", () => {
  it("shows richer diff views and summary stats", async () => {
    render(<TextCompare />);

    fireEvent.change(screen.getByPlaceholderText("Enter original text..."), {
      target: { value: "Line 1\nLine 2" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter modified text..."), {
      target: { value: "Line 1\nLine 3" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Compare Texts" }));

    expect(await screen.findByText("Comparison Results")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Exact Match")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Line Diff" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Unified Diff" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Character Diff" })).toBeInTheDocument();
    expect(screen.getAllByText("Line 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Line 3").length).toBeGreaterThan(0);
  });

});
