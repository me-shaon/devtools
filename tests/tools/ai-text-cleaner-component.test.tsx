import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiTextCleaner } from "@/components/tools/AiTextCleaner";

describe("AiTextCleaner", () => {
  it("cleans text and summarizes the changes", async () => {
    render(<AiTextCleaner />);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "\u201cHi\u201d\u200b there\u2026 [1]" } });
    const output = await screen.findByLabelText("Cleaned");
    await waitFor(() => expect(output).toHaveValue('"Hi" there...'));
    expect(screen.getByText("1 invisible character removed")).toBeInTheDocument();
    expect(screen.getByText("2 quotes straightened")).toBeInTheDocument();
    expect(screen.getByText("1 citation marker removed")).toBeInTheDocument();
    expect(screen.getByText("16 \u2192 13 characters")).toBeInTheDocument();
  });

  it("applies optional dash and Markdown options", async () => {
    render(<AiTextCleaner />);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "**Bold**\u2014text" } });
    const output = await screen.findByLabelText("Cleaned");
    await waitFor(() => expect(output).toHaveValue("**Bold**\u2014text"));
    expect(screen.getByRole("switch", { name: "Remove list markers" })).toBeDisabled();
    fireEvent.click(screen.getByRole("switch", { name: "Replace dashes" }));
    fireEvent.click(screen.getByRole("switch", { name: "Remove Markdown" }));
    await waitFor(() => expect(output).toHaveValue("Bold - text"));
  });
});
