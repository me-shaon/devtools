import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { htmlToJsx, type HtmlToJsxResult } from "@/utils/html-to-jsx";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Is the HTML run or loaded while it converts?",
    a: "No. The HTML is parsed into a separate document that is never shown. Scripts do not run, and images and other files do not load.",
  },
  {
    q: "What happens to onclick and other event attributes?",
    a: "Each one becomes a React prop such as `onClick={() => {}}`. The original code is kept in a comment next to it. React needs a function, so write the handler yourself.",
  },
  {
    q: "Why do some inputs get defaultValue?",
    a: "In React, `value` and `checked` make a field controlled. The tool uses `defaultValue` and `defaultChecked` so the field keeps working without state.",
  },
  {
    q: "How is whitespace handled?",
    a: "Indentation in the source is dropped, as JSX does. A space between inline elements is kept as `{\" \"}`. Text inside `<pre>`, `<textarea>`, `<script>`, and `<style>` is kept exactly in a template literal.",
  },
];

const PLACEHOLDER = '<div class="card" style="margin-top: 8px">\n  <label for="email">Email</label>\n  <input id="email" type="email" required>\n  <button onclick="send()">Send</button>\n</div>';

const lineCount = (text: string) => (text ? text.split("\n").length : 0);

export function HtmlToJsx() {
  const [input, setInput] = useState("");
  const [component, setComponent] = useState(false);
  const [componentName, setComponentName] = useState("Component");

  const job = useMemo(() => ({ input, component, componentName }), [input, component, componentName]);
  const pending = useDebouncedValue(job);

  const result = useMemo<HtmlToJsxResult>(
    () => htmlToJsx(pending.input, { component: pending.component, componentName: pending.componentName }),
    [pending],
  );

  const output = "value" in result ? result.value : "";
  const error = "error" in result ? result.error : "";

  return (
    <ToolWorkspace
      id="html-to-jsx"
      toolbar={
        <>
          <label className="option-switch" htmlFor="html-to-jsx-component">
            Wrap in a component
            <Switch id="html-to-jsx-component" checked={component} onCheckedChange={setComponent} />
          </label>
          {component && (
            <label className="indent-control" htmlFor="html-to-jsx-name">
              Name
              <Input
                id="html-to-jsx-name"
                className="h-7 w-40 text-xs"
                value={componentName}
                spellCheck={false}
                onChange={(e) => setComponentName(e.target.value)}
              />
            </label>
          )}
        </>
      }
      notice={error ? <div className="workspace-notice" data-tone="error" role="alert">{error}</div> : undefined}
      first={
        <EditorPane
          title="HTML"
          htmlFor="html-to-jsx-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea id="html-to-jsx-input" wrap="off" placeholder={PLACEHOLDER} value={input} onChange={(e) => setInput(e.target.value)} />
        </EditorPane>
      }
      second={
        <EditorPane
          title="JSX"
          htmlFor={output ? "html-to-jsx-output" : undefined}
          scroll={false}
          actions={<CopyButton value={output} label="Copy JSX" />}
        >
          {output ? (
            <CodeTextarea id="html-to-jsx-output" wrap="off" value={output} readOnly />
          ) : (
            <PaneEmpty title="JSX appears here" hint="Type or paste HTML on the left." />
          )}
        </EditorPane>
      }
      status={
        error ? (
          <span className="text-destructive">Invalid name</span>
        ) : output ? (
          <>
            <span>
              {lineCount(output)} {lineCount(output) === 1 ? "line" : "lines"}
            </span>
            {"handlers" in result && result.handlers > 0 && (
              <span>
                {result.handlers} event {result.handlers === 1 ? "handler needs" : "handlers need"} code
              </span>
            )}
          </>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
