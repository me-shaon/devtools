import { describe, expect, it } from "vitest";
import { layoutFlowchart, linkText, nextNodeId, parseFlowchart, placeNodes, toMermaid, type Flowchart } from "@/utils/mermaid-flowchart";
import { MERMAID_TEMPLATES } from "@/utils/mermaid-templates";

const chart = (text: string): Flowchart => {
  const result = parseFlowchart(text);
  if ("error" in result) throw new Error(result.error);
  return result.chart;
};

describe("parseFlowchart", () => {
  it("reads the flowchart template", () => {
    const parsed = chart(MERMAID_TEMPLATES.find((item) => item.id === "flowchart")!.source);
    expect(parsed.direction).toBe("TD");
    expect(parsed.nodes.map((node) => [node.id, node.label, node.shape])).toEqual([
      ["A", "Request", "rect"],
      ["B", "Signed in?", "diamond"],
      ["C", "Load dashboard", "rect"],
      ["D", "Show sign-in page", "rect"],
      ["E", "Check credentials", "rect"],
    ]);
    expect(parsed.edges.map((edge) => `${edge.from}>${edge.to}:${edge.label}`)).toEqual(["A>B:", "B>C:Yes", "B>D:No", "D>E:", "E>C:Valid", "E>D:Invalid"]);
  });

  it("reads each shape", () => {
    const parsed = chart(
      'graph LR\n a([s]) --- b[[sub]] --- c[(db)] --- d((c)) --- e{{h}} --- f[/p/] --- g[\\q\\] --- h[/t\\] --- i[\\u/] --- j>flag] --- k(r) --- l{"d, (x)"}',
    );
    expect(parsed.nodes.map((node) => node.shape)).toEqual([
      "stadium",
      "subroutine",
      "cylinder",
      "circle",
      "hexagon",
      "parallelogram",
      "parallelogram-alt",
      "trapezoid",
      "trapezoid-alt",
      "asymmetric",
      "round",
      "diamond",
    ]);
    expect(parsed.nodes.at(-1)!.label).toBe("d, (x)");
  });

  it("reads link styles, heads, and lengths", () => {
    const parsed = chart("flowchart TD\n A -.-> B\n B ==> C\n C --- D\n D --o E\n E <--> F\n F ---> G\n G -. maybe .-> H\n H == big ==> I\n I x--x J");
    expect(parsed.edges.map(({ line, head, both, length, label }) => [line, head, both, length, label])).toEqual([
      ["dotted", "arrow", false, 0, ""],
      ["thick", "arrow", false, 0, ""],
      ["solid", "none", false, 0, ""],
      ["solid", "circle", false, 0, ""],
      ["solid", "arrow", true, 0, ""],
      ["solid", "arrow", false, 1, ""],
      ["dotted", "arrow", false, 0, "maybe"],
      ["thick", "arrow", false, 0, "big"],
      ["solid", "cross", true, 0, ""],
    ]);
  });

  it("reads chains, groups, and statements split by semicolons", () => {
    const parsed = chart("graph TD; A --> B --> C; A & B --> D");
    expect(parsed.edges.map((edge) => `${edge.from}${edge.to}`)).toEqual(["AB", "BC", "AD", "BD"]);
  });

  it("keeps styles, classes, comments, and the preamble", () => {
    const parsed = chart('%%{init: {"theme": "forest"}}%%\nflowchart LR\n  %% note\n  A:::hot --> B\n  classDef hot fill:#f96\n  style B stroke:#333');
    expect(parsed.preamble).toBe('%%{init: {"theme": "forest"}}%%');
    expect(parsed.nodes[0].className).toBe("hot");
    expect(parsed.extra).toEqual(["%% note", "classDef hot fill:#f96", "style B stroke:#333"]);
  });

  it("refuses other diagrams and subgraphs", () => {
    expect(parseFlowchart("sequenceDiagram\n A->>B: hi")).toMatchObject({ line: 1 });
    expect(parseFlowchart("flowchart TD\n subgraph one\n A\n end")).toMatchObject({ line: 2, error: expect.stringContaining("subgraph") });
    expect(parseFlowchart("flowchart TD\n A -->")).toMatchObject({ line: 2 });
  });
});

describe("toMermaid", () => {
  it("writes text that reads back to the same chart", () => {
    for (const source of [
      MERMAID_TEMPLATES.find((item) => item.id === "flowchart")!.source,
      'graph LR\n a([s]) -.-> b{"x | y"}\n b ==>|"say \\"hi\\""| c[/p/]\n c <--> d\n d -->|"a | b"| g(" ")\n d ---o e\n f\n classDef k fill:#fff',
    ]) {
      const first = chart(source);
      const again = chart(toMermaid(first));
      expect(again).toEqual(first);
    }
  });

  it("writes each node shape where it first appears", () => {
    const text = toMermaid(chart("flowchart TD\n A[Start] --> B{Ok?}\n B --> A\n C"));
    expect(text).toBe("flowchart TD\n    A[Start] --> B{Ok?}\n    B --> A\n    C");
  });

  it("quotes labels with syntax marks", () => {
    expect(toMermaid(chart("flowchart TD\n A[x]"))).toBe("flowchart TD\n    A[x]");
    expect(toMermaid({ ...chart("flowchart TD\n A"), nodes: [{ id: "A", label: "", shape: "round" }] })).toBe('flowchart TD\n    A(" ")');
    expect(linkText({ label: "a|b", line: "solid", head: "arrow", both: false, length: 0 })).toBe('-->|"a|b"|');
    expect(linkText({ label: "", line: "thick", head: "none", both: false, length: 1 })).toBe("====");
    expect(linkText({ label: "", line: "dotted", head: "cross", both: true, length: 0 })).toBe("x-.-x");
  });
});

describe("layout", () => {
  it("gives the next free id", () => {
    expect(nextNodeId({ nodes: [{ id: "A", label: "A", shape: "rect" }] })).toBe("B");
  });

  it("lays out top to bottom and places a new node below its neighbor", () => {
    const parsed = chart("flowchart TD\n A --> B");
    const layout = layoutFlowchart(parsed);
    expect(layout.B.y).toBeGreaterThan(layout.A.y);
    const grown = chart("flowchart TD\n A --> B --> C");
    const placed = placeNodes(grown, layout);
    expect(placed.A).toEqual(layout.A);
    expect(placed.C.y).toBeGreaterThan(placed.B.y);
  });
});
