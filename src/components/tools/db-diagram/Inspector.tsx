import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ChevronLeft, Trash2, X } from "lucide-react";
import type { ColumnFlag, EditOp } from "@/utils/db-diagram/edits";
import { findTable, refKey, type Cardinality, type DbModel } from "@/utils/db-diagram/model";

/** A reference is selected by its key, because its index changes when the text changes. */
export type Selection = { kind: "table"; table: string } | { kind: "column"; table: string; column: string } | { kind: "ref"; key: string } | null;

interface InspectorProps {
  model: DbModel;
  selection: NonNullable<Selection>;
  /** Applies the edit. Returns false when the edit was refused. */
  onEdit: (op: EditOp) => boolean;
  onSelect: (selection: Selection) => void;
}

const HEADER_COLORS = ["#475569", "#b91c1c", "#c2410c", "#a16207", "#15803d", "#0e7490", "#1d4ed8", "#7c3aed", "#be185d"];

const CARDINALITY_LABELS: Record<Cardinality, string> = { one: "one", "zero-or-one": "zero or one", many: "many", "zero-or-many": "zero or many" };

/** A text field that applies its value on Enter or when it loses focus. */
function CommitField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => boolean }) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft.trim() === value) return setDraft(value);
    if (!onCommit(draft)) setDraft(value);
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      setDraft(value);
      event.currentTarget.blur();
    }
  };
  return (
    <label className="db-inspector-field">
      <span>{label}</span>
      <input value={draft} spellCheck={false} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={keyDown} />
    </label>
  );
}

function AddColumnForm({ onAdd }: { onAdd: (name: string, type: string) => boolean }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("varchar");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (onAdd(name, type)) setName("");
  };
  return (
    <form className="db-inspector-add" onSubmit={submit} aria-label="Add a column">
      <input aria-label="New column name" placeholder="column_name" value={name} spellCheck={false} onChange={(event) => setName(event.target.value)} />
      <input aria-label="New column type" value={type} spellCheck={false} onChange={(event) => setType(event.target.value)} />
      <button type="submit" className="toolbar-text-button" disabled={!name.trim()}>
        Add column
      </button>
    </form>
  );
}

/** The panel that edits the selected table, column, or reference. */
export function Inspector({ model, selection, onEdit, onSelect }: InspectorProps) {
  const close = (
    <button type="button" className="db-inspector-close" aria-label="Close the inspector" onClick={() => onSelect(null)}>
      <X size={14} aria-hidden="true" />
    </button>
  );

  if (selection.kind === "ref") {
    const index = model.refs.findIndex((item) => refKey(item) === selection.key);
    const ref = model.refs[index];
    if (!ref) return null;
    const end = (side: typeof ref.from) => `${side.table}.${side.columns.length > 1 ? `(${side.columns.join(", ")})` : side.columns[0]}`;
    return (
      <aside className="db-inspector" aria-label="Reference">
        <div className="db-inspector-title">
          <h3>Reference</h3>
          {close}
        </div>
        <p className="db-inspector-text">
          <code>{end(ref.from)}</code> ({CARDINALITY_LABELS[ref.from.cardinality]}) to <code>{end(ref.to)}</code> ({CARDINALITY_LABELS[ref.to.cardinality]})
        </p>
        {(ref.onDelete || ref.onUpdate) && (
          <p className="db-inspector-text">
            {[ref.onDelete && `On delete: ${ref.onDelete}`, ref.onUpdate && `On update: ${ref.onUpdate}`].filter(Boolean).join(". ")}
          </p>
        )}
        <button type="button" className="db-inspector-delete" onClick={() => onEdit({ kind: "delete-ref", index }) && onSelect(null)}>
          <Trash2 size={13} aria-hidden="true" />
          Delete reference
        </button>
      </aside>
    );
  }

  const table = findTable(model, selection.table);
  if (!table) return null;

  if (selection.kind === "column") {
    const column = table.columns.find((item) => item.name === selection.column);
    if (!column) return null;
    const flag = (name: ColumnFlag, on: boolean) => onEdit({ kind: "set-flag", table: table.id, column: column.name, flag: name, on });
    const back = (
      <h3>
        <button type="button" className="db-inspector-back" aria-label={`Back to table ${table.id}`} onClick={() => onSelect({ kind: "table", table: table.id })}>
          <ChevronLeft size={14} aria-hidden="true" />
          {table.id}
        </button>
      </h3>
    );
    if (column.partial) {
      return (
        <aside className="db-inspector" aria-label="Column">
          <div className="db-inspector-title">
            {back}
            {close}
          </div>
          <p className="db-inspector-text">
            <code>{column.name}</code> comes from TablePartial <code>{column.partial}</code>. Change it in the DBML.
          </p>
        </aside>
      );
    }
    return (
      <aside className="db-inspector" aria-label="Column">
        <div className="db-inspector-title">
          {back}
          {close}
        </div>
        <CommitField
          key={`name-${table.id}-${column.name}`}
          label="Name"
          value={column.name}
          onCommit={(name) => onEdit({ kind: "rename-column", table: table.id, column: column.name, name })}
        />
        <CommitField
          key={`type-${table.id}-${column.name}-${column.type}`}
          label="Type"
          value={column.type}
          onCommit={(type) => onEdit({ kind: "set-type", table: table.id, column: column.name, type })}
        />
        <div className="db-inspector-flags">
          {(
            [
              ["pk", "Primary key", column.pk],
              ["not null", "Not null", column.notNull],
              ["unique", "Unique", column.unique],
            ] as const
          ).map(([name, label, checked]) => (
            <label key={name}>
              <input type="checkbox" checked={checked} onChange={(event) => flag(name, event.target.checked)} />
              {label}
            </label>
          ))}
        </div>
        <button
          type="button"
          className="db-inspector-delete"
          onClick={() => onEdit({ kind: "delete-column", table: table.id, column: column.name }) && onSelect({ kind: "table", table: table.id })}
        >
          <Trash2 size={13} aria-hidden="true" />
          Delete column
        </button>
      </aside>
    );
  }

  const refCount = model.refs.filter((ref) => ref.from.table === table.id || ref.to.table === table.id).length;
  const remove = () => {
    if (refCount > 0 && !window.confirm(`Delete ${table.id} and its ${refCount === 1 ? "reference" : `${refCount} references`}?`)) return;
    if (onEdit({ kind: "delete-table", table: table.id })) onSelect(null);
  };
  return (
    <aside className="db-inspector" aria-label="Table">
      <div className="db-inspector-title">
        <h3>Table</h3>
        {close}
      </div>
      <CommitField key={`table-${table.id}`} label="Name" value={table.name} onCommit={(name) => onEdit({ kind: "rename-table", table: table.id, name })} />
      <div className="db-inspector-field">
        <span>Header color</span>
        <div className="db-inspector-swatches" role="radiogroup" aria-label="Header color">
          {HEADER_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={table.color?.toLowerCase() === color}
              aria-label={color}
              style={{ background: color }}
              onClick={() => onEdit({ kind: "set-color", table: table.id, color })}
            />
          ))}
          {table.color && (
            <button type="button" className="toolbar-text-button" onClick={() => onEdit({ kind: "set-color", table: table.id, color: null })}>
              Clear
            </button>
          )}
        </div>
      </div>
      <AddColumnForm onAdd={(name, type) => onEdit({ kind: "add-column", table: table.id, name, type })} />
      <button type="button" className="db-inspector-delete" onClick={remove}>
        <Trash2 size={13} aria-hidden="true" />
        Delete table
      </button>
    </aside>
  );
}
