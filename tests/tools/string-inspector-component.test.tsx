import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StringInspector } from "@/components/tools/StringInspector";

describe("StringInspector", () => {
  it("shows stats and flags hidden characters", async () => {
    render(<StringInspector />);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "ab​c\r\nd" } });
    expect(await screen.findByRole("status")).toHaveTextContent("1 hidden or control character found: ZWSP ×1");
    const characters = screen.getByText("Characters", { selector: ".result-row-label" }).nextElementSibling;
    expect(characters).toHaveTextContent("6");
    expect(screen.getByText("LF (Unix)")).toBeInTheDocument();
    expect(screen.getByText("U+200B")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy without flagged characters" })).toBeInTheDocument();
  });

  it("reports clean text in the status bar", async () => {
    render(<StringInspector />);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "hello" } });
    expect(await screen.findByText("No hidden characters")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
