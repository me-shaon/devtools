import { useMemo, useState } from "react";
import { AlignLeft, CheckCircle2, Columns2, Copy, Clipboard, Rows2, ShieldCheck } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { getJsonPaths, getJsonStats, getJsonType, jsonToXml, jsonToYaml, runJsonQuery, sortJsonKeys } from "@/utils/json";
import { toast } from "sonner";

type OutputKind = "json" | "yaml" | "xml";
const QUERY_HINT = "Examples: $.tools[0], users[*].name, $['my key']";

const LAYOUT_KEY = "devtools-json-layout";

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
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [valid, setValid] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [indent, setIndent] = useState("2");
  const [layout, setLayout] = useState(readLayout);
  const [inputScroll, setInputScroll] = useState(0);
  const [outputKind, setOutputKind] = useState<OutputKind>("json");
  const [query, setQuery] = useState("");
  const suggestions = useMemo(() => {
    if (!input.trim() || input.length > 200_000) return [];
    try { return getJsonPaths(JSON.parse(input)).slice(0, 100); } catch { return []; }
  }, [input]);

  const transform = (mode: "format" | "minify" | "validate" | "sort" | "yaml" | "xml" | "query") => {
    if (!input.trim()) { toast.error("Enter JSON to continue."); return; }
    try {
      const parsed: unknown = JSON.parse(input);
      let kind: OutputKind = "json";
      let text: string | null = null;
      if (mode === "format") text = JSON.stringify(parsed, null, Number(indent));
      else if (mode === "minify") text = JSON.stringify(parsed);
      else if (mode === "sort") text = JSON.stringify(JSON.parse(sortJsonKeys(input) ?? "null"), null, Number(indent));
      else if (mode === "yaml") { kind = "yaml"; text = jsonToYaml(input); }
      else if (mode === "xml") { kind = "xml"; text = jsonToXml(input); }
      else if (mode === "query") {
        if (!query.trim()) { toast.error("Enter a query."); return; }
        const result = runJsonQuery(parsed, query);
        if ("error" in result) { setError(""); setValid(true); setOutput(""); setInfo(result.error); return; }
        if (!result.found) { setError(""); setValid(true); setOutput(""); setInfo("No match for this query."); return; }
        text = JSON.stringify(result.value, null, Number(indent)) ?? "null";
      }
      if (text !== null) { setOutput(text); setOutputKind(kind); }
      setError(""); setValid(true);
      if (mode === "validate") {
        const stats = getJsonStats(input);
        setInfo(stats ? `${getJsonType(parsed)} · ${stats.size} characters · ${stats.keys} keys · depth ${stats.depth}` : null);
      } else setInfo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check your JSON syntax.");
      setValid(false); setOutput(""); setInfo(null);
    }
  };
  const changeLayout = (next: "side" | "below") => {
    setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* Session preference still works. */ }
  };
  const paste = async () => {
    try { setInput(await navigator.clipboard.readText()); setValid(false); setError(""); setOutput(""); setInfo(null); }
    catch { toast.error("Clipboard unavailable. Paste directly into the input instead."); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(output); toast.success("Copied to clipboard."); }
    catch { toast.error("Could not copy. Select the output and copy it manually."); }
  };

  return <div className="json-workspace">
    <div className="editor-toolbar">
      <div className="toolbar-actions">
        <button type="button" className="native-button" onClick={() => transform("format")}><AlignLeft size={15} />Format</button>
        <button type="button" className="toolbar-text-button" onClick={() => transform("minify")}>Minify</button>
        <button type="button" className="toolbar-text-button" onClick={() => transform("validate")}>Validate</button>
        <button type="button" className="toolbar-text-button" onClick={() => transform("sort")}>Sort keys</button>
        <button type="button" className="toolbar-text-button" onClick={() => transform("yaml")}>Convert to YAML</button>
        <button type="button" className="toolbar-text-button" onClick={() => transform("xml")}>Convert to XML</button>
        <label className="indent-control">Indent <select aria-label="Indentation" value={indent} onChange={(event) => setIndent(event.target.value)}><option value="2">2 spaces</option><option value="4">4 spaces</option></select></label>
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
          onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); transform("query"); } }} />
        <datalist id="json-query-paths">{suggestions.map((path) => <option key={path} value={path} />)}</datalist>
        <button type="button" className="toolbar-text-button" onClick={() => transform("query")}>Run query</button>
        <span id="json-query-hint" className="indent-control" style={{ borderLeft: 0 }}>{QUERY_HINT}</span>
      </div>
    </div>
    {info && <div className="json-info" role="status">{info}</div>}
    {error && <div className="json-error" role="alert"><strong>Invalid JSON.</strong> {error}</div>}
    <div className="editor-panels" data-layout={layout}>
      <PanelGroup direction={layout === "side" ? "horizontal" : "vertical"} key={layout}>
        <Panel minSize={20} defaultSize={50}>
          <div className="editor-pane">
            <div className="editor-pane-header"><label htmlFor="json-workspace-input">JSON Input</label><button type="button" className="toolbar-text-button" onClick={paste}><Clipboard size={14} />Paste</button></div>
            <div className="code-input-wrap">
              <div className="line-numbers" aria-hidden="true"><div style={{ transform: `translateY(-${inputScroll}px)` }}>{Array.from({ length: input.split("\n").length }, (_, index) => <div key={index}>{index + 1}</div>)}</div></div>
              <textarea id="json-workspace-input" spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" value={input} onScroll={(event) => setInputScroll(event.currentTarget.scrollTop)} onChange={(event) => { setInput(event.target.value); setValid(false); setError(""); setOutput(""); setInfo(null); }} placeholder={'Paste JSON here to get started…\n\nYour data stays on this device.'} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); transform("format"); } }} />
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="editor-resize" aria-label="Resize input and output" />
        <Panel minSize={20} defaultSize={50}>
          <div className="editor-pane">
            <div className="editor-pane-header"><span id="json-output-label">Output</span><button type="button" disabled={!output} className="toolbar-text-button" onClick={copy}><Copy size={14} />Copy</button></div>
            <div className="code-output" tabIndex={0} role="region" aria-labelledby="json-output-label">
              {output ? <pre>{output.split("\n").map((line, index) => <div className="code-line" key={index}><span className="output-line-number" aria-hidden="true">{index + 1}</span><code>{outputKind === "json" ? <JsonCode value={line} /> : line}</code></div>)}</pre> : <div className="editor-empty"><AlignLeft size={24} strokeWidth={1.3} /><p>Results appear here.</p><span>Paste JSON, then choose Format, Minify or a conversion.</span></div>}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
    <footer className="editor-status" aria-live="polite"><span>{valid ? <><CheckCircle2 size={14} className="status-valid" />Valid JSON</> : error ? "Check input" : "Ready"}</span>{output && <span>{output.split("\n").length} lines · {new TextEncoder().encode(output).length} bytes</span>}<span className="ml-auto">UTF-8</span><span><ShieldCheck size={13} />Local processing</span></footer>
  </div>;
}
