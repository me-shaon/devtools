import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import {
  buildUrlFromDetails,
  decodeUrl,
  encodeUrl,
  parseUrlDetails,
  type ParsedUrlDetails,
} from "@/utils/url";

type Mode = "encode" | "decode" | "parse";
type Scope = "component" | "full";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What does URL encoding do?",
    a: "URL encoding replaces reserved or unsafe characters with percent-encoded bytes such as `%20`. That makes text safe to place in query strings, form values, and path segments.",
  },
  {
    q: "Is URL encoding the same as Base64?",
    a: "No. URL encoding preserves text meaning while escaping special characters for URLs, whereas Base64 rewrites data into a different text alphabet for transport.",
  },
  {
    q: "Why do spaces become `%20`?",
    a: "A space is not safe to include literally in many URL contexts, so it is percent-encoded as `%20`. HTML forms use `+` instead. Turn on Spaces as + to match form encoding.",
  },
  {
    q: "What does Parse URL do?",
    a: "It splits a full URL into protocol, credentials, host, port, path, hash, and query parameters. You can edit the parameters and copy the rebuilt URL. Parameter names and values are shown decoded and are encoded again when the URL is rebuilt.",
  },
  {
    q: "When should I use Full URL instead of Component?",
    a: "Use Full URL (`encodeURI`) when you already have a full URL and want to keep structural characters like `:`, `/`, `?`, and `#` intact. Use Component (`encodeURIComponent`) for individual pieces of a URL, such as one query value.",
  },
];


