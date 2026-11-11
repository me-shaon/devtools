import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type Connection,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BookOpen, FileUp, LayoutGrid, Moon, Plus, Sun, X } from "lucide-react";
import { useDialogFocus } from "@/components/app/useDialogFocus";
import { CopyButton } from "@/components/tools/CopyButton";
import { DbmlReference } from "@/components/tools/db-diagram/DbmlReference";
import { Inspector, type Selection } from "@/components/tools/db-diagram/Inspector";
import { RelationEdge, type RelationEdgeType } from "@/components/tools/db-diagram/RelationEdge";
import { TableNode, type TableNodeType } from "@/components/tools/db-diagram/TableNode";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { saveFile } from "@/lib/desktop";
import { applyEdit, type EditOp } from "@/utils/db-diagram/edits";
import { DIAGRAM_COLORS, toJson, toMermaid, toSvg, type DiagramTheme } from "@/utils/db-diagram/export";
import { importMermaid } from "@/utils/db-diagram/mermaid-import";
import { autoLayout, columnIndexOf, handleId, joinLayout, placeMissing, pruneLayout, refEnds, splitLayout, tableSize, withLayout, type Layout } from "@/utils/db-diagram/layout";
import { EMPTY_MODEL, findTable, isForeignKey, parseDbml, refKey, tableId, type DbError, type DbModel } from "@/utils/db-diagram/model";
import { EXPORT_DIALECTS, exportSql, IMPORT_DIALECTS, importSql, type ExportDialect, type ImportDialect } from "@/utils/db-diagram/sql";
import { DB_TEMPLATES } from "@/utils/db-diagram/templates";
import { svgToPng } from "@/utils/mermaid-render";
import { initialTheme } from "@/utils/theme";

const DRAFT_KEY = "devtools-db-diagram-draft";

const NODE_TYPES = { table: TableNode };
const EDGE_TYPES = { relation: RelationEdge };

type ExportFormat = ExportDialect | "mermaid" | "json";
type ImportFormat = ImportDialect | "mermaid";

const IMPORT_PLACEHOLDERS: Record<"sql" | "mermaid", string> = {
  sql: "CREATE TABLE users (\n  id int PRIMARY KEY\n);",
  mermaid: "erDiagram\n  USERS ||--o{ POSTS : author_id",
};

const EXPORT_FORMATS: { id: ExportFormat; label: string; extension: string; type: string }[] = [
  ...EXPORT_DIALECTS.map((dialect) => ({ id: dialect.id, label: `${dialect.label} SQL`, extension: "sql", type: "application/sql" })),
  { id: "mermaid", label: "Mermaid erDiagram", extension: "mmd", type: "text/plain" },
  { id: "json", label: "JSON", extension: "json", type: "application/json" },
];

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What is DBML?",
    a: "DBML (Database Markup Language) is an open text format for database schemas. Write Table blocks with columns, and Ref lines for foreign keys. Other schema tools can open DBML files. Select Reference in the DBML pane for the full syntax. The reference works offline.",
  },
  {
    q: "Can I edit on the canvas?",
    a: "Yes. Click a table or a column to rename it, change its type and flags, or delete it. To add a reference, drag from the dot at the side of a foreign key column to the column that it refers to. A drag from a primary key or unique column goes the other way. Each change updates the DBML, and your comments stay.",
  },
  {
    q: "Where are the table positions?",
    a: "When you drag a table, the tool writes all table positions in a comment block at the end of the DBML. Other DBML tools ignore the comment, so the .dbml file stays valid.",
  },
  {
    q: "Which formats can I import and export?",
    a: "Import CREATE TABLE scripts from PostgreSQL, MySQL, SQL Server, Snowflake, and SQLite, or a Mermaid erDiagram. Export SQL for PostgreSQL, MySQL, SQL Server, and Oracle, a Mermaid erDiagram, or JSON. Save the diagram as SVG or PNG.",
  },
  {
    q: "How does the Mermaid import find the foreign keys?",
    a: "Mermaid connects entities, not columns. For each relationship, the import uses the column that the label names. If no column has that name, it looks for a name such as customer_id, then for a column marked FK. If no column fits, it adds one and marks it with a comment.",
  },
  {
    q: "Does my schema leave this computer?",
    a: "No. The tool parses, draws, and converts everything locally. It keeps your last diagram in this app's local storage until you clear it.",
  },
];

