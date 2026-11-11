import { memo } from "react";
import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";
import { cardinalityMark, edgePath, type Side } from "@/utils/db-diagram/layout";
import type { Cardinality } from "@/utils/db-diagram/model";

/** The width of a column handle. Keep it the same as `.db-handle` in index.css. */
const HANDLE_SIZE = 8;

export interface RelationEdgeData extends Record<string, unknown> {
  fromCardinality: Cardinality;
  toCardinality: Cardinality;
  sourceSide: Side;
  targetSide: Side;
  color: string;
  background: string;
}

export type RelationEdgeType = Edge<RelationEdgeData, "relation">;

/** A reference line with crow's foot marks. It uses the same shapes as the SVG export. */
export const RelationEdge = memo(function RelationEdge({ id, sourceX, sourceY, targetX, targetY, data, selected }: EdgeProps<RelationEdgeType>) {
  if (!data) return null;
  // React Flow puts the end of a line at the outer edge of the handle. Move it back to the
  // middle of the handle, which is on the table edge, as in the SVG export.
  const inset = (side: Side) => (side === "right" ? -HANDLE_SIZE / 2 : HANDLE_SIZE / 2);
  const source = { x: sourceX + inset(data.sourceSide), y: sourceY };
  const target = { x: targetX + inset(data.targetSide), y: targetY };
  const width = selected ? 2.5 : 1.5;
  const marks = [cardinalityMark(source, data.sourceSide, data.fromCardinality), cardinalityMark(target, data.targetSide, data.toCardinality)];
  return (
    <>
      <BaseEdge id={id} path={edgePath(source, data.sourceSide, target, data.targetSide)} interactionWidth={14} style={{ stroke: data.color, strokeWidth: width }} />
      {marks.map((mark, index) => (
        <g key={index} className="db-edge-mark">
          <path d={mark.lines} fill="none" stroke={data.color} strokeWidth={width} />
          {mark.circle && <circle cx={mark.circle.x} cy={mark.circle.y} r={3.5} fill={data.background} stroke={data.color} strokeWidth={width} />}
        </g>
      ))}
    </>
  );
});
