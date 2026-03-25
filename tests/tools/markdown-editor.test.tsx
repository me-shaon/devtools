import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("updates the preview when the markdown changes", async () => {
    render(<MarkdownEditor />);

    fireEvent.change(screen.getByPlaceholderText("Write your markdown here..."), {
      target: { value: "# Preview Title" },
    });

    await waitFor(() => {
      expect(screen.getByText("Preview Title")).toBeInTheDocument();
    });
  });

  it("renders unordered lists as bullet items", async () => {
    render(<MarkdownEditor />);

    fireEvent.change(screen.getByPlaceholderText("Write your markdown here..."), {
      target: { value: "## Highlights\n- First item\n- Second item" },
    });

    await waitFor(() => {
      expect(screen.getByRole("list")).toBeInTheDocument();
    });

    expect(screen.getByText("First item").tagName).toBe("LI");
    expect(screen.getByText("Second item").tagName).toBe("LI");
  });
});
