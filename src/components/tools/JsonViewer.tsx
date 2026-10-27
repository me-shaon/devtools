import { useMemo, useRef, useState } from "react";
import { AlignLeft, CheckCircle2, Columns2, Clipboard, Rows2, ShieldCheck } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { describeJsonValue, getJsonPaths, renderJsonView, type JsonViewMode } from "@/utils/json";
import { errorExcerpt, readJson } from "@/utils/json-repair";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { toast } from "sonner";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";

const QUERY_HINT = "Examples: $.tools[0], users[*].name, $['my key']";
const LAYOUT_KEY = "devtools-json-layout";
// Larger input waits for a pause in typing before it is read again.
const LIVE_LIMIT = 200_000;
const INDENTS: Record<string, number | string> = { "2": 2, "4": 4, tab: "\t" };
const MODES: [JsonViewMode, string][] = [["format", "Format"], ["minify", "Minify"], ["sort", "Sort keys"], ["yaml", "YAML"], ["xml", "XML"]];

const FAQ_ITEMS: ToolFaqItem[] = [
  { q: "What input does the JSON Viewer read?", a: "It reads JSON, JSON5, and NDJSON. It also reads data literals from Python, Ruby, and JavaScript, such as a Python dict, a Ruby hash, or a JavaScript object." },
  { q: "What does the viewer repair?", a: "It reads single quotes, unquoted keys, comments, and trailing commas. It converts True, False, None, nil, tuples, symbols, and => separators. A notice lists each repair." },
  { q: "When does the viewer refuse to repair input?", a: "It refuses input that has more than one possible meaning. Examples are unquoted values, NaN, leading zeros, and two values on one line without a comma. The error shows the line and column." },
  { q: "What happens to undefined in a JavaScript object?", a: "The viewer drops a property whose value is undefined. It changes an undefined array item to null. JSON.stringify does the same." },
  { q: "How does the viewer read NDJSON?", a: "Put one JSON value on each line. The viewer reads the lines as one array." },
  { q: "Why does the viewer warn about large numbers?", a: "JavaScript rounds integers larger than 2^53. The viewer keeps these numbers exact in every output, but other tools that read the JSON can round them." },
  { q: "Does my data leave this device?", a: "No. The viewer reads and converts everything locally." },
];

function readLayout(): "side" | "below" {
  try { return localStorage.getItem(LAYOUT_KEY) === "below" ? "below" : "side"; }
  catch { return "side"; }
}

