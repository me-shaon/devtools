import { Fragment } from "react";
import type { LucideIcon } from "lucide-react";
import { Bold, Code, Heading, Image, Italic, Link, List, ListOrdered, ListTodo, Quote, Redo2, Strikethrough, Table, Undo2 } from "lucide-react";
import type { ToolbarCommand } from "@/components/tools/useMarkdownEditor";
import { isMac, type MarkdownFormat } from "@/utils/markdown-format";

const mod = isMac ? "⌘" : "Ctrl+";
const shift = isMac ? "⇧" : "Shift+";

type Action = { id: ToolbarCommand; label: string; icon: LucideIcon; shortcut?: string };

const GROUPS: Action[][] = [
  [
    { id: "undo", label: "Undo", icon: Undo2, shortcut: `${mod}Z` },
    { id: "redo", label: "Redo", icon: Redo2, shortcut: isMac ? `${shift}${mod}Z` : `${mod}Y` },
  ],
  [
    { id: "bold", label: "Bold", icon: Bold, shortcut: `${mod}B` },
    { id: "italic", label: "Italic", icon: Italic, shortcut: `${mod}I` },
    { id: "heading", label: "Heading", icon: Heading },
    { id: "strikethrough", label: "Strikethrough", icon: Strikethrough, shortcut: `${shift}${mod}X` },
  ],
  [
    { id: "bullet-list", label: "Bulleted list", icon: List },
    { id: "numbered-list", label: "Numbered list", icon: ListOrdered },
    { id: "task-list", label: "Task list", icon: ListTodo },
  ],
  [
    { id: "quote", label: "Quote", icon: Quote },
    { id: "code", label: "Code", icon: Code, shortcut: `${mod}E` },
    { id: "table", label: "Table", icon: Table },
    { id: "link", label: "Link", icon: Link, shortcut: `${mod}K` },
    { id: "image", label: "Image", icon: Image },
  ],
];

// Inserting a table or undoing is an action, not a state of the text
const NO_STATE = new Set<Action["id"]>(["undo", "redo", "table"]);

interface MarkdownToolbarProps {
  /** The formats at the selection, shown as pressed buttons. */
  active: ReadonlySet<MarkdownFormat>;
  canUndo: boolean;
  canRedo: boolean;
  onCommand: (command: ToolbarCommand) => void;
}

export function MarkdownToolbar({ active, canUndo, canRedo, onCommand }: MarkdownToolbarProps) {
  return (
    <div className="format-toolbar" role="toolbar" aria-label="Formatting" aria-controls="markdown-input">
      {GROUPS.map((group, index) => (
        <Fragment key={group[0].id}>
          {index > 0 && <span className="format-toolbar-divider" aria-hidden="true" />}
          {group.map(({ id, label, icon: Icon, shortcut }) => (
            <button
              key={id}
              type="button"
              className="format-button"
              aria-label={label}
              aria-pressed={NO_STATE.has(id) ? undefined : active.has(id as MarkdownFormat)}
              title={shortcut ? `${label} (${shortcut})` : label}
              // Keep the focus and the selection in the editor
              onMouseDown={(event) => event.preventDefault()}
              disabled={(id === "undo" && !canUndo) || (id === "redo" && !canRedo)}
              onClick={() => onCommand(id)}
            >
              <Icon size={15} aria-hidden="true" />
            </button>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
