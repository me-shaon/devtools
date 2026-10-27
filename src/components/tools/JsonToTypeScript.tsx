import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { CODE_LANGUAGES, jsonToCode, type CodeLanguage, type CodeOptions } from "@/utils/json-to-code";

interface Result {
  output: string;
  typeCount: number;
  error: string;
}

const EMPTY: Result = { output: "", typeCount: 0, error: "" };

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Is my JSON uploaded?",
    a: "No. The types are generated on this device. Nothing is sent over the network.",
  },
  {
    q: "How are arrays of objects handled?",
    a: "The tool merges every object in the array into one type. A field that is missing from some objects becomes optional. A field that holds both integers and decimals becomes a float type.",
  },
  {
    q: "Why does a field have an unknown or any type?",
    a: "The sample did not show the type. This happens for empty arrays and for values that are always null. A comment marks each such field. Add a real value to the sample to get a precise type.",
  },
  {
    q: "What happens to keys that are not valid names?",
    a: "Each language gets its usual naming style, for example snake_case in Rust and Python and camelCase in Swift and Kotlin. Reserved words are escaped. When a name differs from the JSON key, the output maps it back with a rename attribute, a tag, or CodingKeys.",
  },
];

const LABELS = Object.fromEntries(CODE_LANGUAGES.map((l) => [l.id, l.label])) as Record<CodeLanguage, string>;

export function JsonToTypeScript() {
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<CodeLanguage>("typescript");
  const [rootName, setRootName] = useState("Root");
  const [tsStyle, setTsStyle] = useState<NonNullable<CodeOptions["tsStyle"]>>("interface");
  const [tsReadonly, setTsReadonly] = useState(false);
  const [pythonStyle, setPythonStyle] = useState<NonNullable<CodeOptions["pythonStyle"]>>("dataclass");

  const pendingInput = useDebouncedValue(input);
  const pendingRoot = useDebouncedValue(rootName);

  const result = useMemo<Result>(() => {
    if (!pendingInput.trim()) return EMPTY;
    try {
      return { ...jsonToCode(pendingInput, language, { rootName: pendingRoot, tsStyle, tsReadonly, pythonStyle }), error: "" };
    } catch (error) {
      return { ...EMPTY, error: error instanceof Error ? error.message : "Could not read the JSON." };
    }
  }, [pendingInput, pendingRoot, language, tsStyle, tsReadonly, pythonStyle]);

  const current = input.trim() ? result : EMPTY;
  const label = LABELS[language];

  const status = () => {
    if (current.error) return <span className="text-destructive">Invalid JSON</span>;
    if (!current.output) return <span>Ready</span>;
    return <span>{current.typeCount} {current.typeCount === 1 ? "type" : "types"} · {label}</span>;
  };

  return (
    <ToolWorkspace
      id="json-typescript"
      toolbar={
        <Tabs value={language} onValueChange={(v) => setLanguage(v as CodeLanguage)}>
          <TabsList aria-label="Language">
            {CODE_LANGUAGES.map((l) => (
              <TabsTrigger key={l.id} value={l.id}>{l.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
      secondaryToolbar={
        <>
          <label className="indent-control !border-l-0 !pl-0">
            Root name
            <input
              className="w-32 rounded-[5px] border border-input bg-transparent px-1.5 py-[3px] font-mono text-xs text-foreground"
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
              placeholder="Root"
              spellCheck={false}
            />
          </label>
          {language === "typescript" && (
            <>
              <label className="indent-control">
                Style
                <select aria-label="TypeScript style" value={tsStyle} onChange={(e) => setTsStyle(e.target.value as typeof tsStyle)}>
                  <option value="interface">Interfaces</option>
                  <option value="type">Type aliases</option>
                </select>
              </label>
              <label className="indent-control">
                <input type="checkbox" checked={tsReadonly} onChange={(e) => setTsReadonly(e.target.checked)} />
                Readonly
              </label>
            </>
          )}
          {language === "python" && (
            <label className="indent-control">
              Style
              <select aria-label="Python style" value={pythonStyle} onChange={(e) => setPythonStyle(e.target.value as typeof pythonStyle)}>
                <option value="dataclass">Dataclasses</option>
                <option value="pydantic">Pydantic models</option>
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
        <EditorPane title="JSON input" htmlFor="json-code-input" scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}>
          <CodeTextarea
            id="json-code-input"
            placeholder={'{"id": 1, "name": "Ada", "tags": ["admin"]}'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane title={`${label} output`} htmlFor={current.output ? "json-code-output" : undefined} scroll={false}
          actions={<CopyButton value={current.output} label={`Copy ${label}`} />}>
          {current.output ? (
            <CodeTextarea id="json-code-output" value={current.output} readOnly />
          ) : (
            <PaneEmpty title={`${label} types appear here`} hint="Type or paste JSON on the left." />
          )}
        </EditorPane>
      }
      status={status()}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
