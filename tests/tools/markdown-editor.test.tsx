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

describe("MarkdownEditor sanitizing", () => {
  it("does not render script handlers in the preview", async () => {
    const { container } = render(<MarkdownEditor />);
    fireEvent.change(screen.getByPlaceholderText("Write your markdown here..."), {
      target: { value: "# Safe\n\n<img src=x onerror=alert(1)>" },
    });
    await waitFor(() => expect(screen.getByText("Safe")).toBeInTheDocument());
    expect(container.querySelector("[onerror]")).toBeNull();
  });
});
