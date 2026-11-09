import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DbDiagram } from "@/components/tools/DbDiagram";
import { DB_TEMPLATES } from "@/utils/db-diagram/templates";

vi.mock("@/lib/desktop", () => ({ saveFile: vi.fn(() => Promise.resolve(true)) }));
import { saveFile } from "@/lib/desktop";

beforeAll(() => {
  // React Flow measures nodes. jsdom has no layout, so these stubs give it fixed sizes.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.DOMMatrixReadOnly ??= class {
    m22 = 1;
    constructor(transform?: string) {
      const scale = /scale\(([\d.]+)\)/.exec(transform ?? "");
      if (scale) this.m22 = Number(scale[1]);
    }
  } as unknown as typeof DOMMatrixReadOnly;
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const textarea = () => screen.getByLabelText("DBML") as HTMLTextAreaElement;
const nodeIds = () => [...document.querySelectorAll(".react-flow__node")].map((node) => node.getAttribute("data-id"));

describe("DbDiagram", () => {
  it("draws one node per table of the first template", () => {
    render(<DbDiagram />);
    expect(textarea().value).toBe(DB_TEMPLATES[0].source);
    expect(nodeIds().sort()).toEqual(["comments", "post_tags", "posts", "tags", "users"]);
    expect(screen.getByText("5 tables")).toBeInTheDocument();
    expect(screen.getByText("5 references")).toBeInTheDocument();
  });

  it("adds a node when a table is typed", async () => {
    render(<DbDiagram />);
    fireEvent.change(textarea(), { target: { value: "Table a {\n  id int\n}\nTable b {\n  id int\n}\n" } });
    await waitFor(() => expect(nodeIds().sort()).toEqual(["a", "b"]));
  });

  it("shows the error line and keeps the last diagram", async () => {
    render(<DbDiagram />);
    fireEvent.change(textarea(), { target: { value: "Table a {\n  id int\n" } });
    expect(await screen.findByText(/^Line \d+, column \d+:/)).toBeInTheDocument();
    expect(screen.getByText("The diagram shows the last DBML that was valid.")).toBeInTheDocument();
    expect(nodeIds()).toHaveLength(5);
  });

  it("renames a column from the inspector and keeps the comments", async () => {
    render(<DbDiagram />);
    const users = document.querySelector('.react-flow__node[data-id="users"]') as HTMLElement;
    fireEvent.click(within(users).getByText("email"));
    const inspector = screen.getByRole("complementary", { name: "Column" });
    const name = within(inspector).getByLabelText("Name");
    fireEvent.change(name, { target: { value: "login" } });
    fireEvent.blur(name);
    expect(textarea().value).toContain("  login varchar(255) [unique, not null]\n");
    expect(textarea().value).toContain("// Type DBML here");
    // A canvas edit saves the table positions
    expect(textarea().value).toContain("/* @devtools-layout");
  });

  it("turns a flag on from the inspector", () => {
    render(<DbDiagram />);
    fireEvent.click(within(document.querySelector('.react-flow__node[data-id="posts"]') as HTMLElement).getByText("body"));
    fireEvent.click(within(screen.getByRole("complementary", { name: "Column" })).getByLabelText("Not null"));
    expect(textarea().value).toContain("  body text [not null]\n");
  });

  it("adds a table from the canvas", async () => {
    render(<DbDiagram />);
    fireEvent.click(screen.getByRole("button", { name: "Add table" }));
    expect(textarea().value).toContain("Table table_1 {\n  id integer [pk]\n}\n");
    await waitFor(() => expect(nodeIds()).toContain("table_1"));
    expect(screen.getByRole("complementary", { name: "Table" })).toBeInTheDocument();
  });

  it("refuses a canvas edit while the DBML has errors", async () => {
    render(<DbDiagram />);
    fireEvent.change(textarea(), { target: { value: "Table a {\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Add table" }));
    expect(await screen.findByText(/before you edit on the canvas/)).toBeInTheDocument();
    expect(textarea().value).toBe("Table a {\n");
  });

  it("opens a .dbml file and places tables at the saved positions", async () => {
    render(<DbDiagram />);
    fireEvent.change(textarea(), { target: { value: "Table mine {\n  id int\n}\n" } });
    const file = new File(['Table a {\n  id int\n}\n\n/* @devtools-layout\n{"version": 1, "tables": {\n  "a": {"x": 120, "y": 340}\n}}\n*/\n'], "shop.dbml");
    fireEvent.change(screen.getByLabelText("Open a .dbml file"), { target: { files: [file] } });
    await waitFor(() => expect(nodeIds()).toEqual(["a"]));
    const node = document.querySelector('.react-flow__node[data-id="a"]') as HTMLElement;
    expect(node.style.transform.replace(/\s/g, "")).toContain("translate(120px,340px)");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(textarea().value).toBe("Table mine {\n  id int\n}\n");
  });

  it("imports SQL and replaces the DBML", async () => {
    render(<DbDiagram />);
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    const dialog = screen.getByRole("dialog", { name: "Import" });
    fireEvent.change(within(dialog).getByLabelText("SQL"), { target: { value: "CREATE TABLE things (id int PRIMARY KEY);" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(textarea().value).toContain('Table "things"');
    // React Flow renders the new nodes after the text changes, which can take a moment on a slow machine
    await waitFor(() => expect(nodeIds()).toEqual(["things"]));
  });

  it("shows SQL import errors in the dialog", async () => {
    render(<DbDiagram />);
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    const dialog = screen.getByRole("dialog", { name: "Import" });
    fireEvent.change(within(dialog).getByLabelText("SQL"), { target: { value: "CREATE TABLE (" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(textarea().value).toBe(DB_TEMPLATES[0].source);
  });

  it("imports a Mermaid erDiagram", async () => {
    render(<DbDiagram />);
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    const dialog = screen.getByRole("dialog", { name: "Import" });
    fireEvent.change(within(dialog).getByLabelText("Import format"), { target: { value: "mermaid" } });
    fireEvent.change(within(dialog).getByLabelText("Mermaid"), { target: { value: "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(textarea().value).toContain("Ref: ORDER.customer_id ?> CUSTOMER.id // places");
    await waitFor(() => expect(nodeIds()).toEqual(["CUSTOMER", "ORDER"]));
    expect(screen.getByText("1 reference")).toBeInTheDocument();
  });

  it("opens the DBML reference and filters its sections", () => {
    render(<DbDiagram />);
    fireEvent.click(screen.getByRole("button", { name: "Reference" }));
    const dialog = screen.getByRole("dialog", { name: "DBML reference" });
    expect(within(dialog).getByRole("heading", { name: "Indexes" })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Filter the reference"), { target: { value: "cascade" } });
    expect(within(dialog).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Reference settings"]);
    fireEvent.change(within(dialog).getByLabelText("Filter the reference"), { target: { value: "nothing-matches" } });
    expect(within(dialog).getByText(/No section matches/)).toBeInTheDocument();
  });

  it("exports SQL and Mermaid", async () => {
    render(<DbDiagram />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    const dialog = screen.getByRole("dialog", { name: "Export" });
    const output = within(dialog).getByLabelText("Exported text") as HTMLTextAreaElement;
    await waitFor(() => expect(output.value).toContain('CREATE TABLE "users"'));
    fireEvent.change(within(dialog).getByLabelText("Export format"), { target: { value: "mermaid" } });
    expect(output.value).toMatch(/^erDiagram\n/);
  });

  it("renames a table and keeps its position and the selection", async () => {
    render(<DbDiagram />);
    fireEvent.change(textarea(), { target: { value: 'Table a {\n  id int\n}\n\n/* @devtools-layout\n{"version": 1, "tables": {\n  "a": {"x": 120, "y": 340}\n}}\n*/\n' } });
    await waitFor(() => expect(nodeIds()).toEqual(["a"]));
    fireEvent.click(document.querySelector('.react-flow__node[data-id="a"]') as HTMLElement);
    const name = within(screen.getByRole("complementary", { name: "Table" })).getByLabelText("Name");
    fireEvent.change(name, { target: { value: "b" } });
    fireEvent.blur(name);
    await waitFor(() => expect(nodeIds()).toEqual(["b"]));
    const node = document.querySelector('.react-flow__node[data-id="b"]') as HTMLElement;
    expect(node.style.transform.replace(/\s/g, "")).toContain("translate(120px,340px)");
    expect(within(screen.getByRole("complementary", { name: "Table" })).getByLabelText("Name")).toHaveValue("b");
  });

  it("deletes a table from the inspector after a confirm", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DbDiagram />);
    fireEvent.click(document.querySelector('.react-flow__node[data-id="tags"]') as HTMLElement);
    fireEvent.click(within(screen.getByRole("complementary", { name: "Table" })).getByRole("button", { name: "Delete table" }));
    expect(confirm).toHaveBeenCalled();
    expect(nodeIds()).not.toContain("tags");
    expect(textarea().value).not.toMatch(/Table tags\b/);
  });

  it("writes the layout block on auto-layout", () => {
    render(<DbDiagram />);
    fireEvent.click(screen.getByRole("button", { name: "Auto-layout" }));
    expect(textarea().value).toMatch(/\/\* @devtools-layout\n\{"version": 1, "tables": \{\n {2}"comments"/);
  });

  it("saves an SVG, and shows a message when the save fails", async () => {
    render(<DbDiagram />);
    fireEvent.click(screen.getByRole("button", { name: "Save SVG" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), "schema.svg"));
    vi.mocked(saveFile).mockRejectedValueOnce(new Error("disk full"));
    fireEvent.click(screen.getByRole("button", { name: "Save SVG" }));
    expect(await screen.findByText("Could not save the SVG file.")).toBeInTheDocument();
  });

  it("closes a dialog with Escape and keeps focus inside it", () => {
    render(<DbDiagram />);
    fireEvent.click(screen.getByRole("button", { name: "Reference" }));
    const dialog = screen.getByRole("dialog", { name: "DBML reference" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("saves the draft and restores it", async () => {
    const { unmount } = render(<DbDiagram />);
    fireEvent.change(textarea(), { target: { value: "Table kept {\n  id int\n}\n" } });
    await waitFor(() => expect(localStorage.getItem("devtools-db-diagram-draft")).toContain("Table kept"));
    unmount();
    render(<DbDiagram />);
    expect(textarea().value).toContain("Table kept");
  });

  it("works when local storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<DbDiagram />);
    expect(nodeIds()).toHaveLength(5);
  });
});
