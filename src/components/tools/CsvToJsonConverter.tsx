import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { saveFile } from "@/lib/desktop";
import { csvToObjects, detectDelimiter, jsonToCsv, parseCSV, withBom } from "@/utils/csv";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "How are nested objects written to CSV?",
    a: "With Flatten nested objects on, each nested value gets its own column with a dot key, such as user.address.city. Array items use their index, such as tags.0 and tags.1. Every cell then holds one plain value that a spreadsheet can sort and filter. Turn the option off to write nested values as JSON text in one cell.",
  },
  {
    q: "How do I get nested JSON back from a flattened CSV?",
    a: "Turn on Nest dot keys. Columns such as user.name become nested objects, and columns such as tags.0 become arrays. Empty cells under an array index are dropped, so shorter arrays do not get blank items.",
  },
  {
    q: "What does Detect types convert?",
    a: "It converts numbers, true, false, null, and cells that hold a JSON array or object. Numbers with leading zeros, such as 007, stay as text. Integers too large for JavaScript to store exactly also stay as text.",
  },
  {
    q: "Why does Excel show broken characters in my CSV file?",
    a: "Excel reads a CSV file as a legacy encoding unless the file starts with a UTF-8 byte order mark (BOM). Turn on Add BOM for Excel before you save the file. The option changes only the saved file. Copied text never gets a BOM, because some tools read it as part of the first header.",
  },
];

type Direction = "csv-to-json" | "json-to-csv";

const DELIMITERS: Record<string, { label: string; value: string }> = {
  comma: { label: "Comma (,)", value: "," },
  semicolon: { label: "Semicolon (;)", value: ";" },
  tab: { label: "Tab", value: "\t" },
  pipe: { label: "Pipe (|)", value: "|" },
};

const delimiterName = (value: string) =>
  Object.entries(DELIMITERS).find(([, d]) => d.value === value)?.[0] ?? "comma";

interface Result {
  output: string;
  error: string;
  rows: number;
  columns: number;
}

const EMPTY: Result = { output: "", error: "", rows: 0, columns: 0 };


