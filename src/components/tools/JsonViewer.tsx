import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileJson, CheckCircle, XCircle, Info } from "lucide-react";
import { toast } from "sonner";

interface JSONInfo {
  type: string;
  size: number;
  keys: number;
  depth: number;
}

export function JsonViewer() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [jsonInfo, setJsonInfo] = useState<JSONInfo | null>(null);

  const formatJSON = () => {
    if (!input.trim()) {
      toast.error("Please enter JSON data to format.");
      return;
    }

    try {
      const parsed = JSON.parse(input);
      const formatted = JSON.stringify(parsed, null, 2);
      setOutput(formatted);
      setError("");
      setJsonInfo(null);
      toast.success("JSON formatted successfully!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid JSON";
      setError(`Invalid JSON: ${message}`);
      setOutput("");
      setJsonInfo(null);
    }
  };

  const minifyJSON = () => {
    if (!input.trim()) {
      toast.error("Please enter JSON data to minify.");
      return;
    }

    try {
      const parsed = JSON.parse(input);
      const minified = JSON.stringify(parsed);
      setOutput(minified);
      setError("");
      setJsonInfo(null);
      toast.success("JSON minified successfully!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid JSON";
      setError(`Invalid JSON: ${message}`);
      setOutput("");
      setJsonInfo(null);
    }
  };

  const validateJSON = () => {
    if (!input.trim()) {
      toast.error("Please enter JSON data to validate.");
      return;
    }

    try {
      const parsed = JSON.parse(input);
      const info = getJSONInfo(parsed);
      setJsonInfo(info);
      setOutput("");
      setError("");
      toast.success("JSON is valid!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid JSON";
      setError(`Invalid JSON: ${message}`);
      setOutput("");
      setJsonInfo(null);
    }
  };

  const getJSONInfo = (obj: unknown): JSONInfo => {
    const type = Array.isArray(obj) ? "Array" : typeof obj;
    const size = JSON.stringify(obj).length;
    const keys = countKeys(obj);
    const depth = getMaxDepth(obj);
    return { type, size, keys, depth };
  };

  const countKeys = (obj: unknown): number => {
    if (typeof obj !== "object" || obj === null) return 0;
    if (Array.isArray(obj)) return obj.length;

    let count = 0;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        count++;
        if (typeof obj[key as keyof typeof obj] === "object" && obj[key as keyof typeof obj] !== null) {
          count += countKeys(obj[key as keyof typeof obj]);
        }
      }
    }
    return count;
  };

  const getMaxDepth = (obj: unknown, depth = 0): number => {
    if (typeof obj !== "object" || obj === null) return depth;

    let maxDepth = depth;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        maxDepth = Math.max(maxDepth, getMaxDepth(obj[key as keyof typeof obj], depth + 1));
      }
    }
    return maxDepth;
  };

  const copyOutput = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      toast.success("Copied to clipboard!");
    }
  };

  return (
    <div className="space-y-4">
      {/* Input */}
      <div>
        <label className="block text-sm font-medium mb-2">JSON Input</label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste your JSON here..."
          className="w-full h-48 p-3 rounded-md border bg-background text-foreground font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={formatJSON} className="bg-primary hover:bg-primary/90">
          <FileJson className="w-4 h-4 mr-2" />
          Format
        </Button>
        <Button onClick={minifyJSON} variant="outline">
          Minify
        </Button>
        <Button onClick={validateJSON} variant="outline">
          Validate
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-md bg-destructive/10 border border-destructive/20">
          <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive">Invalid JSON</p>
            <p className="text-sm text-destructive/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* JSON Info */}
      {jsonInfo && (
        <div className="flex items-start gap-3 p-4 rounded-md bg-green-500/10 border border-green-500/20">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-green-500">Valid JSON</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <div>
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="font-medium">{jsonInfo.type}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Size</p>
                <p className="font-medium">{jsonInfo.size.toLocaleString()} chars</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Keys/Items</p>
                <p className="font-medium">{jsonInfo.keys.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Depth</p>
                <p className="font-medium">{jsonInfo.depth}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Output */}
      {output && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium">Output</label>
            <Button onClick={copyOutput} variant="ghost" size="sm">
              Copy
            </Button>
          </div>
          <div className="relative">
            <pre className="w-full h-64 p-4 rounded-md border bg-muted overflow-auto text-sm">
              <code>{output}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