export function UrlEncoder() {
  const [mode, setMode] = useState<Mode>("encode");
  const [scope, setScope] = useState<Scope>("component");
  const [form, setForm] = useState(false);
  const [input, setInput] = useState("");
  const [parseInput, setParseInput] = useState("");
  const [parsed, setParsed] = useState<ParsedUrlDetails | null>(null);
  const [parseError, setParseError] = useState("");

  const pendingInput = useDebouncedValue(input);
  const pendingParse = useDebouncedValue(parseInput);

  const result = useMemo(() => {
    if (!pendingInput) return { output: "", error: "" };
    const options = { component: scope === "component", form: scope === "component" && form };
    try {
      return { output: mode === "decode" ? decodeUrl(pendingInput, options) : encodeUrl(pendingInput, options), error: "" };
    } catch {
      return {
        output: "",
        error: mode === "decode"
          ? "Invalid percent-encoding. Each % must be followed by two hex digits."
          : "Could not encode the text. It contains an unpaired surrogate character.",
      };
    }
  }, [pendingInput, mode, scope, form]);

  // Parse again when the URL changes. Parameter edits apply to the last parse.
  useEffect(() => {
    if (!pendingParse.trim()) {
      setParsed(null);
      setParseError("");
      return;
    }
    const next = parseUrlDetails(pendingParse);
    if ("error" in next) {
      setParsed(null);
      setParseError(next.error);
    } else {
      setParsed(next.value);
      setParseError("");
    }
  }, [pendingParse]);

  const updateParam = (index: number, field: "key" | "value", value: string) => {
    setParsed((prev) =>
      prev
        ? { ...prev, params: prev.params.map((p, i) => (i === index ? { ...p, [field]: value } : p)) }
        : prev
    );
  };

  const removeParam = (index: number) => {
    setParsed((prev) => (prev ? { ...prev, params: prev.params.filter((_, i) => i !== index) } : prev));
  };

  const addParam = () => {
    setParsed((prev) => (prev ? { ...prev, params: [...prev.params, { key: "", value: "" }] } : prev));
  };

  const rebuiltUrl = parsed ? buildUrlFromDetails(parsed) : "";

  // Move the result into the input and reverse the direction
  const swap = () => {
    setInput(result.output);
    setMode(mode === "encode" ? "decode" : "encode");
  };

  const parsing = mode === "parse";
  const error = parsing ? parseError : result.error;
  const outputTitle = mode === "decode" ? "Decoded" : "Encoded";

  const status = () => {
    if (error) return <span className="text-destructive">Invalid input</span>;
    if (parsing) {
      if (!parsed) return <span>Ready</span>;
      const count = parsed.params.length;
      return <span>{parsed.hostname || parsed.protocol} · {count} {count === 1 ? "parameter" : "parameters"}</span>;
    }
    if (!result.output) return <span>Ready</span>;
    return <span>{pendingInput.length} → {result.output.length} characters</span>;
  };

  const parts = parsed
    ? ([
        ["Protocol", parsed.protocol],
        ["Username", parsed.username],
        ["Password", parsed.password],
        ["Host", parsed.hostname],
        ["Port", parsed.port],
        ["Path", parsed.pathname],
        ["Hash", parsed.hash],
      ] as const).filter(([label, value]) => value || ["Protocol", "Host", "Path"].includes(label))
    : [];

  return (
    <ToolWorkspace
      id="url-encoder"
      toolbar={
        <>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList aria-label="Mode">
              <TabsTrigger value="encode">Encode</TabsTrigger>
              <TabsTrigger value="decode">Decode</TabsTrigger>
              <TabsTrigger value="parse">Parse URL</TabsTrigger>
            </TabsList>
          </Tabs>
          {!parsing && (
            <>
              <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)} className="indent-control">
                <TabsList aria-label="Scope">
                  <TabsTrigger value="component">Component</TabsTrigger>
                  <TabsTrigger value="full">Full URL</TabsTrigger>
                </TabsList>
              </Tabs>
              {scope === "component" && (
                <label className="option-switch" htmlFor="url-form">
                  Spaces as +
                  <Switch id="url-form" checked={form} onCheckedChange={setForm} />
                </label>
              )}
              <button type="button" className="toolbar-text-button" onClick={swap} disabled={!result.output}>
                Swap
              </button>
            </>
          )}
        </>
      }
      notice={error ? <div className="workspace-notice" data-tone="error" role="alert">{error}</div> : undefined}
      first={
        parsing ? (
          <EditorPane title="URL" htmlFor="parse-input" scroll={false}
            actions={parseInput ? <button type="button" className="toolbar-text-button" onClick={() => setParseInput("")}>Clear</button> : undefined}>
            <CodeTextarea
              id="parse-input"
              placeholder="https://user:pass@example.com:8080/path?tag=a&tag=b#top"
              value={parseInput}
              onChange={(e) => setParseInput(e.target.value)}
            />
          </EditorPane>
        ) : (
          <EditorPane title={mode === "decode" ? "Encoded text" : "Text"} htmlFor="url-input" scroll={false}
            actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}>
            <CodeTextarea
              id="url-input"
              placeholder={mode === "decode" ? "Enter URL-encoded text (e.g., Hello%20World%21%20%40%23%24)" : "Enter text to encode (e.g., Hello World! @#$)"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </EditorPane>
        )
      }
      second={
        parsing ? (
          <EditorPane title="Parts">
            {parsed ? (
              <div className="result-list">
                {parts.map(([label, value]) => (
                  <div key={label} className="result-row">
                    <span className="result-row-label">{label}</span>
                    <span className="result-row-value">{value}</span>
                    <CopyButton value={value} iconOnly label={`Copy ${label.toLowerCase()}`} />
                  </div>
                ))}
                <div className="pane-options">
                  <span className="font-medium">Query parameters ({parsed.params.length})</span>
                  <button type="button" className="toolbar-text-button" onClick={addParam}>
                    <Plus size={14} aria-hidden="true" />
                    Add parameter
                  </button>
                </div>
                {parsed.params.map((param, index) => (
                  <div key={index} className="flex gap-2 border-b px-4 py-2">
                    <Input
                      aria-label={`Parameter ${index + 1} name`}
                      value={param.key}
                      onChange={(e) => updateParam(index, "key", e.target.value)}
                      className="h-7 font-mono text-xs"
                      placeholder="name"
                    />
                    <Input
                      aria-label={`Parameter ${index + 1} value`}
                      value={param.value}
                      onChange={(e) => updateParam(index, "value", e.target.value)}
                      className="h-7 font-mono text-xs"
                      placeholder="value"
                    />
                    <button
                      type="button"
                      className="toolbar-text-button"
                      aria-label={`Remove parameter ${index + 1}`}
                      onClick={() => removeParam(index)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <div className="result-row">
                  <label className="result-row-label" htmlFor="parse-output">Rebuilt URL</label>
                  <textarea
                    id="parse-output"
                    className="result-row-value code-textarea"
                    value={rebuiltUrl}
                    readOnly
                    rows={Math.max(1, Math.ceil(rebuiltUrl.length / 64))}
                  />
                  <CopyButton value={rebuiltUrl} iconOnly label="Copy URL" />
                </div>
              </div>
            ) : (
              <PaneEmpty title="URL parts appear here" hint="Paste a full URL, for example https://example.com/?q=1." />
            )}
          </EditorPane>
        ) : (
          <EditorPane title={outputTitle} htmlFor={result.output ? "url-output" : undefined} scroll={false}
            actions={<CopyButton value={result.output} label="Copy" ariaLabel={`Copy ${outputTitle.toLowerCase()} text`} />}>
            {result.output ? (
              <CodeTextarea id="url-output" value={result.output} readOnly />
            ) : (
              <PaneEmpty title={`${outputTitle} text appears here`} />
            )}
          </EditorPane>
        )
      }
      status={status()}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
