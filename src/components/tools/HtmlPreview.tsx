import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, Monitor, Moon, Smartphone, Sun, Tablet } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { buildPreviewDocument, previewSandbox } from "@/utils/html-preview";

type Canvas = "light" | "dark";

const VIEWPORTS: { value: string; label: string; width: number | null; icon: typeof Monitor }[] = [
  { value: "mobile", label: "Mobile", width: 375, icon: Smartphone },
  { value: "tablet", label: "Tablet", width: 768, icon: Tablet },
  { value: "desktop", label: "Desktop", width: null, icon: Monitor },
];

/** The narrowest width the frame handle allows. */
const MIN_WIDTH = 240;

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Why do remote images, fonts, and stylesheets not show?",
    a: "The preview blocks all network requests with a Content-Security-Policy, so the tool stays offline. Inline styles, `<style>` elements, and `data:` images work.",
  },
  {
    q: "Is it safe to turn on scripts?",
    a: "Scripts run in a sandboxed frame with its own origin. They cannot read the app, its storage, or your files, and they cannot open windows or submit forms. They can still use the CPU, so stop a script that hangs by turning scripts off.",
  },
  {
    q: "Why do links not open?",
    a: "Links would load remote pages. The preview removes link targets and blocks new windows, so a click does nothing.",
  },
  {
    q: "How do I test a width that is not in the list?",
    a: "Drag the handle on the right edge of the preview. The frame stays centered, and the status bar shows the width. With the handle focused, the arrow keys change the width by 10 px, or by 50 px with Shift.",
  },
  {
    q: "Does the preview match a real browser?",
    a: "It uses the same engine that runs this app. Fonts that are not installed on this device fall back to system fonts.",
  },
];

const PLACEHOLDER = '<style>\n  h1 { font-family: system-ui; color: teal; }\n</style>\n<h1>Hello</h1>\n<p>Edit the HTML to update the preview.</p>';

function ViewportSwitch({ width, onChange }: { width: number | null; onChange: (width: number | null) => void }) {
  return (
    <div className="layout-switch" role="group" aria-label="Viewport width">
      {VIEWPORTS.map(({ value, label, width: w, icon: Icon }) => (
        <button key={value} type="button" aria-pressed={width === w} onClick={() => onChange(w)} title={w ? `${w} px wide` : "Full width"}>
          <Icon size={14} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function HtmlPreview() {
  const [input, setInput] = useState("");
  const [scripts, setScripts] = useState(false);
  const [width, setWidth] = useState<number | null>(null);
  const [canvas, setCanvas] = useState<Canvas>("light");
  const [fullScreen, setFullScreen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const dragStart = useRef({ x: 0, width: 0 });
  const html = useDebouncedValue(input, 300);

  const srcDoc = useMemo(
    () => (html.trim() ? buildPreviewDocument(html, { scripts, dark: canvas === "dark" }) : ""),
    [html, scripts, canvas],
  );

  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setFullScreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullScreen]);

  // The frame cannot be wider than the stage, less the handle
  const clampWidth = (next: number) => {
    const max = (stageRef.current?.clientWidth || Infinity) - 12;
    return Math.round(Math.max(MIN_WIDTH, Math.min(next, max)));
  };

  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, width: frameRef.current?.getBoundingClientRect().width ?? MIN_WIDTH };
    setDragging(true);
  };

  const drag = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    // The frame is centered, so each edge moves by half of the change
    setWidth(clampWidth(dragStart.current.width + (e.clientX - dragStart.current.x) * 2));
  };

  const resizeWithKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 50 : 10;
    const current = width ?? frameRef.current?.getBoundingClientRect().width ?? MIN_WIDTH;
    if (e.key === "ArrowLeft") setWidth(clampWidth(current - step));
    else if (e.key === "ArrowRight") setWidth(clampWidth(current + step));
    else return;
    e.preventDefault();
  };

  const stage = srcDoc ? (
    <div ref={stageRef} className="html-preview-stage">
      <iframe
        ref={frameRef}
        // A new frame applies the sandbox flags when scripts are turned on or off
        key={scripts ? "scripts" : "static"}
        title="HTML preview"
        sandbox={previewSandbox(scripts)}
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        className="h-full min-h-[320px] border-x border-border bg-background"
        style={{ width: width ? `${width}px` : undefined, flex: width ? "none" : 1, pointerEvents: dragging ? "none" : undefined }}
      />
      <div
        className="html-preview-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Preview width"
        aria-valuenow={width ?? undefined}
        aria-valuemin={MIN_WIDTH}
        tabIndex={0}
        data-active={dragging || undefined}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => setWidth(null)}
        onKeyDown={resizeWithKeys}
        title="Drag to resize. Double-click for full width."
      />
    </div>
  ) : (
    <PaneEmpty title="The preview appears here" hint="Type or paste HTML on the left." />
  );

  const widthLabel = width ? `${width} px` : "Full width";

  return (
    <ToolWorkspace
      id="html-preview"
      toolbar={
        <>
          <ViewportSwitch width={width} onChange={setWidth} />
          <div className="layout-switch" role="group" aria-label="Preview background">            <button type="button" aria-pressed={canvas === "light"} onClick={() => setCanvas("light")}>
              <Sun size={14} aria-hidden="true" />
              Light
            </button>
            <button type="button" aria-pressed={canvas === "dark"} onClick={() => setCanvas("dark")}>
              <Moon size={14} aria-hidden="true" />
              Dark
            </button>
          </div>
          <label className="option-switch indent-control" htmlFor="html-preview-scripts">
            Run scripts
            <Switch id="html-preview-scripts" checked={scripts} onCheckedChange={setScripts} aria-describedby="html-preview-isolation" />
          </label>
        </>
      }
      notice={
        <p className="workspace-notice text-muted-foreground" id="html-preview-isolation">
          {scripts
            ? "Scripts run in an isolated frame. They cannot reach the app or your files. "
            : "Scripts are off. "}
          Remote images and scripts do not load, so the preview stays offline.
        </p>
      }
      first={
        <EditorPane
          title="HTML"
          htmlFor="html-preview-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea id="html-preview-input" wrap="off" placeholder={PLACEHOLDER} value={input} onChange={(e) => setInput(e.target.value)} />
        </EditorPane>
      }
      second={
        <EditorPane
          title="Preview"
          scroll={false}
          actions={
            <button type="button" className="toolbar-text-button" onClick={() => setFullScreen(true)} disabled={!srcDoc}>
              <Maximize2 size={13} aria-hidden="true" />
              Full screen
            </button>
          }
        >
          {fullScreen ? <PaneEmpty title="The preview is in full screen" hint="Press Esc to return." /> : stage}
          {fullScreen &&
            createPortal(
              <div className="html-preview-full" role="dialog" aria-modal="true" aria-label="HTML preview, full screen">
                <div className="editor-toolbar">
                  <div className="toolbar-actions ml-auto">
                    {width && <span className="text-xs tabular-nums text-muted-foreground">{widthLabel}</span>}
                    <ViewportSwitch width={width} onChange={setWidth} />
                  </div>
                  <button type="button" className="toolbar-text-button" onClick={() => setFullScreen(false)} autoFocus>
                    <Minimize2 size={13} aria-hidden="true" />
                    Exit full screen
                  </button>
                </div>
                {stage}
              </div>,
              document.body,
            )}
        </EditorPane>
      }
      status={
        <>
          <span>{widthLabel}</span>
          <span>{scripts ? "Scripts on" : "Scripts off"}</span>
          <span>Network blocked</span>
        </>
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
