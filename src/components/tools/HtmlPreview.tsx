import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useState } from "react";
import { Monitor, Moon, Smartphone, Sun, Tablet } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { buildPreviewDocument, previewSandbox } from "@/utils/html-preview";

type Viewport = "mobile" | "tablet" | "desktop";
type Canvas = "light" | "dark";

const VIEWPORTS: { value: Viewport; label: string; width: number | null; icon: typeof Monitor }[] = [
  { value: "mobile", label: "Mobile", width: 375, icon: Smartphone },
  { value: "tablet", label: "Tablet", width: 768, icon: Tablet },
  { value: "desktop", label: "Desktop", width: null, icon: Monitor },
];

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
    q: "Does the preview match a real browser?",
    a: "It uses the same engine that runs this app. Fonts that are not installed on this device fall back to system fonts.",
  },
];

const PLACEHOLDER = '<style>\n  h1 { font-family: system-ui; color: teal; }\n</style>\n<h1>Hello</h1>\n<p>Edit the HTML to update the preview.</p>';

export function HtmlPreview() {
  const [input, setInput] = useState("");
  const [scripts, setScripts] = useState(false);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [canvas, setCanvas] = useState<Canvas>("light");
  const html = useDebouncedValue(input, 300);

  const srcDoc = useMemo(
    () => (html.trim() ? buildPreviewDocument(html, { scripts, dark: canvas === "dark" }) : ""),
    [html, scripts, canvas],
  );

  const width = VIEWPORTS.find((v) => v.value === viewport)?.width ?? null;

  return (
    <ToolWorkspace
      id="html-preview"
      toolbar={
        <>
          <div className="layout-switch" role="group" aria-label="Viewport width">
            {VIEWPORTS.map(({ value, label, width: w, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={viewport === value}
                onClick={() => setViewport(value)}
                title={w ? `${w} px wide` : "Full width"}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <div className="layout-switch" role="group" aria-label="Preview background">
            <button type="button" aria-pressed={canvas === "light"} onClick={() => setCanvas("light")}>
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
        <EditorPane title="Preview">
          {srcDoc ? (
            <div className="flex h-full min-h-full justify-center overflow-auto bg-muted">
              <iframe
                // A new frame applies the sandbox flags when scripts are turned on or off
                key={scripts ? "scripts" : "static"}
                title="HTML preview"
                sandbox={previewSandbox(scripts)}
                referrerPolicy="no-referrer"
                srcDoc={srcDoc}
                className="h-full min-h-[320px] shrink-0 border-x border-border bg-background"
                style={{ width: width ? `${width}px` : "100%" }}
              />
            </div>
          ) : (
            <PaneEmpty title="The preview appears here" hint="Type or paste HTML on the left." />
          )}
        </EditorPane>
      }
      status={
        <>
          <span>{width ? `${width} px` : "Full width"}</span>
          <span>{scripts ? "Scripts on" : "Scripts off"}</span>
          <span>Network blocked</span>
        </>
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
