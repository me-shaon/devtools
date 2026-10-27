import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { jsonToYaml, yamlToJson, type YamlIndent } from "@/utils/yaml-json";

type Direction = "yaml-to-json" | "json-to-yaml";

interface Result {
  output: string;
  error: string;
  documents: number;
}

const EMPTY: Result = { output: "", error: "", documents: 0 };

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Is my data uploaded?",
    a: "No. The conversion runs on this device. Nothing is sent over the network.",
  },
  {
    q: "What happens with several YAML documents?",
    a: "YAML files can hold several documents separated by a line with three dashes (---). The tool converts them to a JSON array with one item for each document.",
  },
  {
    q: "Why are my YAML comments missing from the JSON?",
    a: "JSON has no comments, so they cannot be kept. Anchors and aliases are expanded into full copies of the values.",
  },
  {
    q: "How do I find a syntax error?",
    a: "The error message shows the line and column where the parser stopped. The real mistake is often on that line or just before it, for example a wrong indent or a missing quote.",
  },
];

export function YamlJson() {
  const [direction, setDirection] = useState<Direction>("yaml-to-json");
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState<YamlIndent>(2);

  // Debounce input and direction together so a direction change never runs on stale text
  const job = useMemo(() => ({ input, direction }), [input, direction]);
  const pending = useDebouncedValue(job);
  const toJson = direction === "yaml-to-json";

  const result = useMemo<Result>(() => {
    if (!pending.input.trim()) return EMPTY;
    try {
      const converted =
        pending.direction === "yaml-to-json" ? yamlToJson(pending.input, indent) : jsonToYaml(pending.input, indent);
      return { ...converted, error: "" };
    } catch (error) {
      return { ...EMPTY, error: error instanceof Error ? error.message : "Could not convert the data." };
    }
  }, [pending, indent]);

  // A result for the previous direction or text is stale until the debounce catches up
  const current = pending.direction === direction && input.trim() ? result : EMPTY;

  const swap = () => {
    setInput(current.output);
    setDirection(toJson ? "json-to-yaml" : "yaml-to-json");
  };

  const changeDirection = (next: Direction) => {
    if (next === direction) return;
    // Use the last result as the next input.
    if (current.output) setInput(current.output);
    setDirection(next);
  };

  const inputName = toJson ? "YAML" : "JSON";
  const outputName = toJson ? "JSON" : "YAML";

  const status = () => {
    if (current.error) return <span className="text-destructive">Invalid input</span>;
    if (!current.output) return <span>Ready</span>;
    const lines = current.output.split("\n").length;
    return (
      <>
        <span>{lines} {lines === 1 ? "line" : "lines"}</span>
        {toJson && current.documents > 1 && <span>{current.documents} documents converted to a JSON array</span>}
      </>
    );
  };

  return (
    <ToolWorkspace
      id="yaml-json"
      toolbar={
        <>
          <Tabs value={direction} onValueChange={(v) => changeDirection(v as Direction)}>
            <TabsList aria-label="Direction">
              <TabsTrigger value="yaml-to-json">YAML to JSON</TabsTrigger>
              <TabsTrigger value="json-to-yaml">JSON to YAML</TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="indent-control">
            Indent
            <select aria-label="Indentation" value={indent} onChange={(e) => setIndent(Number(e.target.value) as YamlIndent)}>
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
            </select>
          </label>
          <button type="button" className="toolbar-text-button" onClick={swap} disabled={!current.output}>
            <ArrowLeftRight size={14} aria-hidden="true" />
            Swap
          </button>
        </>
      }
      notice={
        current.error ? (
          <div className="workspace-notice" data-tone="error" role="alert">{current.error}</div>
        ) : undefined
      }
      first={
        <EditorPane title={`${inputName} input`} htmlFor="yaml-json-input" scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}>
          <CodeTextarea
            id="yaml-json-input"
            placeholder={toJson ? "name: DevTools\ntags:\n  - offline\n  - desktop" : '{"name":"DevTools","tags":["offline","desktop"]}'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane title={`${outputName} output`} htmlFor={current.output ? "yaml-json-output" : undefined} scroll={false}
          actions={<CopyButton value={current.output} label={`Copy ${outputName}`} />}>
          {current.output ? (
            <CodeTextarea id="yaml-json-output" value={current.output} readOnly />
          ) : (
            <PaneEmpty title={`${outputName} appears here`} hint={`Type or paste ${inputName} on the left.`} />
          )}
        </EditorPane>
      }
      status={status()}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