const readDraft = (): string | null => {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
};

interface Parsed {
  /** The DBML that was parsed last. */
  schema: string;
  /** The last model that parsed. It stays while the DBML has errors. */
  model: DbModel;
  errors: DbError[];
}

function parseOver(previous: Parsed, schema: string): Parsed {
  if (previous.schema === schema) return previous;
  const result = parseDbml(schema);
  return "errors" in result ? { schema, model: previous.model, errors: result.errors } : { schema, model: result.model, errors: [] };
}

const readFileText = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const errorLine = (error: DbError) => (error.line ? `Line ${error.line}, column ${error.column}: ${error.message}` : error.message);

function ImportDialog({ onImport, onClose }: { onImport: (dbml: string) => void; onClose: () => void }) {
  const [format, setFormat] = useState<ImportFormat>("postgres");
  const [source, setSource] = useState("");
  const [errors, setErrors] = useState<DbError[]>([]);
  const [busy, setBusy] = useState(false);
  const kind = format === "mermaid" ? "mermaid" : "sql";
  const submit = async () => {
    setBusy(true);
    const result = format === "mermaid" ? importMermaid(source) : await importSql(source, format);
    setBusy(false);
    if ("errors" in result) setErrors(result.errors);
    else onImport(result.text);
  };
  return (
    <ToolDialog title="Import" onClose={onClose}>
      <select
        aria-label="Import format"
        className="db-select"
        value={format}
        onChange={(event) => {
          setFormat(event.target.value as ImportFormat);
          setErrors([]);
        }}
      >
        <optgroup label="SQL">
          {IMPORT_DIALECTS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Diagram">
          <option value="mermaid">Mermaid erDiagram</option>
        </optgroup>
      </select>
      <CodeTextarea
        aria-label={kind === "mermaid" ? "Mermaid" : "SQL"}
        className="db-dialog-text"
        wrap="off"
        placeholder={IMPORT_PLACEHOLDERS[kind]}
        value={source}
        onChange={(event) => setSource(event.target.value)}
      />
      {errors.length > 0 && (
        <div className="workspace-notice" data-tone="error" role="alert">
          {errors.slice(0, 3).map((error, index) => (
            <p key={index}>{errorLine(error)}</p>
          ))}
        </div>
      )}
      <div className="db-dialog-actions">
        <p>The import replaces the current DBML.</p>
        <button type="button" className="db-dialog-primary" disabled={!source.trim() || busy} onClick={submit}>
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
    </ToolDialog>
  );
}

function ExportDialog({ schema, model, layout, onClose }: { schema: string; model: DbModel; layout: Layout; onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>("postgres");
  const [saveError, setSaveError] = useState("");
  const option = EXPORT_FORMATS.find((item) => item.id === format)!;
  const [output, setOutput] = useState({ text: "", error: "" });
  useEffect(() => {
    if (format === "mermaid") return setOutput({ text: toMermaid(model), error: "" });
    if (format === "json") return setOutput({ text: toJson(model, layout), error: "" });
    let current = true;
    setOutput({ text: "", error: "" });
    void exportSql(schema, format).then((result) => {
      if (current) setOutput("errors" in result ? { text: "", error: errorLine(result.errors[0]) } : { text: result.text, error: "" });
    });
    return () => {
      current = false;
    };
  }, [format, model, layout, schema]);
  const save = async () => {
    setSaveError("");
    try {
      await saveFile(new Blob([output.text], { type: option.type }), `schema.${option.extension}`);
    } catch {
      setSaveError("Could not save the file. Copy the text instead.");
    }
  };
  return (
    <ToolDialog title="Export" onClose={onClose}>
      <select aria-label="Export format" className="db-select" value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
        {EXPORT_FORMATS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <CodeTextarea aria-label="Exported text" className="db-dialog-text" wrap="off" readOnly value={output.text} />
      {(output.error || saveError) && (
        <div className="workspace-notice" data-tone="error" role="alert">
          {output.error || saveError}
        </div>
      )}
      <div className="db-dialog-actions">
        <span />
        <CopyButton value={output.text} label="Copy" />
        <button type="button" className="db-dialog-primary" disabled={!output.text} onClick={save}>
          Save .{option.extension}
        </button>
      </div>
    </ToolDialog>
  );
}

function ToolDialog({ title, wide, onClose, children }: { title: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useDialogFocus(true, onClose);
  return (
    <div className="modal-backdrop fixed inset-0 z-[75] flex items-center justify-center p-4 sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={title} className="modal-surface db-dialog" data-wide={wide || undefined}>
        <div className="modal-header flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            aria-label={`Close ${title.toLowerCase()}`}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="modal-body db-dialog-body">{children}</div>
      </div>
    </div>
  );
}

export function DbDiagram() {
  const [text, setText] = useState<string>(() => readDraft() ?? DB_TEMPLATES[0].source);
  const [replaced, setReplaced] = useState<string | null>(null);
  const [fileName, setFileName] = useState("schema.dbml");
  const [theme, setTheme] = useState<DiagramTheme>(initialTheme);
  const [selection, setSelection] = useState<Selection>(null);
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<"import" | "export" | "reference" | null>(null);
  const [parsed, setParsed] = useState<Parsed>(() => parseOver({ schema: "\0", model: EMPTY_MODEL, errors: [] }, splitLayout(text).schema));
  const [nodes, setNodes] = useState<TableNodeType[]>([]);
  const flow = useRef<ReactFlowInstance<TableNodeType, RelationEdgeType> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** The view to show after the next nodes render: all tables, or one table by id. */
  const pendingFit = useRef<{ table?: string } | null>(null);
  const debounced = useDebouncedValue(text, 250);

  const split = useMemo(() => splitLayout(text), [text]);
  const { model, errors } = parsed;
  const colors = DIAGRAM_COLORS[theme];
  // splitLayout gives a new object for each keystroke, so compare the positions by value
  const layoutJson = useMemo(() => JSON.stringify(split.layout), [split.layout]);
  const savedLayout = useMemo<Layout>(() => JSON.parse(layoutJson), [layoutJson]);
  const positions = useMemo(() => placeMissing(model, pruneLayout(model, savedLayout)), [model, savedLayout]);
  const foreignKeys = useMemo(
    () => new Map(model.tables.map((table) => [table.id, table.columns.filter((column) => isForeignKey(model, table.id, column.name)).map((column) => column.name)])),
    [model],
  );

  useEffect(() => {
    setParsed((previous) => parseOver(previous, splitLayout(debounced).schema));
    try {
      localStorage.setItem(DRAFT_KEY, debounced);
    } catch {
      /* The draft is only kept for this session. */
    }
  }, [debounced]);

  const selectColumn = useCallback((table: string, column: string) => setSelection({ kind: "column", table, column }), []);

  useEffect(() => {
    setNodes(
      model.tables.map((table) => ({
        id: table.id,
        type: "table",
        position: positions[table.id],
        data: { table, colors, foreignKeys: foreignKeys.get(table.id) ?? [], selectedColumn: null, onSelectColumn: selectColumn },
      })),
    );
  }, [model, positions, colors, foreignKeys, selectColumn]);

  // The selection changes only the nodes that it touches, so the other tables do not render again
  const shownNodes = useMemo(
    () =>
      nodes.map((node) => {
        const selected = selection?.kind === "table" && selection.table === node.id;
        const selectedColumn = selection?.kind === "column" && selection.table === node.id ? selection.column : null;
        if (Boolean(node.selected) === selected && node.data.selectedColumn === selectedColumn) return node;
        return { ...node, selected, data: { ...node.data, selectedColumn } };
      }),
    [nodes, selection],
  );

  useEffect(() => {
    const fit = pendingFit.current;
    if (!fit || !flow.current) return;
    pendingFit.current = null;
    const instance = flow.current;
    // Wait one frame so that React Flow has measured the new nodes
    requestAnimationFrame(() => {
      if (fit.table) {
        // Pan to the table and keep the zoom
        const zoom = instance.getZoom();
        void instance.fitView({ nodes: [{ id: fit.table }], minZoom: zoom, maxZoom: zoom, duration: 200 });
      } else {
        void instance.fitView({ duration: 200 });
      }
    });
  }, [nodes]);

  const edges = useMemo<RelationEdgeType[]>(() => {
    const boxes = new Map(nodes.map((node) => [node.id, { ...node.position, width: tableSize(node.data.table).width }]));
    return model.refs.flatMap((ref, index) => {
      const ends = refEnds(model, ref, boxes);
      if (!ends) return [];
      const { fromSide: sourceSide, toSide: targetSide, fromIndex, toIndex } = ends;
      return [
        {
          id: `ref-${index}`,
          type: "relation" as const,
          source: ref.from.table,
          target: ref.to.table,
          sourceHandle: handleId(fromIndex, sourceSide),
          targetHandle: handleId(toIndex, targetSide),
          selected: selection?.kind === "ref" && selection.key === refKey(ref),
          data: { fromCardinality: ref.from.cardinality, toCardinality: ref.to.cardinality, sourceSide, targetSide, color: colors.line, background: colors.background },
        },
      ];
    });
  }, [nodes, model, colors, selection]);

  /** Replaces the whole text, for a template, a file, an import, or New. Undo gives back the user's own text. */
  const replaceText = (next: string) => {
    const isTemplate = DB_TEMPLATES.some((item) => item.source === text);
    setReplaced(text.trim() && !isTemplate ? text : null);
    setText(next);
    setParsed((previous) => parseOver(previous, splitLayout(next).schema));
    setSelection(null);
    setMessage("");
    pendingFit.current = {};
  };

  const typeText = (next: string) => {
    setText(next);
    setReplaced(null);
    setMessage("");
  };

  /** Applies a canvas edit to the DBML. The positions on screen are saved, so no table moves. */
  const edit = (op: EditOp): boolean => {
    const current = parsed.schema === split.schema && errors.length === 0 ? { model } : parseDbml(split.schema);
    if ("errors" in current) {
      setMessage("Correct the errors in the DBML before you edit on the canvas.");
      return false;
    }
    if (op.kind === "delete-ref") {
      // The inspector shows the last parsed model. The text can have changed since, so find the same reference again.
      const key = model.refs[op.index] && refKey(model.refs[op.index]);
      const index = current.model.refs.findIndex((ref) => refKey(ref) === key);
      if (index < 0) {
        setMessage("The reference changed. Select it again.");
        return false;
      }
      op = { ...op, index };
    }
    const result = applyEdit(split.schema, current.model, op);
    if ("error" in result) {
      setMessage(result.error);
      return false;
    }

    const layout: Layout = { ...placeMissing(current.model, pruneLayout(current.model, split.layout)) };
    let nextSelection = selection;
    if (op.kind === "rename-table") {
      const table = findTable(current.model, op.table)!;
      const id = tableId(table.schema, op.name.trim());
      layout[id] = layout[op.table];
      delete layout[op.table];
      if (selection && "table" in selection && selection.table === op.table) nextSelection = { ...selection, table: id };
    }
    if (op.kind === "rename-column" && selection?.kind === "column" && selection.table === op.table && selection.column === op.column) {
      nextSelection = { ...selection, column: op.name.trim() };
    }
    if (op.kind === "add-table" && result.table) nextSelection = { kind: "table", table: result.table };
    const nextLayout = placeMissing(result.model, pruneLayout(result.model, layout));

    const nextText = joinLayout(result.text, nextLayout);
    setText(nextText);
    // Store the DBML as splitLayout gives it, so the debounced parse sees no change
    setParsed({ schema: splitLayout(nextText).schema, model: result.model, errors: [] });
    setSelection(nextSelection);
    setReplaced(null);
    setMessage("");
    if (op.kind === "add-table" && result.table) pendingFit.current = { table: result.table };
    return true;
  };

  const onNodesChange = useCallback((changes: NodeChange<TableNodeType>[]) => setNodes((current) => applyNodeChanges(changes, current)), []);

  const onNodeDragStop = (_event: unknown, _node: TableNodeType, dragged: TableNodeType[]) => {
    const layout: Layout = { ...positions };
    for (const node of dragged) layout[node.id] = node.position;
    setText(withLayout(text, layout));
  };

  const onConnect = (connection: Connection) => {
    const fromTable = findTable(model, connection.source);
    const toTable = findTable(model, connection.target);
    const fromColumn = fromTable?.columns[columnIndexOf(connection.sourceHandle)];
    const toColumn = toTable?.columns[columnIndexOf(connection.targetHandle)];
    if (!fromTable || !toTable || !fromColumn || !toColumn) return;
    let from = { table: fromTable.id, column: fromColumn.name };
    let to = { table: toTable.id, column: toColumn.name };
    // A drag from a key column to a plain column goes the other way: the plain column refers to the key
    const isKey = (column: typeof fromColumn) => column.pk || column.unique;
    if (isKey(fromColumn) && !isKey(toColumn)) [from, to] = [to, from];
    edit({ kind: "add-ref", from, to });
  };

  const relayout = () => {
    if (errors.length > 0) return setMessage("Correct the errors in the DBML before you lay out the tables.");
    setText(withLayout(text, autoLayout(model)));
    pendingFit.current = {};
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      replaceText(await readFileText(file));
      setFileName(file.name.endsWith(".dbml") ? file.name : `${file.name.replace(/\.[^.]*$/, "")}.dbml`);
    } catch {
      setMessage(`Could not read ${file.name}.`);
    }
  };

  const saveText = async () => {
    try {
      await saveFile(new Blob([text], { type: "text/plain" }), fileName);
    } catch {
      setMessage("Could not save the .dbml file. Copy the DBML instead.");
    }
  };

  const saveImage = async (kind: "svg" | "png") => {
    const image = toSvg(model, positions, theme);
    try {
      const blob = kind === "svg" ? new Blob([image.svg], { type: "image/svg+xml" }) : await svgToPng(image, 2, colors.background);
      await saveFile(blob, `${fileName.replace(/\.dbml$/, "")}.${kind}`);
    } catch {
      setMessage(`Could not save the ${kind.toUpperCase()} file.`);
    }
  };

  const notice =
    errors.length > 0 ? (
      <div className="workspace-notice" data-tone="error" role="alert">
        {errors.slice(0, 3).map((error, index) => (
          <p key={index} className="font-mono">
            {errorLine(error)}
          </p>
        ))}
        {model.tables.length > 0 && <p className="mt-1">The diagram shows the last DBML that was valid.</p>}
      </div>
    ) : message || split.warning ? (
      <div className="workspace-notice" data-tone="error" role="alert">
        {message || split.warning}
      </div>
    ) : undefined;

  return (
    <>
      <ToolWorkspace
        id="db-diagram"
        wrapToolbar
        toolbar={
          <>
            <select
              aria-label="Template"
              className="db-select"
              value=""
              onChange={(event) => {
                const template = DB_TEMPLATES.find((item) => item.id === event.target.value);
                if (template) replaceText(template.source);
              }}
            >
              <option value="" disabled>
                Template…
              </option>
              {DB_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
            </select>
            {replaced !== null && (
              <button type="button" className="toolbar-text-button" onClick={() => typeText(replaced)}>
                Undo
              </button>
            )}
            <button type="button" className="toolbar-text-button" onClick={() => fileInput.current?.click()}>
              <FileUp size={14} aria-hidden="true" />
              Open
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".dbml,.txt,text/plain"
              className="hidden"
              aria-label="Open a .dbml file"
              onChange={(event) => {
                void openFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button type="button" className="toolbar-text-button" onClick={saveText} disabled={!text.trim()}>
              Save .dbml
            </button>
            <button type="button" className="toolbar-text-button" onClick={() => setDialog("import")}>
              Import
            </button>
            <button type="button" className="toolbar-text-button" onClick={() => setDialog("export")} disabled={model.tables.length === 0 || errors.length > 0}>
              Export
            </button>
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
          </>
        }
        notice={notice}
        first={
          <EditorPane
            title="DBML"
            htmlFor="db-diagram-input"
            scroll={false}
            actions={
              <>
                <button type="button" className="toolbar-text-button" onClick={() => setDialog("reference")}>
                  <BookOpen size={14} aria-hidden="true" />
                  Reference
                </button>
                {text && (
                  <button type="button" className="toolbar-text-button" onClick={() => replaceText("")}>
                    Clear
                  </button>
                )}
              </>
            }
          >
            <CodeTextarea
              id="db-diagram-input"
              wrap="off"
              placeholder={"Table users {\n  id integer [pk]\n}"}
              value={text}
              onChange={(event) => typeText(event.target.value)}
            />
          </EditorPane>
        }
        second={
          <EditorPane
            title="Diagram"
            scroll={false}
            actions={
              <>
                <button type="button" className="toolbar-text-button" onClick={() => edit({ kind: "add-table" })}>
                  <Plus size={14} aria-hidden="true" />
                  Add table
                </button>
                <button type="button" className="toolbar-text-button" onClick={relayout} disabled={model.tables.length === 0}>
                  <LayoutGrid size={14} aria-hidden="true" />
                  Auto-layout
                </button>
                <button type="button" className="toolbar-text-button" onClick={() => saveImage("svg")} disabled={model.tables.length === 0}>
                  Save SVG
                </button>
                <button type="button" className="toolbar-text-button" onClick={() => saveImage("png")} disabled={model.tables.length === 0}>
                  Save PNG
                </button>
              </>
            }
          >
            <div className="db-canvas" style={{ background: colors.background, opacity: errors.length > 0 ? 0.6 : undefined }}>
              <ReactFlow<TableNodeType, RelationEdgeType>
                nodes={shownNodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                edgeTypes={EDGE_TYPES}
                colorMode={theme}
                connectionMode={ConnectionMode.Loose}
                deleteKeyCode={null}
                minZoom={0.02}
                fitView
                fitViewOptions={{ padding: 0.1 }}
                proOptions={{ hideAttribution: true }}
                onInit={(instance) => {
                  flow.current = instance;
                }}
                onNodesChange={onNodesChange}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={(_event, node) => setSelection({ kind: "table", table: node.id })}
                onEdgeClick={(_event, edge) => {
                  const ref = model.refs[Number(edge.id.slice(4))];
                  if (ref) setSelection({ kind: "ref", key: refKey(ref) });
                }}
                onPaneClick={() => setSelection(null)}
                onConnect={onConnect}
                isValidConnection={(connection) =>
                  connection.source !== connection.target || columnIndexOf(connection.sourceHandle) !== columnIndexOf(connection.targetHandle)
                }
              >
                <Background color={colors.border} gap={20} />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable style={{ width: 140, height: 96 }} nodeColor={(node) => (node as TableNodeType).data.table.color ?? colors.header} />
                {selection && (
                  <Panel position="top-right">
                    <Inspector key={JSON.stringify(selection)} model={model} selection={selection} onEdit={edit} onSelect={setSelection} />
                  </Panel>
                )}
              </ReactFlow>
              {model.tables.length === 0 && errors.length === 0 && (
                <div className="db-canvas-empty">
                  <PaneEmpty title="The diagram appears here" hint="Type DBML on the left, pick a template, or import SQL or Mermaid." />
                </div>
              )}
            </div>
          </EditorPane>
        }
        status={
          model.tables.length > 0 ? (
            <>
              <span>{model.tables.length === 1 ? "1 table" : `${model.tables.length} tables`}</span>
              <span>{model.refs.length === 1 ? "1 reference" : `${model.refs.length} references`}</span>
            </>
          ) : undefined
        }
        help={<ToolFaqSection items={FAQ_ITEMS} />}
      />
      {dialog === "import" && (
        <ImportDialog
          onClose={() => setDialog(null)}
          onImport={(dbml) => {
            replaceText(dbml);
            setDialog(null);
          }}
        />
      )}
      {dialog === "reference" && (
        <ToolDialog title="DBML reference" wide onClose={() => setDialog(null)}>
          <DbmlReference />
        </ToolDialog>
      )}
      {dialog === "export" && <ExportDialog schema={split.schema} model={model} layout={positions} onClose={() => setDialog(null)} />}
    </>
  );
}
