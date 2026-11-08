import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { KeyRound } from "lucide-react";
import type { DIAGRAM_COLORS } from "@/utils/db-diagram/export";
import { handleId, HEADER_HEIGHT, ROW_HEIGHT, tableSize } from "@/utils/db-diagram/layout";
import type { DbTable } from "@/utils/db-diagram/model";

export interface TableNodeData extends Record<string, unknown> {
  table: DbTable;
  foreignKeys: string[];
  colors: (typeof DIAGRAM_COLORS)["light"];
  selectedColumn: string | null;
  onSelectColumn: (table: string, column: string) => void;
}

export type TableNodeType = Node<TableNodeData, "table">;

/** A table on the canvas. Each column row has a handle on each side, to draw references from. */
export const TableNode = memo(function TableNode({ data, selected }: NodeProps<TableNodeType>) {
  const { table, colors, foreignKeys, selectedColumn, onSelectColumn } = data;
  return (
    <div
      className="db-table"
      data-selected={selected || undefined}
      style={{ width: tableSize(table).width, background: colors.table, borderColor: colors.border, color: colors.text }}
    >
      <div
        className="db-table-header"
        style={{ height: HEADER_HEIGHT, background: table.color ?? colors.header, color: colors.headerText }}
        title={table.note ?? undefined}
      >
        {table.schema && <span className="db-table-schema">{table.schema}.</span>}
        <span className="truncate">{table.name}</span>
      </div>
      {table.columns.map((column, index) => (
        <div
          key={column.name}
          className="db-table-row"
          data-selected={selectedColumn === column.name || undefined}
          style={{ height: ROW_HEIGHT, borderColor: colors.border }}
          title={column.note ?? undefined}
          onClick={(event) => {
            event.stopPropagation();
            onSelectColumn(table.id, column.name);
          }}
        >
          <Handle type="source" position={Position.Left} id={handleId(index, "left")} className="db-handle" />
          <span className="db-column-name" data-pk={column.pk || undefined}>
            {column.pk && <KeyRound size={11} aria-label="Primary key" />}
            <span className="truncate">{column.name}</span>
            {column.notNull && !column.pk && <span style={{ color: colors.muted }} aria-label="Not null">*</span>}
          </span>
          <span className="db-column-type" style={{ color: colors.muted }}>
            {column.type}
          </span>
          {foreignKeys.includes(column.name) && (
            <span className="db-column-key" style={{ color: colors.muted }}>
              FK
            </span>
          )}
          <Handle type="source" position={Position.Right} id={handleId(index, "right")} className="db-handle" />
        </div>
      ))}
    </div>
  );
});
