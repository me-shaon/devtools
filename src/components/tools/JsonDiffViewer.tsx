import { useMemo, useState, useTransition } from "react";
import { ArrowLeftRight, Check, Copy, Eraser, GitCompare, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { diffJsonValues, formatDiffValue, MAX_DIFF_ENTRIES, type JsonDiffEntry, } from "@/utils/json-diff";

const SAMPLE_ORIGINAL = JSON.stringify(
  {
    name: "DevTools Desktop",
    version: "1.3.0",
    features: ["json-viewer", "jwt-decoder", "text-compare"],
    settings: {
      theme: "dark",
      autoUpdate: true,
      shortcuts: {
        commandPalette: "Ctrl+K",
        sidebarToggle: "Ctrl+B",
      },
    },
  },
  null,
  2,
);

const SAMPLE_MODIFIED = JSON.stringify(
  {
    name: "DevTools Desktop",
    version: "1.4.0",
    features: ["json-viewer", "jwt-decoder", "text-compare", "json-diff-viewer"],
    settings: {
      theme: "system",
      autoUpdate: false,
      shortcuts: {
        commandPalette: "Ctrl+Shift+P",
      },
    },
    metadata: {
      releaseDate: "2026-03-30",
    },
  },
  null,
  2,
);

const ENTRY_CLASSES: Record<JsonDiffEntry["type"], string> = {
  added: "border-green-500/30 bg-green-500/10",
  removed: "border-red-500/30 bg-red-500/10",
  changed: "border-yellow-500/30 bg-yellow-500/10",
  unchanged: "border-border bg-muted/40",
};

const BADGE_CLASSES: Record<JsonDiffEntry["type"], string> = {
  added: "bg-green-500 text-white",
  removed: "bg-red-500 text-white",
  changed: "bg-yellow-500 text-black",
  unchanged: "border border-border bg-background text-foreground",
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid JSON";
}

export function JsonDiffViewer() {
  const [originalInput, setOriginalInput] = useState("");
  const [modifiedInput, setModifiedInput] = useState("");
  const [originalError, setOriginalError] = useState("");
  const [modifiedError, setModifiedError] = useState("");
  const [entries, setEntries] = useState<JsonDiffEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(true);
  const [hasCompared, setHasCompared] = useState(false);
  const [copiedField, setCopiedField] = useState<"original" | "modified" | null>(null);
  const [isComparing, startTransition] = useTransition();

  const filteredEntries = useMemo(() => {
    if (!showOnlyDifferences) {
      return entries;
    }

    return entries.filter((entry) => entry.type !== "unchanged");
  }, [entries, showOnlyDifferences]);

  const counts = useMemo(() => {
    return entries.reduce(
      (accumulator, entry) => {
        accumulator[entry.type] += 1;
        return accumulator;
      },
      { added: 0, removed: 0, changed: 0, unchanged: 0 },
    );
  }, [entries]);

  const compareJson = () => {
    setOriginalError("");
    setModifiedError("");

    if (!originalInput.trim() && !modifiedInput.trim()) {
      toast.error("Enter JSON in at least one panel.");
      return;
    }

    let parsedOriginal: unknown = null;
    let parsedModified: unknown = null;
    let validationFailed = false;

    try {
      if (originalInput.trim()) {
        parsedOriginal = JSON.parse(originalInput);
        setOriginalInput(JSON.stringify(parsedOriginal, null, 2));
      }
    } catch (error) {
      setOriginalError(`Invalid JSON: ${getErrorMessage(error)}`);
      validationFailed = true;
    }

    try {
      if (modifiedInput.trim()) {
        parsedModified = JSON.parse(modifiedInput);
        setModifiedInput(JSON.stringify(parsedModified, null, 2));
      }
    } catch (error) {
      setModifiedError(`Invalid JSON: ${getErrorMessage(error)}`);
      validationFailed = true;
    }

    if (validationFailed) {
      setEntries([]);
      setTruncated(false);
      setHasCompared(false);
      return;
    }

    startTransition(() => {
      setTimeout(() => {
        const result = diffJsonValues(parsedOriginal, parsedModified, {
          includeUnchanged: true,
          maxEntries: MAX_DIFF_ENTRIES,
        });

        setEntries(result.entries);
        setTruncated(result.truncated);
        setHasCompared(true);
        toast.success("Comparison complete.");
      }, 0);
    });
  };

  const copyText = async (value: string, field: "original" | "modified") => {
    if (!value.trim()) {
      toast.error("Nothing to copy.");
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1200);
    toast.success("Copied to clipboard.");
  };

  const loadSample = () => {
    setOriginalInput(SAMPLE_ORIGINAL);
    setModifiedInput(SAMPLE_MODIFIED);
    setOriginalError("");
    setModifiedError("");
    setEntries([]);
    setHasCompared(false);
    setTruncated(false);
  };

  const swapJson = () => {
    setOriginalInput(modifiedInput);
    setModifiedInput(originalInput);
    setOriginalError(modifiedError);
    setModifiedError(originalError);
    setEntries([]);
    setHasCompared(false);
    setTruncated(false);
  };

  const clearAll = () => {
    setOriginalInput("");
    setModifiedInput("");
    setOriginalError("");
    setModifiedError("");
    setEntries([]);
    setTruncated(false);
    setHasCompared(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={compareJson} className="gap-2" disabled={isComparing}>
          <GitCompare className="h-4 w-4" />
          {isComparing ? "Comparing..." : "Compare"}
        </Button>
        <Button variant="outline" onClick={loadSample} className="gap-2">
          <Sparkles className="h-4 w-4" />
          Sample JSON
        </Button>
        <Button variant="outline" onClick={swapJson} className="gap-2">
          <ArrowLeftRight className="h-4 w-4" />
          Swap JSON
        </Button>
        <Button variant="outline" onClick={clearAll} className="gap-2">
          <Eraser className="h-4 w-4" />
          Clear
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Original JSON</CardTitle>
                <CardDescription>Source JSON object</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyText(originalInput, "original")}
                className="gap-2"
              >
                {copiedField === "original" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedField === "original" ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={originalInput}
              onChange={(event) => setOriginalInput(event.target.value)}
              placeholder='{"name": "example"}'
              className="min-h-[280px] font-mono"
            />
            {originalError && (
              <p className="text-sm text-destructive" role="alert">
                {originalError}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Modified JSON</CardTitle>
                <CardDescription>Updated JSON object</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyText(modifiedInput, "modified")}
                className="gap-2"
              >
                {copiedField === "modified" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedField === "modified" ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={modifiedInput}
              onChange={(event) => setModifiedInput(event.target.value)}
              placeholder='{"name": "example", "enabled": true}'
              className="min-h-[280px] font-mono"
            />
            {modifiedError && (
              <p className="text-sm text-destructive" role="alert">
                {modifiedError}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {hasCompared && (
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Diff Results</CardTitle>
                <CardDescription>Human-readable JSON comparison by path</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="show-only-differences">Show only differences</Label>
                <Switch
                  id="show-only-differences"
                  checked={showOnlyDifferences}
                  onCheckedChange={setShowOnlyDifferences}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded border border-green-500/30 bg-green-500/10 p-2 text-center text-sm">
                <p className="text-lg font-semibold text-green-600 dark:text-green-400">{counts.added}</p>
                <p className="text-muted-foreground">Added</p>
              </div>
              <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-center text-sm">
                <p className="text-lg font-semibold text-red-600 dark:text-red-400">{counts.removed}</p>
                <p className="text-muted-foreground">Removed</p>
              </div>
              <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-center text-sm">
                <p className="text-lg font-semibold text-yellow-600 dark:text-yellow-400">{counts.changed}</p>
                <p className="text-muted-foreground">Changed</p>
              </div>
              <div className="rounded border bg-muted p-2 text-center text-sm">
                <p className="text-lg font-semibold">{counts.unchanged}</p>
                <p className="text-muted-foreground">Unchanged</p>
              </div>
            </div>

            {truncated && (
              <p className="text-sm text-muted-foreground">
                Result limit reached. Showing the first {MAX_DIFF_ENTRIES.toLocaleString()} entries.
              </p>
            )}
          </CardHeader>

          <CardContent>
            {filteredEntries.length === 0 ? (
              <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                No entries to display for the current filter.
              </div>
            ) : (
              <div className="max-h-[560px] space-y-3 overflow-auto pr-1">
                {filteredEntries.map((entry) => (
                  <div key={`${entry.path}:${entry.type}`} className={`rounded-md border p-3 ${ENTRY_CLASSES[entry.type]}`}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[entry.type]}`}>
                        {entry.type.toUpperCase()}
                      </span>
                      <code className="rounded bg-background/70 px-2 py-0.5 text-xs">{entry.path}</code>
                    </div>

                    {entry.type === "added" && (
                      <pre className="overflow-x-auto rounded bg-background/70 p-2 text-xs">
                        <code>{formatDiffValue(entry.modified)}</code>
                      </pre>
                    )}

                    {entry.type === "removed" && (
                      <pre className="overflow-x-auto rounded bg-background/70 p-2 text-xs">
                        <code>{formatDiffValue(entry.original)}</code>
                      </pre>
                    )}

                    {entry.type === "changed" && (
                      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">Original</p>
                          <pre className="overflow-x-auto rounded bg-background/70 p-2 text-xs">
                            <code>{formatDiffValue(entry.original)}</code>
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">Modified</p>
                          <pre className="overflow-x-auto rounded bg-background/70 p-2 text-xs">
                            <code>{formatDiffValue(entry.modified)}</code>
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
