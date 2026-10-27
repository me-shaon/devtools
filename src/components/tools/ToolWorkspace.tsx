import { useState, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Columns2, Rows2, ShieldCheck } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

type PaneLayout = "side" | "below";

interface ToolWorkspaceProps {
  /** Identifies the tool, for the saved layout preference and element ids. */
  id: string;
  /** Actions and options, left-aligned in the toolbar. */
  toolbar?: ReactNode;
  /** A second toolbar row, for example a query or key field. */
  secondaryToolbar?: ReactNode;
  /** Errors and notices shown between the toolbar and the panes. */
  notice?: ReactNode;
  /** The input pane. */
  first: ReactNode;
  /** The result pane. */
  second: ReactNode;
  /** Status bar items. "Local processing" is always appended. */
  status?: ReactNode;
  /** A collapsed help section, usually a ToolFaqSection. */
  help?: ReactNode;
}

const readLayout = (id: string): PaneLayout => {
  try {
    return localStorage.getItem(`devtools-${id}-layout`) === "below" ? "below" : "side";
  } catch {
    return "side";
  }
};

/**
 * The editor layout every text-in, text-out tool shares: a toolbar, an input
 * pane and a result pane that can sit side by side or stacked, and a status bar.
 */
export function ToolWorkspace({ id, toolbar, secondaryToolbar, notice, first, second, status, help }: ToolWorkspaceProps) {
  const [layout, setLayout] = useState<PaneLayout>(() => readLayout(id));

  const changeLayout = (next: PaneLayout) => {
    setLayout(next);
    try {
      localStorage.setItem(`devtools-${id}-layout`, next);
    } catch {
      /* The choice still applies for this session. */
    }
  };

  return (
    <div className="json-workspace tool-workspace">
      <div className="editor-toolbar">
        <div className="toolbar-actions">{toolbar}</div>
        <div className="layout-switch" role="group" aria-label="Result layout">
          <button type="button" aria-pressed={layout === "side"} onClick={() => changeLayout("side")}>
            <Columns2 size={14} aria-hidden="true" />Side
          </button>
          <button type="button" aria-pressed={layout === "below"} onClick={() => changeLayout("below")}>
            <Rows2 size={14} aria-hidden="true" />Below
          </button>
        </div>
      </div>
      {secondaryToolbar && (
        <div className="editor-toolbar">
          <div className="toolbar-actions">{secondaryToolbar}</div>
        </div>
      )}
      {notice}
      <div className="editor-panels" data-layout={layout}>
        <PanelGroup direction={layout === "side" ? "horizontal" : "vertical"} key={layout}>
          <Panel minSize={20} defaultSize={50}>{first}</Panel>
          <PanelResizeHandle className="editor-resize" aria-label="Resize input and result" />
          <Panel minSize={20} defaultSize={50}>{second}</Panel>
        </PanelGroup>
      </div>
      {help && <div className="workspace-help">{help}</div>}
      <footer className="editor-status" aria-live="polite">
        {status}
        <span className="ml-auto">UTF-8</span>
        <span><ShieldCheck size={13} aria-hidden="true" />Local processing</span>
      </footer>
    </div>
  );
}

interface EditorPaneProps {
  /** Visible pane title. */
  title: ReactNode;
  /** Id of the control the title labels, if any. */
  htmlFor?: string;
  /** Id for the title, so a region can point at it with aria-labelledby. */
  titleId?: string;
  /** Pane header actions such as Paste, Copy, or Clear. */
  actions?: ReactNode;
  children: ReactNode;
  /** Scrolls the pane body. Off for panes whose child fills and scrolls itself. */
  scroll?: boolean;
}

/** One pane of a ToolWorkspace: a compact header with a title and actions, then the body. */
export function EditorPane({ title, htmlFor, titleId, actions, children, scroll = true }: EditorPaneProps) {
  return (
    <div className="editor-pane">
      <div className="editor-pane-header">
        {htmlFor ? <label htmlFor={htmlFor} id={titleId}>{title}</label> : <span id={titleId}>{title}</span>}
        {actions && <div className="pane-actions">{actions}</div>}
      </div>
      <div className={scroll ? "pane-body pane-body-scroll" : "pane-body"}>{children}</div>
    </div>
  );
}

/** A code-style text area that fills its pane. */
export function CodeTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea spellCheck={false} autoCapitalize="off" autoCorrect="off" {...props} className={`code-textarea ${props.className ?? ""}`} />;
}

/** Placeholder for an empty result pane. */
export function PaneEmpty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="editor-empty">
      {icon}
      <p>{title}</p>
      {hint && <span>{hint}</span>}
    </div>
  );
}
