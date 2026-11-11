import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MermaidRenderer } from "@/components/tools/MermaidRenderer";
import { MERMAID_TEMPLATES } from "@/utils/mermaid-templates";

const renderMermaid = vi.hoisted(() => vi.fn());

vi.mock("@/utils/mermaid-render", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/mermaid-render")>()),
  renderMermaid,
}));

beforeAll(() => {
  // React Flow measures nodes. jsdom has no layout, so these stubs give it fixed sizes.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.DOMMatrixReadOnly ??= class {
    m22 = 1;
  } as unknown as typeof DOMMatrixReadOnly;
});

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

  describe("Draw mode", () => {
    const nodeIds = () => [...document.querySelectorAll(".react-flow__node")].map((node) => node.getAttribute("data-id"));
    const node = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
    const draw = () => {
      render(<MermaidRenderer />);
      fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    };

    it("draws the nodes of the flowchart", () => {
      draw();
      expect(nodeIds()).toEqual(["A", "B", "C", "D", "E"]);
      expect(screen.getByText("5 nodes")).toBeInTheDocument();
      expect(screen.getByText("6 links")).toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: "Zoom" })).not.toBeInTheDocument();
    });

    it("adds a node and writes it to the text", () => {
      draw();
      fireEvent.change(screen.getByRole("combobox", { name: "New node shape" }), { target: { value: "diamond" } });
      fireEvent.click(screen.getByRole("button", { name: "Add node" }));
      expect(editor().value).toMatch(/\n {4}F\{New node\}$/);
      expect(screen.getByRole("complementary", { name: "Node" })).toHaveTextContent("F");
    });

    it("renames a node, changes its shape, and links a new node to it", () => {
      draw();
      fireEvent.click(within(node("A")).getByText("Request"));
      const inspector = screen.getByRole("complementary", { name: "Node" });
      const label = within(inspector).getByLabelText("Label");
      fireEvent.change(label, { target: { value: "Incoming request" } });
      fireEvent.blur(label);
      expect(editor().value).toContain("A[Incoming request] --> B{Signed in?}");

      fireEvent.change(within(inspector).getByLabelText("Shape"), { target: { value: "stadium" } });
      expect(editor().value).toContain("A([Incoming request])");

      fireEvent.click(within(inspector).getByRole("button", { name: "Add linked node" }));
      expect(editor().value).toContain("A --> F[New node]");
      expect(nodeIds()).toContain("F");
    });

    it("deletes a node with its links", () => {
      draw();
      fireEvent.click(within(node("D")).getByText("Show sign-in page"));
      fireEvent.click(screen.getByRole("button", { name: "Delete node" }));
      expect(editor().value).not.toMatch(/\bD\b/);
      expect(screen.getByText("3 links")).toBeInTheDocument();
    });

    it("changes the direction", () => {
      draw();
      fireEvent.change(screen.getByRole("combobox", { name: "Direction" }), { target: { value: "LR" } });
      expect(editor().value).toMatch(/^flowchart LR\n/);
    });

    it("follows the typed text", () => {
      draw();
      fireEvent.change(editor(), { target: { value: "graph LR\n  x --> y & z" } });
      expect(nodeIds()).toEqual(["x", "y", "z"]);
      expect(screen.getByText("2 links")).toBeInTheDocument();
    });

    it("keeps the last flowchart and refuses canvas edits while the text has a subgraph", () => {
      draw();
      fireEvent.change(editor(), { target: { value: "flowchart TD\n  subgraph one\n  A\n  end" } });
      expect(screen.getByRole("alert")).toHaveTextContent("Draw mode cannot edit subgraph lines yet.");
      expect(nodeIds()).toHaveLength(5);
      fireEvent.click(screen.getByRole("button", { name: "Add node" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Correct the text before you edit on the canvas.");
      expect(editor().value).toContain("subgraph one");
    });

    it("offers a new flowchart for other diagram types", () => {
      draw();
      fireEvent.change(editor(), { target: { value: "sequenceDiagram\n  A->>B: hi" } });
      expect(screen.getByText("Draw mode edits flowcharts")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Start a flowchart" }));
      expect(editor().value).toMatch(/^flowchart TD\n/);
      expect(nodeIds()).toEqual(["A", "B"]);
      fireEvent.click(screen.getByRole("button", { name: "Undo template" }));
      expect(editor().value).toMatch(/^sequenceDiagram/);
    });
  });
});
