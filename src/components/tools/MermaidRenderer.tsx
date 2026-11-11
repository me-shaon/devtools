import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Moon, PenLine, Sun } from "lucide-react";
import { CopyButton } from "@/components/tools/CopyButton";
import { FlowCanvas } from "@/components/tools/mermaid-draw/FlowCanvas";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { saveFile } from "@/lib/desktop";
import { errorSummary, renderMermaid, svgDataUrl, svgToPng, type MermaidDiagram } from "@/utils/mermaid-render";
import { layoutFlowchart, parseFlowchart, toMermaid, type Flowchart, type Point } from "@/utils/mermaid-flowchart";
import { MERMAID_TEMPLATES } from "@/utils/mermaid-templates";
import { initialTheme } from "@/utils/theme";

type Theme = "light" | "dark";
type Mode = "preview" | "draw";

const STARTER_FLOWCHART = "flowchart TD\n    A[Start] --> B[End]";

/** The page color behind the diagram, in the preview and in PNG files. It matches Mermaid's theme. */
const BACKGROUNDS: Record<Theme, string> = { light: "#ffffff", dark: "#333333" };

const ZOOMS = [50, 75, 100, 150, 200];

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which diagram types work?",
    a: "All types that Mermaid 11 supports, such as flowcharts, sequence, class, state, entity relationship, Gantt, pie, mind map, timeline, and Git graph diagrams. Pick a template to start from an example.",
  },
  {
    q: "Can I draw a diagram instead of typing it?",
    a: "Yes, for flowcharts. Select Draw, then add nodes, drag between the dots at the sides of two nodes to link them, and click a node or a link to change its label, shape, or line. Double-click the empty canvas to add a node there. Each change rewrites the Mermaid text.",
  },
  {
    q: "What does Draw mode keep from my text?",
    a: "Nodes, shapes, links, link labels, the direction, and the lines for styles, classes, clicks, and comments. A canvas edit writes the text again in a standard form, and the kept lines move to the end. Subgraphs do not work in Draw mode yet. Edit them in the text.",
  },
  {
    q: "Do node positions on the canvas change the diagram?",
    a: "No. Mermaid places the nodes itself, so the Preview layout can differ from the canvas. Positions help you arrange the canvas while you draw, and they stay until you close the tool. The direction setting does change the diagram.",
  },
  {
    q: "Is it safe to render a diagram from someone else?",
    a: "Yes. The tool uses Mermaid's strict security level, which removes HTML and scripts from labels and turns off click handlers. The diagram shows as an image, so nothing in it can run or load from the network.",
  },
  {
    q: "Why do HTML tags in labels show as text?",
    a: "Labels are plain SVG text, so HTML formatting does not apply. Plain text labels also let the tool export PNG files.",
  },
  {
    q: "How do I change the colors?",
    a: 'Use the Light and Dark switch, or add a %%{init: {"theme": "forest"}}%% line at the top of the diagram. Theme variables in that line also work.',
  },
  {
    q: "What size is the PNG?",
    a: "Twice the diagram size, for sharp text on high-density screens. Very large diagrams are scaled down to 8192 pixels on the longest side.",
  },
];

