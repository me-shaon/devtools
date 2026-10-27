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

    expect(await screen.findByText("50% similar")).toBeInTheDocument();
    expect(screen.getByText("Different")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Line" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Unified" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Character" })).toBeInTheDocument();
    expect(screen.getAllByText("Line 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Line 3").length).toBeGreaterThan(0);
  });

});

describe("TextCompare options", () => {
  it("ignores case and whitespace when the options are on", async () => {
    render(<TextCompare />);
    fireEvent.change(screen.getByPlaceholderText("Enter original text..."), {
      target: { value: "Hello   World" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter modified text..."), {
      target: { value: " hello world" },
    });
    expect(await screen.findByText("0% similar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Ignore whitespace" }));
    fireEvent.click(screen.getByRole("switch", { name: "Ignore case" }));
    expect(await screen.findByText("100% similar")).toBeInTheDocument();
    expect(screen.getByText("Identical")).toBeInTheDocument();
  });
});