// React escapes every token; user content is never inserted as HTML.
function JsonCode({ value }: { value: string }) {
  const tokens = value.split(/("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g);
  return <>{tokens.map((token, index) => {
    const kind = token.startsWith('"') ? (token.trimEnd().endsWith(":") ? "key" : "string") : /^(true|false|null)$/.test(token) ? "literal" : /^-?\d/.test(token) ? "number" : "plain";
    return <span key={index} className={`json-${kind}`}>{token}</span>;
  })}</>;
}

export function JsonViewer() {
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState("2");
  const [layout, setLayout] = useState(readLayout);
  const [inputScroll, setInputScroll] = useState(0);
  const [mode, setMode] = useState<JsonViewMode>("format");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const debouncedInput = useDebouncedValue(input, 300);
  const source = input.length > LIVE_LIMIT ? debouncedInput : input;

  const read = useMemo(() => (source.trim() ? readJson(source) : null), [source]);
  const value = read?.ok ? read.value : undefined;
  const view = useMemo(() => (read?.ok ? renderJsonView(read.value, mode, INDENTS[indent], query) : null), [read, mode, indent, query]);
  const stats = useMemo(() => (read?.ok ? describeJsonValue(read.value) : null), [read]);
  const suggestions = useMemo(() => (value === undefined || source.length > LIVE_LIMIT ? [] : getJsonPaths(value).slice(0, 100)), [value, source]);
  const output = view?.ok ? view.text : "";
  const error = read && "error" in read ? read.error : null;
  const excerpt = error ? errorExcerpt(source, error.offset) : null;

  const changeLayout = (next: "side" | "below") => {
    setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* Session preference still works. */ }
  };
  const paste = async () => {
    try { setInput(await navigator.clipboard.readText()); }
    catch { toast.error("Clipboard unavailable. Paste directly into the input instead."); }
  };
  const showError = () => {
    const textarea = inputRef.current;
    if (!textarea || !error) return;
    textarea.focus();
    textarea.setSelectionRange(error.offset, Math.min(error.offset + 1, source.length));
  };

  return <div className="json-workspace">
    <div className="editor-toolbar">
      <div className="toolbar-actions">
        <div className="layout-switch" role="group" aria-label="Output">
          {MODES.map(([id, label]) => <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>{id === "format" && <AlignLeft size={14} />}{label}</button>)}
        </div>
        <label className="indent-control">Indent <select aria-label="Indentation" value={indent} onChange={(event) => setIndent(event.target.value)}><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tab</option></select></label>
      </div>
      <div className="layout-switch" role="group" aria-label="Result layout">
        <button type="button" aria-pressed={layout === "side"} onClick={() => changeLayout("side")}><Columns2 size={14} />Side</button>
        <button type="button" aria-pressed={layout === "below"} onClick={() => changeLayout("below")}><Rows2 size={14} />Below</button>
      </div>
    </div>
    <div className="editor-toolbar" role="search">
      <div className="toolbar-actions">
        <label className="indent-control" style={{ borderLeft: 0, paddingLeft: 0 }} htmlFor="json-query-input">Query</label>
        <input id="json-query-input" type="text" list="json-query-paths" spellCheck={false} autoComplete="off" value={query} placeholder="$.tools[0]" aria-describedby="json-query-hint"
          style={{ minWidth: 220, padding: "4px 8px", border: "1px solid hsl(var(--input))", borderRadius: 6, background: "transparent", fontFamily: "monospace", fontSize: 12 }}
          onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setMode("query"); } }} />
        <datalist id="json-query-paths">{suggestions.map((path) => <option key={path} value={path} />)}</datalist>
        <button type="button" className="toolbar-text-button" aria-pressed={mode === "query"} onClick={() => setMode("query")}>Run query</button>
        <span id="json-query-hint" className="indent-control" style={{ borderLeft: 0 }}>{QUERY_HINT}</span>
      </div>
    </div>
    {read?.ok && read.notice && <div className="json-info" role="status">{read.notice}</div>}
    {read?.ok && read.largeNumbers > 0 && <div className="json-info" role="status">{read.largeNumbers === 1 ? "1 number is" : `${read.largeNumbers} numbers are`} larger than 2^53. The output keeps them exact, but JavaScript and many JSON tools round them.</div>}
    {view && "message" in view && <div className="json-info" role="status">{view.message}</div>}
    {error && excerpt && <div className="json-error" role="alert">
      <strong>Invalid JSON.</strong> Line {error.line}, column {error.column}: {error.message}{" "}
      <button type="button" className="toolbar-text-button" style={{ color: "inherit", textDecoration: "underline" }} onClick={showError}>Show in input</button>
      <pre aria-hidden="true" style={{ margin: "6px 0 0", fontFamily: "monospace", whiteSpace: "pre" }}>{excerpt.text}{"\n"}{" ".repeat(excerpt.caret)}^</pre>
    </div>}
    <div className="editor-panels" data-layout={layout}>
      <PanelGroup direction={layout === "side" ? "horizontal" : "vertical"} key={layout}>
        <Panel minSize={20} defaultSize={50}>
          <div className="editor-pane">
            <div className="editor-pane-header"><label htmlFor="json-workspace-input">JSON Input</label><button type="button" className="toolbar-text-button" onClick={paste}><Clipboard size={14} />Paste</button></div>
            <div className="code-input-wrap">
              <div className="line-numbers" aria-hidden="true"><div style={{ transform: `translateY(-${inputScroll}px)` }}>{Array.from({ length: input.split("\n").length }, (_, index) => <div key={index}>{index + 1}</div>)}</div></div>
              <textarea ref={inputRef} id="json-workspace-input" spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" value={input} onScroll={(event) => setInputScroll(event.currentTarget.scrollTop)} onChange={(event) => setInput(event.target.value)} placeholder={'Paste JSON, NDJSON, or a Python, Ruby, or JavaScript literal…\n\nYour data stays on this device.'} />
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="editor-resize" aria-label="Resize input and output" />
        <Panel minSize={20} defaultSize={50}>
          <div className="editor-pane">
            <div className="editor-pane-header"><span id="json-output-label">Output</span><CopyButton value={output} /></div>
            <div className="code-output" tabIndex={0} role="region" aria-labelledby="json-output-label">
              {output ? <pre>{output.split("\n").map((line, index) => <div className="code-line" key={index}><span className="output-line-number" aria-hidden="true">{index + 1}</span><code>{view?.ok && view.kind === "json" ? <JsonCode value={line} /> : line}</code></div>)}</pre> : <div className="editor-empty"><AlignLeft size={24} strokeWidth={1.3} /><p>Results appear here.</p><span>Paste JSON or a data literal. The output updates as you type.</span></div>}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
    <div className="workspace-help"><ToolFaqSection items={FAQ_ITEMS} /></div>
    <footer className="editor-status" aria-live="polite">
      <span>{read?.ok ? <><CheckCircle2 size={14} className="status-valid" />{read.notice ? "Converted to JSON" : "Valid JSON"}</> : error ? "Check input" : "Ready"}</span>
      {stats && <span>{stats.type} · {stats.keys} keys · depth {stats.depth}</span>}
      {output && <span>{output.split("\n").length} lines · {new TextEncoder().encode(output).length} bytes</span>}
      <span className="ml-auto">UTF-8</span><span><ShieldCheck size={13} />Local processing</span>
    </footer>
  </div>;
}
