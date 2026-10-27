import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { formatBytes } from "@/utils/hash";
import {
  formatCode,
  type CodeLanguage,
  type FormatMode,
  type IndentChoice,
  type SqlDialect,
} from "@/utils/code-formatter";

const LANGUAGES: { value: CodeLanguage; label: string; placeholder: string }[] = [
  { value: "html", label: "HTML", placeholder: "<div><p>Hello</p><ul><li>One</li><li>Two</li></ul></div>" },
  { value: "css", label: "CSS", placeholder: ".card{color:red;margin:0 auto}.card:hover{color:blue}" },
  { value: "javascript", label: "JavaScript", placeholder: "function add(a,b){return a+b}const total=add(1,2);" },
  { value: "xml", label: "XML", placeholder: '<?xml version="1.0"?><note><to>Ana</to><body>Hi</body></note>' },
  { value: "sql", label: "SQL", placeholder: "select id, name from users where active = 1 order by name" },
];

const DIALECTS: { value: SqlDialect; label: string }[] = [
  { value: "sql", label: "Standard SQL" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "sqlite", label: "SQLite" },
];

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Is my code sent anywhere?",
    a: "No. The code is formatted on this device. Nothing is uploaded, and the tool works offline.",
  },
  {
    q: "What does Minify do?",
    a: "Minify removes comments and extra whitespace to make the code smaller. It does not rename variables or rewrite code, so the result behaves the same as the input.",
  },
  {
    q: "Why does minified JavaScript still have some line breaks?",
    a: "JavaScript can insert semicolons at line breaks. The minifier keeps a line break wherever removing it could change how the code runs.",
  },
  {
    q: "Why do I see a parse error for SQL?",
    a: "The SQL formatter reads the statement before it formats it. Check the line and column in the message. If you use database-specific syntax, select the matching dialect.",
  },
];

interface Result {
  output: string;
  error: string;
}

const EMPTY: Result = { output: "", error: "" };

const lineCount = (text: string) => (text ? text.split("\n").length : 0);

export function CodeFormatter() {
  const [language, setLanguage] = useState<CodeLanguage>("html");
  const [mode, setMode] = useState<FormatMode>("beautify");
  const [indent, setIndent] = useState<IndentChoice>("2");
  const [dialect, setDialect] = useState<SqlDialect>("sql");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Result>(EMPTY);

  // Debounce the text and the options together so an option change never runs on stale text
  const job = useMemo(() => ({ input, language, mode, indent, dialect }), [input, language, mode, indent, dialect]);
  const pending = useDebouncedValue(job);

  useEffect(() => {
    let cancelled = false;
    if (!pending.input.trim()) {
      setResult(EMPTY);
      return;
    }
    formatCode(pending.input, pending)
      .then((output) => {
        if (!cancelled) setResult({ output, error: "" });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResult({ output: "", error: error instanceof Error ? error.message : "Could not format the code." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pending]);

  const current = input.trim() ? result : EMPTY;
  const languageInfo = LANGUAGES.find((l) => l.value === language) ?? LANGUAGES[0];
  const name = languageInfo.label;
  const resultTitle = mode === "beautify" ? "Formatted" : "Minified";

  const status = () => {
    if (current.error) return <span className="text-destructive">Invalid input</span>;
    if (!current.output) return <span>Ready</span>;
    const inBytes = new TextEncoder().encode(pending.input).length;
    const outBytes = new TextEncoder().encode(current.output).length;
    const saved = inBytes > 0 ? Math.round((1 - outBytes / inBytes) * 100) : 0;
    return (
      <>
        <span>
          {formatBytes(inBytes)} in · {formatBytes(outBytes)} out
          {mode === "minify" && saved > 0 ? ` · ${saved}% smaller` : ""}
        </span>
        <span>
          {lineCount(current.output)} {lineCount(current.output) === 1 ? "line" : "lines"}
        </span>
        {mode === "minify" && language === "javascript" && <span>Names are not shortened</span>}
      </>
    );
  };

  return (
    <ToolWorkspace
      id="code-formatter"
      toolbar={
        <>
          <Tabs value={language} onValueChange={(v) => setLanguage(v as CodeLanguage)}>
            <TabsList aria-label="Language">
              {LANGUAGES.map((l) => (
                <TabsTrigger key={l.value} value={l.value}>{l.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Tabs value={mode} onValueChange={(v) => setMode(v as FormatMode)}>
            <TabsList aria-label="Mode">
              <TabsTrigger value="beautify">Beautify</TabsTrigger>
              <TabsTrigger value="minify">Minify</TabsTrigger>
            </TabsList>
          </Tabs>
          {mode === "beautify" && (
            <label className="indent-control">
              Indent
              <select aria-label="Indentation" value={indent} onChange={(e) => setIndent(e.target.value as IndentChoice)}>
                <option value="2">2 spaces</option>
                <option value="4">4 spaces</option>
                <option value="tab">Tab</option>
              </select>
            </label>
          )}
          {language === "sql" && mode === "beautify" && (
            <label className="indent-control">
              Dialect
              <select aria-label="SQL dialect" value={dialect} onChange={(e) => setDialect(e.target.value as SqlDialect)}>
                {DIALECTS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </label>
          )}
        </>
      }
      notice={
        current.error ? (
          <div className="workspace-notice" data-tone="error" role="alert">{current.error}</div>
        ) : undefined
      }
      first={
        <EditorPane title={`${name} input`} htmlFor="code-formatter-input" scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}>
          <CodeTextarea
            id="code-formatter-input"
            wrap="off"
            placeholder={languageInfo.placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane title={`${resultTitle} ${name}`} htmlFor={current.output ? "code-formatter-output" : undefined} scroll={false}
          actions={<CopyButton value={current.output} label={`Copy ${name}`} />}>
          {current.output ? (
            <CodeTextarea id="code-formatter-output" wrap="off" value={current.output} readOnly />
          ) : (
            <PaneEmpty title={`${resultTitle} ${name} appears here`} hint={`Type or paste ${name} on the left.`} />
          )}
        </EditorPane>
      }
      status={status()}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
