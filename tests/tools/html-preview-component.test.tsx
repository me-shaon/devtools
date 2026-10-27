import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HtmlPreview } from "@/components/tools/HtmlPreview";
import { buildPreviewDocument } from "@/utils/html-preview";

const frame = () => screen.getByTitle("HTML preview") as HTMLIFrameElement;

describe("HtmlPreview", () => {
  it("sandboxes the preview and only allows scripts when the switch is on", async () => {
    render(<HtmlPreview />);
    fireEvent.change(screen.getByLabelText("HTML"), { target: { value: "<h1>Hi</h1><script>document.title='x'</script>" } });
    await waitFor(() => expect(screen.getByTitle("HTML preview")).toBeInTheDocument());

    expect(frame().hasAttribute("sandbox")).toBe(true);
    expect(frame().getAttribute("sandbox")).toBe("");
    const srcdoc = frame().getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain('http-equiv="Content-Security-Policy"');
    expect(srcdoc).toContain("default-src 'none'");
    expect(srcdoc).not.toContain("script-src");
    expect(screen.getByText(/Remote images and scripts do not load, so the preview stays offline/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Run scripts" }));
    await waitFor(() => expect(frame().getAttribute("sandbox")).toBe("allow-scripts"));
    expect(frame().getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(frame().getAttribute("srcdoc")).toContain("script-src 'unsafe-inline'");
    expect(screen.getByText(/Scripts run in an isolated frame/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Run scripts" }));
    await waitFor(() => expect(frame().getAttribute("sandbox")).toBe(""));
  });

  it("changes the viewport width", async () => {
    render(<HtmlPreview />);
    fireEvent.change(screen.getByLabelText("HTML"), { target: { value: "<p>x</p>" } });
    await waitFor(() => expect(screen.getByTitle("HTML preview")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Mobile" }));
    expect(frame().style.width).toBe("375px");
    expect(screen.getByRole("button", { name: "Mobile" })).toHaveAttribute("aria-pressed", "true");
  });

  it("puts the policy first and removes refreshes and link targets", () => {
    const doc = buildPreviewDocument(
      '<!doctype html><html><head><meta http-equiv="refresh" content="0;url=https://example.com"><link rel="stylesheet" href="https://example.com/a.css"></head><body><a href="https://example.com" target="_self">x</a></body></html>',
      { scripts: false, dark: true },
    );
    expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("<link"));
    expect(doc).not.toContain("refresh");
    expect(doc).not.toContain('target="_self"');
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain("color-scheme:dark");
  });
});
