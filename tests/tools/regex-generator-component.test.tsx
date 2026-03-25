import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegexGenerator } from "@/components/tools/RegexGenerator";

describe("RegexGenerator", () => {
  it("tests a pattern and shows FAQ guidance", async () => {
    render(<RegexGenerator />);

    fireEvent.change(screen.getByPlaceholderText("Enter regex pattern"), {
      target: { value: "a+" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter text to test against the pattern"), {
      target: { value: "caa" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Test Pattern" }));

    expect(await screen.findByText("Matches (1)")).toBeInTheDocument();
    expect(screen.getByText("aa")).toBeInTheDocument();
    expect(screen.getByText("What do the g, i, and m flags mean?")).toBeInTheDocument();
    expect(screen.getByText("Are the preset patterns guaranteed validators?")).toBeInTheDocument();
  });
});
