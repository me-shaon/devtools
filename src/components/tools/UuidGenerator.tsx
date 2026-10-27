import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import {
  UUID_NAMESPACES,
  generateMultipleUUIDs,
  inspectIdentifier,
  isValidUUID,
  type UUIDVersion,
} from "@/utils/uuid";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const VERSION_OPTIONS: Array<{ value: UUIDVersion; label: string }> = [
  { value: "4", label: "UUID v4 (Random)" },
  { value: "1", label: "UUID v1 (Time-based, simplified)" },
  { value: "7", label: "UUID v7 (Time-ordered, simplified)" },
  { value: "6", label: "UUID v6 (Time-ordered, simplified)" },
  { value: "3", label: "UUID v3 (Name-based, MD5)" },
  { value: "5", label: "UUID v5 (Name-based, SHA-1)" },
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
    a: "UUID v3, v5, v4, and ULID follow their specifications. The v1, v6, and v7 options are lightweight local approximations. They are useful for demos and tooling, but not ideal when you need full standards-level interoperability.",
  },
  {
    q: "Why are v3 and v5 called name-based?",
    a: "Name-based UUIDs are derived from a namespace plus a name, so the same inputs always produce the same identifier. v3 uses MD5 and v5 uses SHA-1, as in RFC 4122. Prefer v5 for new work.",
  },
];

type NamespaceKey = keyof typeof UUID_NAMESPACES | "custom";

const NAMESPACE_OPTIONS: Array<{ value: NamespaceKey; label: string }> = [
  { value: "DNS", label: "DNS" },
  { value: "URL", label: "URL" },
  { value: "OID", label: "OID" },
  { value: "X500", label: "X.500" },
  { value: "custom", label: "Custom UUID" },
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
  const [namespaceKey, setNamespaceKey] = useState<NamespaceKey>("DNS");
  const [customNamespace, setCustomNamespace] = useState("");
  const [name, setName] = useState("www.example.com");
  const [inspectInput, setInspectInput] = useState("");

  const isNameBased = version === "3" || version === "5";
  const namespace = namespaceKey === "custom" ? customNamespace.trim() : UUID_NAMESPACES[namespaceKey];
  const namespaceInvalid = isNameBased && !isValidUUID(namespace);
  const inspection = inspectInput.trim() ? inspectIdentifier(inspectInput) : null;

  const generateUUIDs = () => {
    try {
      if (namespaceInvalid) {
        toast.error("Namespace must be a valid UUID");
        return;
      }
      // Name-based UUIDs are deterministic, so repeating them adds nothing.
      const total = isNameBased ? 1 : count;
      const uuids = generateMultipleUUIDs(total, version, { namespace, name });
      setOutput(uuids.join("\n"));
      toast.success(`Generated ${total} ${version.toUpperCase()}${total === 1 ? "" : "s"}!`);
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
            v1, v6, and v7 are lightweight local implementations in this tool. Prefer v4 or ULID when you want the clearest expectations.
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

      {isNameBased && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="uuid-namespace">Namespace</Label>
            <select
              id="uuid-namespace"
              value={namespaceKey}
              onChange={(e) => setNamespaceKey(e.target.value as NamespaceKey)}
              className="w-full h-10 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {NAMESPACE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {namespaceKey === "custom" ? (
              <Input
                aria-label="Custom namespace UUID"
                value={customNamespace}
                onChange={(e) => setCustomNamespace(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="font-mono"
              />
            ) : (
              <p className="text-xs font-mono text-muted-foreground">{namespace}</p>
            )}
            {namespaceInvalid && <p className="text-xs text-destructive">Enter a valid UUID.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="uuid-name">Name</Label>
            <Input
              id="uuid-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">The same namespace and name always give the same UUID.</p>
          </div>
        </div>
      )}

      {/* Generate Button */}
      <Button onClick={generateUUIDs} className="gap-2">
        <RefreshCw className="w-4 h-4" />
        {getGenerateButtonLabel(version, isNameBased ? 1 : count)}
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

      {/* Inspect */}
      <div className="space-y-3 border-t pt-6">
        <h3 className="text-sm font-semibold">Inspect</h3>
        <div className="space-y-2">
          <Label htmlFor="uuid-inspect">UUID or ULID</Label>
          <Input
            id="uuid-inspect"
            value={inspectInput}
            onChange={(e) => setInspectInput(e.target.value)}
            placeholder="Paste a UUID or ULID"
            className="font-mono"
          />
        </div>
        {inspection && !inspection.valid && (
          <p className="text-sm text-destructive">{inspection.error}</p>
        )}
        {inspection?.valid && (
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 rounded-md border bg-muted p-3 text-sm">
            <dt className="text-muted-foreground">Type</dt>
            <dd>{inspection.kind === "ulid" ? "ULID" : "UUID"}</dd>
            {inspection.kind === "uuid" && (
              <>
                <dt className="text-muted-foreground">Version</dt>
                <dd>{inspection.version}</dd>
                <dt className="text-muted-foreground">Variant</dt>
                <dd>{inspection.variant}</dd>
              </>
            )}
            {inspection.date && (
              <>
                <dt className="text-muted-foreground">Timestamp</dt>
                <dd className="font-mono">{inspection.date.toISOString()}</dd>
              </>
            )}
          </dl>
        )}
        <p className="text-xs text-muted-foreground">
          Timestamps follow the standard layouts. IDs made by the v1 and v6 options here may show other dates.
        </p>
      </div>

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
