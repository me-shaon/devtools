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
