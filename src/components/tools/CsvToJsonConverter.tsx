import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function CsvToJsonConverter() {
  const [csvInput, setCsvInput] = useState("");
  const [jsonOutput, setJsonOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState({
    hasHeader: true,
    pretty: true,
  });

  const convertToJson = () => {
    if (!csvInput.trim()) {
      toast.error("Please enter CSV data");
      return;
    }

    try {
      const lines = csvInput.trim().split("\n");
      if (lines.length < 1) {
        throw new Error("No data to convert");
      }

      const parseLine = (line: string) => {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === "," && !inQuotes) {
            result.push(current.trim());
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };

      const headers = parseLine(lines[0]);
      const dataStart = options.hasHeader ? 1 : 0;

      const result = lines.slice(dataStart).map((line) => {
        const values = parseLine(line);
        const obj: Record<string, string> = {};

        headers.forEach((header, index) => {
          const key = options.hasHeader ? header : `column${index + 1}`;
          obj[key] = values[index] || "";
        });

        return obj;
      });

      const json = options.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
      setJsonOutput(json);
      toast.success("CSV converted to JSON!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to convert CSV");
    }
  };

  const copyOutput = () => {
    navigator.clipboard.writeText(jsonOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("JSON copied!");
  };

  const clearAll = () => {
    setCsvInput("");
    setJsonOutput("");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>CSV to JSON Converter</CardTitle>
          <CardDescription>Convert CSV data to JSON format</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="has-header">First row is header</Label>
            <Switch
              id="has-header"
              checked={options.hasHeader}
              onCheckedChange={(checked) => setOptions({ ...options, hasHeader: checked })}
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

          <div className="space-y-2">
            <Label htmlFor="csv-input">CSV Input</Label>
            <Textarea
              id="csv-input"
              placeholder="name,age,city&#10;John,30,NYC&#10;Jane,25,LA"
              value={csvInput}
              onChange={(e) => setCsvInput(e.target.value)}
              className="min-h-[150px] font-mono"
            />
          </div>

          <Button onClick={convertToJson} className="w-full" size="lg">
            Convert to JSON
          </Button>

          {jsonOutput && (
            <>
              <div className="space-y-2">
                <Label htmlFor="json-output">JSON Output</Label>
                <Textarea
                  id="json-output"
                  value={jsonOutput}
                  readOnly
                  className="min-h-[200px] font-mono"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={copyOutput} variant="outline" className="flex-1">
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy JSON
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
