import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownEditor } from "@/components/tools/MarkdownEditor";

describe("MarkdownEditor", () => {
  it("uses theme-aware classes for the preview panel", () => {
    render(<MarkdownEditor />);

    const previewHeading = screen.getByText("HTML Preview");
    const previewPanel = previewHeading.parentElement?.nextElementSibling;

    expect(previewPanel).toBeInTheDocument();
    expect(previewPanel).toHaveClass("bg-background");
    expect(previewPanel).toHaveClass("text-foreground");
    expect(previewPanel).not.toHaveClass("bg-white");
  });
});
