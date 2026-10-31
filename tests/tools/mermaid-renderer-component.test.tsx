import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MermaidRenderer } from "@/components/tools/MermaidRenderer";
import { MERMAID_TEMPLATES } from "@/utils/mermaid-templates";

const renderMermaid = vi.hoisted(() => vi.fn());

vi.mock("@/utils/mermaid-render", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/mermaid-render")>()),
  renderMermaid,
}));

const editor = () => screen.getByLabelText("Mermaid") as HTMLTextAreaElement;

describe("MermaidRenderer", () => {
  beforeEach(() => {
    renderMermaid.mockReset();
    renderMermaid.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', type: "flowchart-v2", width: 200, height: 100 });
  });

  it("renders the starter flowchart as an image", async () => {
    render(<MermaidRenderer />);
    const image = await screen.findByRole("img", { name: "Rendered flowchart-v2 diagram" });
    expect(image.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(renderMermaid).toHaveBeenCalledWith(MERMAID_TEMPLATES[0].source, expect.any(Boolean));
    expect(screen.getByText("200 × 100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save PNG" })).toBeInTheDocument();
  });

  it("shows a syntax error and keeps the last diagram", async () => {
    render(<MermaidRenderer />);
    await screen.findByRole("img");
    renderMermaid.mockRejectedValue(new Error("Parse error on line 1:\nExpecting 'NODE'"));
    fireEvent.change(editor(), { target: { value: "flowchart TD\n  A -->" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Parse error on line 1:");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Expecting");
    expect(screen.getByText("The preview shows the last diagram that rendered.")).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("renders again in the other theme", async () => {
    render(<MermaidRenderer />);
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    await waitFor(() => expect(renderMermaid).toHaveBeenLastCalledWith(expect.any(String), true));
  });

  it("replaces the text with a template and can undo it", async () => {
    render(<MermaidRenderer />);
    fireEvent.change(editor(), { target: { value: "graph LR\n  mine --> yours" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Template" }), { target: { value: "sequence" } });
    expect(editor().value).toMatch(/^sequenceDiagram/);

    fireEvent.click(screen.getByRole("button", { name: "Undo template" }));
    expect(editor().value).toBe("graph LR\n  mine --> yours");
  });

  it("shows no undo when a template replaces another template", () => {
    render(<MermaidRenderer />);
    fireEvent.change(screen.getByRole("combobox", { name: "Template" }), { target: { value: "pie" } });
    expect(screen.queryByRole("button", { name: "Undo template" })).not.toBeInTheDocument();
  });

  it("shows the empty state when the text is cleared", async () => {
    render(<MermaidRenderer />);
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByText("The diagram appears here")).toBeInTheDocument();
  });
});
