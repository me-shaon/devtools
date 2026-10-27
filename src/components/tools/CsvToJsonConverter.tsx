import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { csvToObjects, detectDelimiter, jsonToCsv, parseCSV } from "@/utils/csv";

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
  const [options, setOptions] = useState({ hasHeader: true, pretty: true, typed: false });

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
        const rows = csvToObjects(text, { delimiter, hasHeader: options.hasHeader, typed: options.typed });
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
      const csv = jsonToCsv(data, { delimiter, hasHeader: options.hasHeader });
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
            {toJson && (
              <>
                <label className="option-switch" htmlFor="csv-typed">
                  Convert numbers
                  <Switch id="csv-typed" checked={options.typed} onCheckedChange={(checked) => setOptions({ ...options, typed: checked })} />
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
          actions={<CopyButton value={current.output} label={`Copy ${outputName}`} />}>
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
    />
  );
}
