import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownEditor } from "@/components/tools/MarkdownEditor";

const input = () => screen.getByLabelText("Markdown") as HTMLTextAreaElement;
const preview = () => screen.getByTitle("Markdown preview") as HTMLIFrameElement;
const previewHtml = () => preview().getAttribute("srcdoc") ?? "";

describe("MarkdownEditor", () => {
  it("renders the preview in a frame without scripts", () => {
    render(<MarkdownEditor />);
    expect(preview().getAttribute("sandbox")).toBe("allow-same-origin");
    expect(previewHtml()).toContain("default-src 'none'");
    expect(previewHtml()).toContain('<article class="markdown-body">');
  });

  it("updates the preview when the markdown changes", async () => {
    render(<MarkdownEditor />);
    fireEvent.change(input(), { target: { value: "# Preview Title\n\n- First item\n- Second item" } });
    await waitFor(() => expect(previewHtml()).toContain("<h1>Preview Title</h1>"));
    expect(previewHtml()).toContain("<li>First item</li>");
  });

  it("does not render script handlers in the preview", async () => {
    render(<MarkdownEditor />);
    fireEvent.change(input(), { target: { value: "# Safe\n\n<img src=x onerror=alert(1)>" } });
    await waitFor(() => expect(previewHtml()).toContain("Safe"));
    expect(previewHtml()).not.toMatch(/onerror/i);
  });

  it("blocks remote images until Load images, and copies the sanitized HTML", async () => {
    render(<MarkdownEditor />);
    fireEvent.change(input(), { target: { value: "![badge](https://img.example/b.svg)\n\n<script>x()</script>" } });
    expect(await screen.findByText("1 remote image is blocked.")).toBeInTheDocument();
    expect(previewHtml()).toContain("img-src data: blob:;");

    fireEvent.click(screen.getByRole("button", { name: "Load images" }));
    await waitFor(() => expect(previewHtml()).toContain("img-src data: blob: https: http:"));
    expect(screen.getByText("Remote images are loaded.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Block images" }));
    await waitFor(() => expect(previewHtml()).toContain("img-src data: blob:;"));
  });

  it("follows the app theme", async () => {
    render(<MarkdownEditor />);
    expect(previewHtml()).toContain("color-scheme:light");
    await act(async () => document.documentElement.classList.add("dark"));
    await waitFor(() => expect(previewHtml()).toContain("color-scheme:dark"));
    document.documentElement.classList.remove("dark");
  });

  it("shows an empty state after Clear", () => {
    render(<MarkdownEditor />);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("The preview appears here")).toBeInTheDocument();
  });
});

describe("MarkdownEditor scroll sync", () => {
  const sizes = (element: Element, scrollHeight: number, clientHeight: number) => {
    Object.defineProperty(element, "scrollHeight", { configurable: true, value: scrollHeight });
    Object.defineProperty(element, "clientHeight", { configurable: true, value: clientHeight });
  };
  const setup = () => {
    render(<MarkdownEditor />);
    const doc = preview().contentDocument!;
    const page = doc.scrollingElement ?? doc.documentElement;
    sizes(input(), 1200, 200);
    sizes(page, 2200, 200);
    fireEvent.load(preview());
    return { win: preview().contentWindow!, page };
  };

  it("scrolls the preview when the editor scrolls", () => {
    const { page } = setup();
    input().scrollTop = 500;
    fireEvent.scroll(input());
    expect(page.scrollTop).toBe(1000);
  });

  it("scrolls the editor when the preview scrolls", () => {
    const { win, page } = setup();
    page.scrollTop = 1500;
    fireEvent.scroll(win);
    expect(input().scrollTop).toBe(750);
  });

  it("does not sync back the scroll that a sync caused", () => {
    const { win, page } = setup();
    input().scrollTop = 500;
    fireEvent.scroll(input());
    // The preview fires a scroll event for the position that sync set
    input().scrollTop = 520;
    fireEvent.scroll(win);
    expect(input().scrollTop).toBe(520);
    expect(page.scrollTop).toBe(1000);
  });

  it("keeps the editor position when the preview reloads", () => {
    const { page } = setup();
    input().scrollTop = 250;
    fireEvent.scroll(input());
    page.scrollTop = 0;
    fireEvent.load(preview());
    expect(page.scrollTop).toBe(500);
  });
});

describe("MarkdownEditor formatting toolbar", () => {
  it("formats the selection and keeps the editor focused", async () => {
    render(<MarkdownEditor />);
    fireEvent.change(input(), { target: { value: "make this bold" } });
    input().setSelectionRange(10, 14);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(input().value).toBe("make this **bold**");
    expect(input().value.slice(input().selectionStart, input().selectionEnd)).toBe("bold");
    await waitFor(() => expect(previewHtml()).toContain("<strong>bold</strong>"));
  });

  it("applies a format from a keyboard shortcut", () => {
    render(<MarkdownEditor />);
    fireEvent.change(input(), { target: { value: "word" } });
    input().setSelectionRange(0, 4);
    fireEvent.keyDown(input(), { key: "i", metaKey: /Mac/.test(navigator.platform), ctrlKey: !/Mac/.test(navigator.platform) });
    expect(input().value).toBe("_word_");
  });
});

describe("MarkdownEditor pressed formats", () => {
  it("shows the formats at the caret as pressed, and removes one when clicked", async () => {
    render(<MarkdownEditor />);
    fireEvent.change(input(), { target: { value: "- some **bold** text" } });
    input().focus();
    input().setSelectionRange(10, 10);
    fireEvent.select(input());

    const bold = screen.getByRole("button", { name: "Bold" });
    await waitFor(() => expect(bold).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "Bulleted list" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Undo" })).not.toHaveAttribute("aria-pressed");

    fireEvent.click(bold);
    expect(input().value).toBe("- some bold text");
    await waitFor(() => expect(bold).toHaveAttribute("aria-pressed", "false"));
  });
});

describe("MarkdownEditor keyboard and history", () => {
  const command = { metaKey: /Mac/.test(navigator.platform), ctrlKey: !/Mac/.test(navigator.platform) };
  const type = (value: string) => {
    fireEvent.change(input(), { target: { value } });
  };

  it("undoes and redoes formatting with the toolbar and the keyboard", () => {
    render(<MarkdownEditor />);
    type("word");
    input().setSelectionRange(0, 4);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(input().value).toBe("**word**");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(input().value).toBe("word");
    expect(input().value.slice(input().selectionStart, input().selectionEnd)).toBe("word");

    fireEvent.keyDown(input(), { key: "z", shiftKey: true, ...command });
    expect(input().value).toBe("**word**");
    fireEvent.keyDown(input(), { key: "z", ...command });
    expect(input().value).toBe("word");
  });

  it("undoes the edit menu command and Clear", () => {
    render(<MarkdownEditor />);
    type("keep me");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(input().value).toBe("");
    const event = new InputEvent("beforeinput", { inputType: "historyUndo", bubbles: true, cancelable: true });
    input().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(input().value).toBe("keep me");
  });

  it("continues a list on Enter", () => {
    render(<MarkdownEditor />);
    type("- one");
    input().setSelectionRange(5, 5);
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(input().value).toBe("- one\n- ");
  });

  it("disables Redo until there is something to redo", () => {
    render(<MarkdownEditor />);
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });
});
