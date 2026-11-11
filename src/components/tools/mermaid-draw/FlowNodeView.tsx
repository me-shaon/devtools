import { Fragment, memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowColors, FlowNode, Shape } from "@/utils/mermaid-flowchart";

export interface FlowNodeData extends Record<string, unknown> {
  node: FlowNode;
  colors: FlowColors;
}

export type FlowNodeType = Node<FlowNodeData, "flow">;

/** Shapes that a polygon draws, in a 100 by 100 box. The other shapes are CSS borders. */
const POLYGONS: Partial<Record<Shape, string>> = {
  diamond: "50,0 100,50 50,100 0,50",
  hexagon: "12,0 88,0 100,50 88,100 12,100 0,50",
  parallelogram: "14,0 100,0 86,100 0,100",
  "parallelogram-alt": "0,0 86,0 100,100 14,100",
  trapezoid: "14,0 86,0 100,100 0,100",
  "trapezoid-alt": "0,0 100,0 86,100 14,100",
  asymmetric: "0,0 100,0 100,100 0,100 12,50",
};

const SIDES = [
  ["top", Position.Top],
  ["right", Position.Right],
  ["bottom", Position.Bottom],
  ["left", Position.Left],
] as const;

/** A label with `<br>` tags shows as lines. */
function Label({ text }: { text: string }) {
  const lines = text.split(/<br\s*\/?>/i);
  return (
    <span className="flow-node-label">
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
      {!text && " "}
    </span>
  );
}

/** A flowchart node. It has a handle on each side to draw links from. */
export const FlowNodeView = memo(function FlowNodeView({ data, selected }: NodeProps<FlowNodeType>) {
  const { node, colors } = data;
  const polygon = POLYGONS[node.shape];
  return (
    <div
      className="flow-node"
      data-shape={node.shape}
      data-selected={selected || undefined}
      style={{ color: colors.text, ...(polygon ? {} : { background: colors.node, borderColor: colors.border }) }}
    >
      {polygon && (
        <svg className="flow-node-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon points={polygon} fill={colors.node} stroke={colors.border} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <Label text={node.label} />
      {SIDES.map(([id, position]) => (
        <Handle key={id} id={id} type="source" position={position} className="flow-handle" title="Drag to another node to link" />
      ))}
    </div>
  );
});
