import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { generateMultipleUUIDs, type UUIDVersion } from "@/utils/uuid";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const VERSION_OPTIONS: Array<{ value: UUIDVersion; label: string }> = [
  { value: "4", label: "UUID v4 (Random)" },
  { value: "1", label: "UUID v1 (Time-based, simplified)" },
  { value: "7", label: "UUID v7 (Time-ordered, simplified)" },
  { value: "6", label: "UUID v6 (Time-ordered, simplified)" },
  { value: "3", label: "UUID v3 (Name-based, simplified)" },
  { value: "5", label: "UUID v5 (Name-based, simplified)" },
  { value: "ulid", label: "ULID (Sortable)" },
];

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which version should I pick most of the time?",
    a: "Use UUID v4 when you just need a random identifier and do not care about ordering. Use ULID or the time-ordered versions when you want values that sort more naturally by creation time.",
  },
  {
    q: "What is the difference between UUID and ULID?",
    a: "UUIDs are 36-character identifiers with hyphens, while ULIDs are 26-character Crockford Base32 strings. ULIDs are easier to sort lexicographically by time and are often more compact in logs or URLs.",
  },
  {
    q: "Are all UUID versions here strict RFC implementations?",
    a: "No. UUID v4 and ULID are straightforward local generators, but the v1, v3, v5, v6, and v7 options are lightweight local approximations. They are useful for demos and tooling, but not ideal when you need full standards-level interoperability.",
  },
  {
    q: "Why are v3 and v5 called name-based?",
    a: "Name-based UUIDs are normally derived from a namespace plus a name so the same inputs produce the same identifier. In this tool they are simplified local variants, so treat them as illustrative rather than canonical namespace UUIDs.",
  },
];

function getGenerateButtonLabel(version: UUIDVersion, count: number) {
  if (version === "ulid") {
    return count === 1 ? "Generate 1 ULID" : `Generate ${count} ULIDs`;
  }

  return count === 1 ? `Generate 1 UUID v${version}` : `Generate ${count} UUID v${version}s`;
}

export function UUIDGenerator() {
  const [version, setVersion] = useState<UUIDVersion>("4");
  const [count, setCount] = useState(5);
  const [output, setOutput] = useState("");

  const generateUUIDs = () => {
    try {
      const uuids = generateMultipleUUIDs(count, version);
      setOutput(uuids.join("\n"));
      toast.success(`Generated ${count} ${version.toUpperCase()}${count === 1 ? "" : "s"}!`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate identifiers");
    }
  };

  const copyToClipboard = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      toast.success("Copied to clipboard!");
    }
  };

  return (
    <div className="space-y-6">
      {/* Options */}
      {/* Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="uuid-version">Version</Label>
          <select
            id="uuid-version"
            value={version}
            onChange={(e) => setVersion(e.target.value as UUIDVersion)}
            className="w-full h-10 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {VERSION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs leading-relaxed text-muted-foreground">
            v1, v3, v5, v6, and v7 are lightweight local implementations in this tool. Prefer v4 or ULID when you want the clearest expectations.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="uuid-count">Count</Label>
          <Input
            id="uuid-count"
            type="number"
            min="1"
            max="1000"
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">Generate between 1 and 1000 identifiers at a time.</p>
        </div>
      </div>

      {/* Generate Button */}
      <Button onClick={generateUUIDs} className="w-full gap-2">
        <RefreshCw className="w-4 h-4" />
        {getGenerateButtonLabel(version, count)}
      </Button>

      {/* Output */}
      {output && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="uuid-output">Output</Label>
            <Button onClick={copyToClipboard} variant="ghost" size="sm">
              <Copy className="w-4 h-4 mr-2" />
              Copy All
            </Button>
          </div>
          <textarea
            id="uuid-output"
            value={output}
            readOnly
            className="w-full h-48 p-3 rounded-md border bg-muted font-mono text-sm resize-none focus:outline-none"
          />
        </div>
      )}

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