export function MermaidRenderer() {
  const [input, setInput] = useState<string>(MERMAID_TEMPLATES[0].source);
  const [replaced, setReplaced] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [zoom, setZoom] = useState<number | null>(null);
  const [diagram, setDiagram] = useState<MermaidDiagram | null>(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [mode, setMode] = useState<Mode>("preview");
  const [positions, setPositions] = useState<Record<string, Point>>({});
  /** A new key gives a new canvas, which fits the view to the nodes. */
  const [canvasKey, setCanvasKey] = useState(0);
  const [drawMessage, setDrawMessage] = useState("");
  const [lastChart, setLastChart] = useState<Flowchart | null>(null);
  const source = useDebouncedValue(input, 300);

  // Draw mode reads the text on each change, without the delay, so the canvas follows the typing
  const parsed = useMemo(() => (mode === "draw" ? parseFlowchart(input) : null), [mode, input]);
  useEffect(() => {
    if (parsed && "chart" in parsed) setLastChart(parsed.chart);
  }, [parsed]);
  const chart = parsed && "chart" in parsed ? parsed.chart : parsed && "error" in parsed && !parsed.notFlowchart ? lastChart : null;

  useEffect(() => {
    if (!source.trim()) {
      setDiagram(null);
      setError("");
      return;
    }
    let current = true;
    renderMermaid(source, theme === "dark").then(
      (result) => {
        if (!current) return;
        setDiagram(result);
        setError("");
      },
      (reason: unknown) => {
        if (current) setError(errorSummary(reason));
      },
    );
    return () => {
      current = false;
    };
  }, [source, theme]);

  const edit = (text: string) => {
    setInput(text);
    setReplaced(null);
    setDrawMessage("");
  };

  /** Forgets the canvas positions, for a text that replaces the whole diagram. */
  const resetCanvas = () => {
    setPositions({});
    setLastChart(null);
    setCanvasKey((key) => key + 1);
  };

  /** Writes a canvas edit to the text. The text must be a flowchart that Draw mode can read. */
  const applyChart = (next: Flowchart): boolean => {
    if (!parsed || !("chart" in parsed)) {
      setDrawMessage("Correct the text before you edit on the canvas.");
      return false;
    }
    edit(toMermaid(next));
    return true;
  };

  const relayout = useCallback(() => {
    if (!chart) return;
    setPositions(layoutFlowchart(chart));
    setCanvasKey((key) => key + 1);
  }, [chart]);

  const startFlowchart = () => {
    setReplaced(input.trim() && !MERMAID_TEMPLATES.some((item) => item.source === input) ? input : null);
    setInput(STARTER_FLOWCHART);
    setDrawMessage("");
    resetCanvas();
  };

  const applyTemplate = (id: string) => {
    const template = MERMAID_TEMPLATES.find((item) => item.id === id);
    if (!template) return;
    const isTemplate = MERMAID_TEMPLATES.some((item) => item.source === input);
    // Keep the user's own text so the replacement can be undone
    setReplaced(input.trim() && !isTemplate ? input : null);
    setInput(template.source);
    setDrawMessage("");
    resetCanvas();
  };

  const save = async (kind: "svg" | "png") => {
    if (!diagram) return;
    setSaveError("");
    try {
      const blob = kind === "svg" ? new Blob([diagram.svg], { type: "image/svg+xml" }) : await svgToPng(diagram, 2, BACKGROUNDS[theme]);
      await saveFile(blob, `diagram.${kind}`);
    } catch {
      setSaveError(`Could not save the ${kind.toUpperCase()} file. Copy the SVG instead.`);
    }
  };

  const drawError = parsed && "error" in parsed && !parsed.notFlowchart ? parsed.error : "";
  const notice =
    mode === "draw" ? (
      drawError || drawMessage ? (
        <div className="workspace-notice" data-tone="error" role="alert">
          {drawMessage && <p>{drawMessage}</p>}
          {drawError && <p>{drawError}</p>}
          {drawError && chart && <p className="mt-1 text-xs">The canvas shows the last flowchart that Draw mode could read.</p>}
        </div>
      ) : undefined
    ) : error ? (
      <div className="workspace-notice" data-tone="error" role="alert">
        <pre className="whitespace-pre-wrap font-mono text-xs">{error}</pre>
        {diagram && <p className="mt-1 text-xs">The preview shows the last diagram that rendered.</p>}
      </div>
    ) : saveError ? (
      <div className="workspace-notice" data-tone="error" role="alert">
        {saveError}
      </div>
    ) : undefined;

  return (
    <ToolWorkspace
      id="mermaid-renderer"
      wrapToolbar
      toolbar={
        <>
          <div className="layout-switch" role="group" aria-label="Mode">
            <button type="button" aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>
              <Eye size={14} aria-hidden="true" />
              Preview
            </button>
            <button type="button" aria-pressed={mode === "draw"} onClick={() => setMode("draw")}>
              <PenLine size={14} aria-hidden="true" />
              Draw
            </button>
          </div>
          <select
            aria-label="Template"
            className="h-8 rounded-md border border-input bg-background px-2 pr-7 text-sm text-foreground"
            value=""
            onChange={(event) => applyTemplate(event.target.value)}
          >
            <option value="" disabled>
              Template…
            </option>
            {MERMAID_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
          {replaced !== null && (
            <button type="button" className="toolbar-text-button" onClick={() => edit(replaced)}>
              Undo template
            </button>
          )}
          <div className="layout-switch indent-control" role="group" aria-label="Diagram theme">
            <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>
              <Sun size={14} aria-hidden="true" />
              Light
            </button>
            <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>
              <Moon size={14} aria-hidden="true" />
              Dark
            </button>
          </div>
          {mode === "preview" && (
            <select
              aria-label="Zoom"
              className="h-8 rounded-md border border-input bg-background px-2 pr-7 text-sm text-foreground"
              value={zoom ?? "fit"}
              onChange={(event) => setZoom(event.target.value === "fit" ? null : Number(event.target.value))}
            >
              <option value="fit">Fit to pane</option>
              {ZOOMS.map((value) => (
                <option key={value} value={value}>
                  {value}%
                </option>
              ))}
            </select>
          )}
        </>
      }
      notice={notice}
      first={
        <EditorPane
          title="Mermaid"
          htmlFor="mermaid-input"
          scroll={false}
          actions={
            input ? (
              <button
                type="button"
                className="toolbar-text-button"
                onClick={() => {
                  edit("");
                  resetCanvas();
                }}
              >
                Clear
              </button>
            ) : undefined
          }
        >
          <CodeTextarea id="mermaid-input" wrap="off" placeholder="flowchart LR\n  A --> B" value={input} onChange={(event) => edit(event.target.value)} />
        </EditorPane>
      }
      second={
        mode === "draw" ? (
          <EditorPane title="Canvas" scroll={false}>
            {chart ? (
              <FlowCanvas
                key={canvasKey}
                chart={chart}
                stale={Boolean(drawError)}
                theme={theme}
                positions={positions}
                onPositions={setPositions}
                onChange={applyChart}
                onRelayout={relayout}
              />
            ) : (
              <div className="flow-empty">
                <PaneEmpty title="Draw mode edits flowcharts" hint="Start a flowchart here, or pick the Flowchart template." />
                <button type="button" className="db-dialog-primary" onClick={startFlowchart}>
                  Start a flowchart
                </button>
              </div>
            )}
          </EditorPane>
        ) : (
          <EditorPane
            title="Diagram"
            scroll={false}
            actions={
              diagram ? (
                <>
                  <CopyButton value={diagram.svg} label="Copy SVG" />
                  <button type="button" className="toolbar-text-button" onClick={() => save("svg")}>
                    Save SVG
                  </button>
                  <button type="button" className="toolbar-text-button" onClick={() => save("png")}>
                    Save PNG
                  </button>
                </>
              ) : undefined
            }
          >
            {diagram ? (
              <div className="mermaid-stage" style={{ background: BACKGROUNDS[theme] }} data-fit={zoom === null || undefined}>
                <img
                  src={svgDataUrl(diagram.svg)}
                  alt={`Rendered ${diagram.type} diagram`}
                  width={zoom === null ? diagram.width : Math.round((diagram.width * zoom) / 100)}
                  height={zoom === null ? diagram.height : Math.round((diagram.height * zoom) / 100)}
                  style={{ opacity: error ? 0.4 : undefined }}
                />
              </div>
            ) : (
              <PaneEmpty title="The diagram appears here" hint="Type Mermaid text on the left, or pick a template." />
            )}
          </EditorPane>
        )
      }
      status={
        mode === "draw" && chart ? (
          <>
            <span>{chart.nodes.length === 1 ? "1 node" : `${chart.nodes.length} nodes`}</span>
            <span>{chart.edges.length === 1 ? "1 link" : `${chart.edges.length} links`}</span>
          </>
        ) : mode === "preview" && diagram ? (
          <>
            <span>{diagram.type}</span>
            <span>
              {diagram.width} × {diagram.height}
            </span>
            <span>{zoom === null ? "Fit" : `${zoom}%`}</span>
          </>
        ) : undefined
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
