import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { jsonToPhpArray, jsonToSerialized, phpArrayToJson, unserializeToJson, type PhpResult } from "@/utils/php";

type Format = "serialized" | "array";
type Direction = "to-json" | "from-json";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Can it fix serialized data that a search-and-replace broke?",
    a: "Yes. When a string length does not match its text, the tool finds the real end of the string and says how many lengths it repaired. Swap the result and serialize it again to get data with correct lengths.",
  },
  {
    q: "How are PHP objects and enums shown in JSON?",
    a: "An object gets a `__class` key with its class name. An enum becomes `{\"__enum\": \"Suit:Hearts\"}`. Private and protected properties keep PHP's `\\u0000` prefix, so the JSON serializes back to the same data.",
  },
  {
    q: "Which PHP array input can I paste?",
    a: "Short `[...]` and long `array(...)` syntax, a full config file with `<?php` and `return`, an assignment such as `$config = [...];`, and var_export() output. Comments are ignored. Constants, variables, and function calls are not evaluated.",
  },
  {
    q: "Why does the JSON keep keys in an unusual order?",
    a: "PHP arrays keep the order you insert keys in, even integer keys. The tool keeps that order, and it keeps 64-bit integers exact.",
  },
  {
    q: "Can I paste PHP session data?",
    a: "Yes. Session files in the default `name|value` format convert to a JSON object with one key per session variable.",
  },
];

const FORMAT_LABELS: Record<Format, string> = { serialized: "Serialized", array: "Array" };

const PLACEHOLDERS: Record<Format, Record<Direction, string>> = {
  serialized: {
    "to-json": 'Paste serialize() output (e.g., a:2:{s:4:"name";s:5:"Alice";s:4:"tags";a:1:{i:0;s:3:"php";}})',
    "from-json": 'Enter JSON (e.g., {"name": "Alice", "tags": ["php"]})',
  },
  array: {
    "to-json": "Paste a PHP array (e.g., ['name' => 'Alice', 'tags' => ['php']])",
    "from-json": 'Enter JSON (e.g., {"name": "Alice", "tags": ["php"]})',
  },
};

export function PhpTools() {
  const [format, setFormat] = useState<Format>("serialized");
  const [direction, setDirection] = useState<Direction>("to-json");
  const [input, setInput] = useState("");
  const [longSyntax, setLongSyntax] = useState(false);
  const text = useDebouncedValue(input);

  const result = useMemo<PhpResult>(() => {
    if (!text.trim()) return { ok: true, value: "" };
    if (format === "serialized") return direction === "to-json" ? unserializeToJson(text) : jsonToSerialized(text);
    return direction === "to-json" ? phpArrayToJson(text) : jsonToPhpArray(text, { longSyntax });
  }, [text, format, direction, longSyntax]);

  const output = "value" in result ? result.value : "";
  const error = "error" in result ? result.error : "";
  const notice = "notice" in result ? result.notice : undefined;
  const toJson = direction === "to-json";
  const sourceTitle = format === "serialized" ? "Serialized" : "PHP array";
  const inputTitle = toJson ? sourceTitle : "JSON";
  const outputTitle = toJson ? "JSON" : sourceTitle;

  // Move the result into the input and reverse the direction
  const swap = () => {
    setInput(output);
    setDirection(toJson ? "from-json" : "to-json");
  };

  return (
    <ToolWorkspace
      id="php-tools"
      toolbar={
        <>
          <Tabs value={format} onValueChange={(v) => setFormat(v as Format)}>
            <TabsList aria-label="Format">
              {(Object.keys(FORMAT_LABELS) as Format[]).map((f) => (
                <TabsTrigger key={f} value={f}>{FORMAT_LABELS[f]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Tabs value={direction} onValueChange={(v) => setDirection(v as Direction)} className="indent-control">
            <TabsList aria-label="Direction">
              <TabsTrigger value="to-json">To JSON</TabsTrigger>
              <TabsTrigger value="from-json">From JSON</TabsTrigger>
            </TabsList>
          </Tabs>
          {format === "array" && !toJson && (
            <label className="option-switch indent-control" htmlFor="php-long-syntax">
              Use array()
              <Switch id="php-long-syntax" checked={longSyntax} onCheckedChange={setLongSyntax} />
            </label>
          )}
          <button type="button" className="toolbar-text-button" onClick={swap} disabled={!output}>
            Swap
          </button>
        </>
      }
      notice={
        error ? (
          <div className="workspace-notice" data-tone="error" role="alert">{error}</div>
        ) : notice ? (
          <div className="workspace-notice" role="status">{notice}</div>
        ) : undefined
      }
      first={
        <EditorPane
          title={inputTitle}
          htmlFor="php-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea id="php-input" placeholder={PLACEHOLDERS[format][direction]} value={input} onChange={(e) => setInput(e.target.value)} />
        </EditorPane>
      }
      second={
        <EditorPane
          title={outputTitle}
          htmlFor={output ? "php-output" : undefined}
          scroll={false}
          actions={<CopyButton value={output} label="Copy" ariaLabel={`Copy ${outputTitle}`} />}
        >
          {output ? <CodeTextarea id="php-output" value={output} readOnly /> : <PaneEmpty title={`${outputTitle} appears here`} />}
        </EditorPane>
      }
      status={
        error ? (
          <span className="text-destructive">Invalid input</span>
        ) : output ? (
          <span>{text.length.toLocaleString()} → {output.length.toLocaleString()} characters</span>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
