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

  it("shows normalization forms and warns about two spellings", async () => {
    render(<StringInspector />);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "caf\u00E9 cafe\u0301" } });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 character written in more than one way: \u00E9 (U+00E9 or U+0065 U+0301).",
    );
    const nfd = screen.getByText("NFD", { selector: ".result-row-label" }).nextElementSibling;
    expect(nfd).toHaveTextContent("Differs from input · 11 code points, 11 UTF-16 units, 13 bytes");
    expect(screen.getByRole("button", { name: "Copy NFC" })).toBeInTheDocument();
  });

  it("says when the variant check covers only the start of long text", async () => {
    render(<StringInspector />);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: `\u00E9${"a".repeat(200_000)}e\u0301` } });
    expect(
      await screen.findByText("The check for characters written in more than one way covered only the first 200,000 characters."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