export function CsvToJsonConverter() {
  const [direction, setDirection] = useState<Direction>("csv-to-json");
  const [input, setInput] = useState("");
  const [delimiterChoice, setDelimiterChoice] = useState("auto");
  const [options, setOptions] = useState({
    hasHeader: true,
    pretty: true,
    typed: false,
    nest: false,
    flatten: true,
    bom: false,
  });

  // Debounce input and direction together so a direction change never runs on stale text
  const job = useMemo(() => ({ input, direction }), [input, direction]);
  const pending = useDebouncedValue(job);
  const toJson = direction === "csv-to-json";
  const detected = delimiterName(detectDelimiter(pending.input));

  const result = useMemo<Result>(() => {
    const text = pending.input;
    if (!text.trim()) return EMPTY;
    const parsesCsv = pending.direction === "csv-to-json";
    const delimiter =
      delimiterChoice === "auto" ? (parsesCsv ? detectDelimiter(text) : ",") : DELIMITERS[delimiterChoice].value;
    try {
      if (parsesCsv) {
        const rows = csvToObjects(text, {
          delimiter,
          hasHeader: options.hasHeader,
          typed: options.typed,
          nest: options.nest,
        });
        return {
          output: options.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows),
          error: "",
          rows: rows.length,
          columns: Object.keys(rows[0] ?? {}).length,
        };
      }
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : "check the syntax."}`);
      }
      const csv = jsonToCsv(data, { delimiter, hasHeader: options.hasHeader, flatten: options.flatten });
      const table = parseCSV(csv, { delimiter });
      return {
        output: csv,
        error: "",
        rows: Math.max(0, table.length - (options.hasHeader ? 1 : 0)),
        columns: table[0]?.length ?? 0,
      };
    } catch (error) {
      return { ...EMPTY, error: error instanceof Error ? error.message : "Could not convert the data." };
    }
  }, [pending, delimiterChoice, options]);

  // A result for the previous direction is stale until the debounce catches up
  const current = pending.direction === direction ? result : EMPTY;

  const changeDirection = (next: Direction) => {
    if (next === direction) return;
    // Use the last result as the next input.
    if (current.output) setInput(current.output);
    setDirection(next);
  };

  const inputName = toJson ? "CSV" : "JSON";
  const outputName = toJson ? "JSON" : "CSV";

  const saveOutput = async () => {
    const fileName = toJson ? "data.json" : "data.csv";
    const text = !toJson && options.bom ? withBom(current.output) : current.output;
    const type = toJson ? "application/json" : "text/csv;charset=utf-8";
    try {
      if (await saveFile(new Blob([text], { type }), fileName)) toast.success(`Saved ${fileName}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the file.");
    }
  };

  return (
    <ToolWorkspace
      id="csv-json"
      toolbar={
        <>
          <Tabs value={direction} onValueChange={(v) => changeDirection(v as Direction)}>
            <TabsList aria-label="Direction">
              <TabsTrigger value="csv-to-json">CSV to JSON</TabsTrigger>
              <TabsTrigger value="json-to-csv">JSON to CSV</TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="indent-control">
            Delimiter
            <select aria-label="Delimiter" value={delimiterChoice} onChange={(e) => setDelimiterChoice(e.target.value)}>
              <option value="auto">{toJson ? `Auto (${DELIMITERS[detected].label})` : "Auto (comma)"}</option>
              {Object.entries(DELIMITERS).map(([key, d]) => (
                <option key={key} value={key}>{d.label}</option>
              ))}
            </select>
          </label>
        </>
      }
      notice={
        current.error ? (
          <div className="workspace-notice" data-tone="error" role="alert">{current.error}</div>
        ) : undefined
      }
      first={
        <EditorPane title={`${inputName} input`} htmlFor="csv-input" scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}>
          <div className="pane-options">
            <label className="option-switch" htmlFor="csv-has-header">
              {toJson ? "First row is header" : "Write header row"}
              <Switch id="csv-has-header" checked={options.hasHeader} onCheckedChange={(checked) => setOptions({ ...options, hasHeader: checked })} />
            </label>
            {!toJson && (
              <>
                <label className="option-switch" htmlFor="csv-flatten">
                  Flatten nested objects
                  <Switch id="csv-flatten" checked={options.flatten} onCheckedChange={(checked) => setOptions({ ...options, flatten: checked })} />
                </label>
                <label className="option-switch" htmlFor="csv-bom">
                  Add BOM for Excel
                  <Switch id="csv-bom" checked={options.bom} onCheckedChange={(checked) => setOptions({ ...options, bom: checked })} />
                </label>
              </>
            )}
            {toJson && (
              <>
                <label className="option-switch" htmlFor="csv-typed">
                  Detect types
                  <Switch id="csv-typed" checked={options.typed} onCheckedChange={(checked) => setOptions({ ...options, typed: checked })} />
                </label>
                <label className="option-switch" htmlFor="csv-nest">
                  Nest dot keys
                  <Switch id="csv-nest" checked={options.nest} onCheckedChange={(checked) => setOptions({ ...options, nest: checked })} />
                </label>
                <label className="option-switch" htmlFor="csv-pretty">
                  Pretty print
                  <Switch id="csv-pretty" checked={options.pretty} onCheckedChange={(checked) => setOptions({ ...options, pretty: checked })} />
                </label>
              </>
            )}
          </div>
          <CodeTextarea
            id="csv-input"
            placeholder={toJson ? "name,age,city\nJohn,30,NYC\nJane,25,LA" : '[{"name":"John","age":30},{"name":"Jane","age":25}]'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane title={`${outputName} output`} htmlFor={current.output ? "csv-output" : undefined} scroll={false}
          actions={
            <>
              {current.output && (
                <button type="button" className="toolbar-text-button" onClick={() => void saveOutput()}>
                  Save {outputName}
                </button>
              )}
              <CopyButton value={current.output} label={`Copy ${outputName}`} />
            </>
          }>
          {current.output ? (
            <CodeTextarea id="csv-output" value={current.output} readOnly />
          ) : (
            <PaneEmpty title={`${outputName} appears here`} hint={`Type or paste ${inputName} on the left.`} />
          )}
        </EditorPane>
      }
      status={
        current.error ? (
          <span className="text-destructive">Invalid input</span>
        ) : current.output ? (
          <span>{current.rows} {current.rows === 1 ? "row" : "rows"} · {current.columns} {current.columns === 1 ? "column" : "columns"}</span>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
