import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Check, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { csvToObjects, detectDelimiter, jsonToCsv } from "@/utils/csv";

type Direction = "csv-to-json" | "json-to-csv";

const DELIMITERS: Record<string, { label: string; value: string }> = {
  comma: { label: "Comma (,)", value: "," },
  semicolon: { label: "Semicolon (;)", value: ";" },
  tab: { label: "Tab", value: "\t" },
  pipe: { label: "Pipe (|)", value: "|" },
};

const delimiterName = (value: string) =>
  Object.entries(DELIMITERS).find(([, d]) => d.value === value)?.[0] ?? "comma";

export function CsvToJsonConverter() {
  const [direction, setDirection] = useState<Direction>("csv-to-json");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [delimiterChoice, setDelimiterChoice] = useState("auto");
  const [options, setOptions] = useState({ hasHeader: true, pretty: true, typed: false });

  const toJson = direction === "csv-to-json";
  const detected = delimiterName(detectDelimiter(input));
  const delimiterOf = () =>
    delimiterChoice === "auto"
      ? toJson ? detectDelimiter(input) : ","
      : DELIMITERS[delimiterChoice].value;

  const changeDirection = (next: Direction) => {
    if (next === direction) return;
    // Use the last result as the next input.
    setInput(output);
    setOutput("");
    setDirection(next);
  };

  const convert = () => {
    if (!input.trim()) {
      toast.error(toJson ? "Enter CSV data." : "Enter JSON data.");
      return;
    }
    try {
      const delimiter = delimiterOf();
      if (toJson) {
        const rows = csvToObjects(input, { delimiter, hasHeader: options.hasHeader, typed: options.typed });
        setOutput(options.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
        toast.success("Converted to JSON.");
      } else {
        let data: unknown;
        try {
          data = JSON.parse(input);
        } catch (error) {
          throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : "check the syntax."}`);
        }
        setOutput(jsonToCsv(data, { delimiter, hasHeader: options.hasHeader }));
        toast.success("Converted to CSV.");
      }
    } catch (error) {
      setOutput("");
      toast.error(error instanceof Error ? error.message : "Could not convert the data.");
    }
  };

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(toJson ? "JSON copied." : "CSV copied.");
    } catch {
      toast.error("Could not copy. Select the output and copy it manually.");
    }
  };

  const clearAll = () => {
    setInput("");
    setOutput("");
  };

  const inputName = toJson ? "CSV" : "JSON";
  const outputName = toJson ? "JSON" : "CSV";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>CSV and JSON Converter</CardTitle>
          <CardDescription>Convert in either direction. Your data stays on this device.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2" role="group" aria-label="Direction">
            <Button type="button" className="flex-1" variant={toJson ? "default" : "outline"} aria-pressed={toJson} onClick={() => changeDirection("csv-to-json")}>
              CSV to JSON
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Swap direction" onClick={() => changeDirection(toJson ? "json-to-csv" : "csv-to-json")}>
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
            <Button type="button" className="flex-1" variant={toJson ? "outline" : "default"} aria-pressed={!toJson} onClick={() => changeDirection("json-to-csv")}>
              JSON to CSV
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label id="delimiter-label">Delimiter</Label>
            <div className="w-56">
              <Select value={delimiterChoice} onValueChange={setDelimiterChoice}>
                <SelectTrigger aria-labelledby="delimiter-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    {toJson ? `Auto-detect (${DELIMITERS[detected].label})` : "Auto (comma)"}
                  </SelectItem>
                  {Object.entries(DELIMITERS).map(([key, d]) => (
                    <SelectItem key={key} value={key}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="has-header">{toJson ? "First row is header" : "Write header row"}</Label>
            <Switch
              id="has-header"
              checked={options.hasHeader}
              onCheckedChange={(checked) => setOptions({ ...options, hasHeader: checked })}
            />
          </div>

          {toJson && (
            <>
              <div className="flex items-center justify-between">
                <Label htmlFor="typed">Convert numbers</Label>
                <Switch
                  id="typed"
                  checked={options.typed}
                  onCheckedChange={(checked) => setOptions({ ...options, typed: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="pretty">Pretty print JSON</Label>
                <Switch
                  id="pretty"
                  checked={options.pretty}
                  onCheckedChange={(checked) => setOptions({ ...options, pretty: checked })}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="csv-input">{inputName} Input</Label>
            <Textarea
              id="csv-input"
              placeholder={toJson ? "name,age,city\nJohn,30,NYC\nJane,25,LA" : '[{"name":"John","age":30},{"name":"Jane","age":25}]'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-[150px] font-mono"
            />
          </div>

          <Button onClick={convert} className="w-full" size="lg">
            Convert to {outputName}
          </Button>

          {output && (
            <>
              <div className="space-y-2">
                <Label htmlFor="json-output">{outputName} Output</Label>
                <Textarea id="json-output" value={output} readOnly className="min-h-[200px] font-mono" />
              </div>
              <div className="flex gap-2">
                <Button onClick={copyOutput} variant="outline" className="flex-1">
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy {outputName}
                    </>
                  )}
                </Button>
                <Button onClick={clearAll} variant="outline">
                  Clear
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
