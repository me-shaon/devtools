import { Plus, Trash2, X } from "lucide-react";
import { CommitField } from "@/components/tools/db-diagram/Inspector";
import { SHAPE_MENU, SHAPES, type FlowEdge, type Flowchart, type FlowNode, type Head, type LineStyle } from "@/utils/mermaid-flowchart";

/** An edge is selected by its index in the flowchart. */
export type FlowSelection = { kind: "node"; id: string } | { kind: "edge"; index: number } | null;

const LINES: { id: LineStyle; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "dotted", label: "Dotted" },
  { id: "thick", label: "Thick" },
];

const HEADS: { id: Head; label: string }[] = [
  { id: "arrow", label: "Arrow" },
  { id: "none", label: "None" },
  { id: "circle", label: "Circle" },
  { id: "cross", label: "Cross" },
];

interface FlowInspectorProps {
  chart: Flowchart;
  selection: NonNullable<FlowSelection>;
  onNode: (id: string, change: Partial<FlowNode>) => void;
  onEdge: (index: number, change: Partial<FlowEdge>) => void;
  onAddAfter: (id: string) => void;
  onDelete: (selection: NonNullable<FlowSelection>) => void;
  onClose: () => void;
}

/** The panel that edits the selected node or link. */
export function FlowInspector({ chart, selection, onNode, onEdge, onAddAfter, onDelete, onClose }: FlowInspectorProps) {
  const close = (
    <button type="button" className="db-inspector-close" aria-label="Close the inspector" onClick={onClose}>
      <X size={14} aria-hidden="true" />
    </button>
  );

  if (selection.kind === "edge") {
    const edge = chart.edges[selection.index];
    if (!edge) return null;
    return (
      <aside className="db-inspector" aria-label="Link">
        <div className="db-inspector-title">
          <h3>
            <code>{edge.from}</code> to <code>{edge.to}</code>
          </h3>
          {close}
        </div>
        <CommitField
          key={`edge-${selection.index}-${edge.label}`}
          label="Label"
          value={edge.label}
          onCommit={(label) => {
            onEdge(selection.index, { label: label.trim() });
            return true;
          }}
        />
        <label className="db-inspector-field">
          <span>Line</span>
          <select className="db-select" value={edge.line} onChange={(event) => onEdge(selection.index, { line: event.target.value as LineStyle })}>
            {LINES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="db-inspector-field">
          <span>Head</span>
          <select className="db-select" value={edge.head} onChange={(event) => onEdge(selection.index, { head: event.target.value as Head })}>
            {HEADS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="db-inspector-flags">
          <label>
            <input
              type="checkbox"
              checked={edge.both}
              disabled={edge.head === "none"}
              onChange={(event) => onEdge(selection.index, { both: event.target.checked })}
            />
            Both ends
          </label>
        </div>
        <button type="button" className="db-inspector-delete" onClick={() => onDelete(selection)}>
          <Trash2 size={13} aria-hidden="true" />
          Delete link
        </button>
      </aside>
    );
  }

  const node = chart.nodes.find((item) => item.id === selection.id);
  if (!node) return null;
  return (
    <aside className="db-inspector" aria-label="Node">
      <div className="db-inspector-title">
        <h3>
          Node <code>{node.id}</code>
        </h3>
        {close}
      </div>
      <CommitField
        key={`node-${node.id}-${node.label}`}
        label="Label"
        value={node.label}
        onCommit={(label) => {
          onNode(node.id, { label: label.trim() });
          return true;
        }}
      />
      <label className="db-inspector-field">
        <span>Shape</span>
        <select className="db-select" value={node.shape} onChange={(event) => onNode(node.id, { shape: event.target.value as FlowNode["shape"] })}>
          {/* A shape from the text that the menu does not list still shows */}
          {[...SHAPE_MENU, ...(SHAPE_MENU.includes(node.shape) ? [] : [node.shape])].map((shape) => (
            <option key={shape} value={shape}>
              {SHAPES.find((item) => item.shape === shape)!.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="toolbar-text-button self-start" onClick={() => onAddAfter(node.id)}>
        <Plus size={13} aria-hidden="true" />
        Add linked node
      </button>
      <button type="button" className="db-inspector-delete" onClick={() => onDelete(selection)}>
        <Trash2 size={13} aria-hidden="true" />
        Delete node
      </button>
    </aside>
  );
}
