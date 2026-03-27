import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BookOpen, Copy, Eraser, Play } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import {
  phpUnserialize,
  formatPrintR,
  formatVarDump,
} from "@/utils/php-unserialize";

type OutputFormat = "print_r" | "var_dump";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What is PHP serialize?",
    a: "PHP serialize() converts a PHP value (array, object, string, etc.) into a storable string representation. It is commonly used to store complex data in databases or session files.",
  },
  {
    q: "What data types are supported?",
    a: "This tool supports strings, integers, floats, booleans, null, indexed arrays, associative arrays, and objects — all the types produced by PHP's serialize() function.",
  },
  {
    q: "What is the difference between print_r and var_dump?",
    a: "print_r() displays human-readable information about a value without type details. var_dump() includes type and length information for each value, making it more useful for debugging.",
  },
  {
    q: "Is this tool safe for untrusted data?",
    a: "Yes. This tool only parses the serialized string format in JavaScript — it does not execute any PHP code. No data is sent to a server.",
  },
];

const EXAMPLE_INPUT =
  'a:2:{i:0;s:12:"Sample array";i:1;a:2:{i:0;s:5:"Apple";i:1;s:6:"Orange";}}';

export function PhpUnserializer() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [format, setFormat] = useState<OutputFormat>("print_r");

  const unserialize = () => {
    if (!input.trim()) {
      toast.error("Please enter a serialized PHP string.");
      return;
    }

    try {
      const parsed = phpUnserialize(input);
      const formatted =
        format === "print_r" ? formatPrintR(parsed) : formatVarDump(parsed);
      setOutput(formatted);
      toast.success("Unserialized successfully!");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Invalid serialized string";
      toast.error(message);
      setOutput("");
    }
  };

  const copyToClipboard = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    toast.success("Copied to clipboard!");
  };

  const clear = () => {
    setInput("");
    setOutput("");
  };

  const loadExample = () => {
    setInput(EXAMPLE_INPUT);
    setOutput("");
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">
            Serialized PHP String
          </label>
          <Button onClick={loadExample} variant="ghost" size="sm" className="gap-2">
            <BookOpen className="w-4 h-4" />
            Load Example
          </Button>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='e.g. a:2:{i:0;s:5:"Apple";i:1;s:6:"Orange";}'
          className="w-full h-32 p-3 rounded-md border bg-background text-foreground font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border">
            <Button
              onClick={() => setFormat("print_r")}
              variant={format === "print_r" ? "default" : "ghost"}
              size="sm"
              className="rounded-r-none border-r"
            >
              print_r()
            </Button>
            <Button
              onClick={() => setFormat("var_dump")}
              variant={format === "var_dump" ? "default" : "ghost"}
              size="sm"
              className="rounded-l-none"
            >
              var_dump()
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={clear} variant="outline" size="sm" className="gap-2">
            <Eraser className="w-4 h-4" />
            Clear
          </Button>
          <Button onClick={unserialize} size="sm" className="gap-2">
            <Play className="w-4 h-4" />
            Unserialize
          </Button>
        </div>
      </div>

      {output && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium">
              Output ({format === "print_r" ? "print_r" : "var_dump"})
            </label>
            <Button onClick={copyToClipboard} variant="ghost" size="sm">
              <Copy className="w-4 h-4 mr-2" />
              Copy
            </Button>
          </div>
          <pre className="w-full p-3 rounded-md border bg-muted text-foreground font-mono text-sm overflow-auto whitespace-pre max-h-96">
            {output}
          </pre>
        </div>
      )}

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
