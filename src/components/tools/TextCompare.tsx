import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import {
  areTextsEqual,
  calculateSimilarity,
  compareTexts,
  getCharDiff,
  getLineDiff,
  getTextStats,
  getUnifiedDiff,
  type DiffResult,
  type LineDiff,
  type TextComparison,
} from "@/utils/text-compare";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What is the difference between line diff, unified diff, and character diff?",
    a: "Line diff is the easiest way to scan changed lines, unified diff is patch-style output similar to Git, and character diff zooms in on what changed within a specific line. They show the same comparison at different levels of detail.",
  },
  {
    q: "Why can a file show high similarity even when lines changed?",
    a: "Similarity is based on how many lines still match in the same positions. A few edits in a short file can drop the percentage quickly, while a few edits in a long file may still leave the texts mostly similar.",
  },
  {
    q: "Why does a modified line appear as a removal and an addition in unified diff?",
    a: "Patch-style diffs usually represent a changed line as the old line being removed and the new line being added. That format is easier to apply and review in version-control workflows.",
  },
  {
    q: "When should I use unified diff instead of line diff?",
    a: "Use line diff when you want a friendlier visual summary, and unified diff when you want output that feels closer to Git patches or code review tools. Unified diff is usually better for copying into discussions or documentation.",
  },
];

interface CharacterDiffDetail {
  label: string;
  items: DiffResult[];
}

interface ComparisonResult {
  comparison: TextComparison;
  lineDiffs: LineDiff[];
  similarity: number;
  unifiedDiff: string[];
  characterDetails: CharacterDiffDetail[];
  equal: boolean;
  originalStats: ReturnType<typeof getTextStats>;
  modifiedStats: ReturnType<typeof getTextStats>;
}

function getCharacterDetails(lineDiffs: LineDiff[]): CharacterDiffDetail[] {
  const details = lineDiffs
    .filter((diff) => diff.type !== "unchanged")
    .map((diff) => {
      if (diff.type === "modified") {
        return {
          label: `Character detail for line ${diff.lineNumber + 1}`,
          items: getCharDiff(diff.oldContent ?? "", diff.content),
        };
      }

      if (diff.type === "added") {
        return {
          label: `Character detail for added line ${diff.lineNumber + 1}`,
          items: getCharDiff("", diff.content),
        };
      }

      return {
        label: `Character detail for removed line ${diff.lineNumber + 1}`,
        items: getCharDiff(diff.content, ""),
      };
    });

  return details;
}

export function TextCompare() {
  const [text1, setText1] = useState("");
  const [text2, setText2] = useState("");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [copied, setCopied] = useState(false);

  const compareTextBlocks = () => {
    if (!text1.trim() && !text2.trim()) {
      toast.error("Please enter text to compare");
      return;
    }

    const comparison = compareTexts(text1, text2);
    const lineDiffs = getLineDiff(text1, text2);

    setResult({
      comparison,
      lineDiffs,
      similarity: calculateSimilarity(text1, text2),
      unifiedDiff: getUnifiedDiff(text1, text2),
      characterDetails: getCharacterDetails(lineDiffs),
      equal: areTextsEqual(text1, text2),
      originalStats: getTextStats(text1),
      modifiedStats: getTextStats(text2),
    });
    toast.success("Comparison complete!");
  };

  const copyStats = () => {
    if (!result) {
      return;
    }

    const modifiedCount = result.lineDiffs.filter((diff) => diff.type === "modified").length;
    const stats = {
      similarity: result.similarity,
      equal: result.equal,
      added: result.comparison.addedLines,
      removed: result.comparison.removedLines,
      modified: modifiedCount,
      unchanged: result.comparison.unchangedLines,
      original: result.originalStats,
      modifiedText: result.modifiedStats,
    };

    navigator.clipboard.writeText(JSON.stringify(stats, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Statistics copied!");
  };

  const getLineColor = (type: LineDiff["type"]) => {
    switch (type) {
      case "added":
        return "border-green-500/30 bg-green-500/10";
      case "removed":
        return "border-red-500/30 bg-red-500/10";
      case "modified":
        return "border-yellow-500/30 bg-yellow-500/10";
      default:
        return "border-border bg-muted/40";
    }
  };

  const getLineBadge = (type: LineDiff["type"]) => {
    switch (type) {
      case "added":
        return <Badge className="bg-green-500">Added</Badge>;
      case "removed":
        return <Badge className="bg-red-500">Removed</Badge>;
      case "modified":
        return <Badge className="bg-yellow-500 text-black">Modified</Badge>;
      default:
        return <Badge variant="outline">Unchanged</Badge>;
    }
  };

  const getCharClassName = (type: DiffResult["type"]) => {
    switch (type) {
      case "added":
        return "bg-green-500/20 text-green-700 dark:text-green-300";
      case "removed":
        return "bg-red-500/20 text-red-700 line-through dark:text-red-300";
      default:
        return "text-foreground";
    }
  };

  const getUnifiedDiffLineClass = (line: string) => {
    if (line.startsWith("@@")) {
      return "bg-sky-500/10 text-sky-700 dark:text-sky-300";
    }
    if (line.startsWith("---") || line.startsWith("+++")) {
      return "bg-muted text-muted-foreground";
    }
    if (line.startsWith("+")) {
      return "bg-green-500/10 text-green-700 dark:text-green-300";
    }
    if (line.startsWith("-")) {
      return "bg-red-500/10 text-red-700 dark:text-red-300";
    }
    return "bg-transparent text-foreground";
  };

  const modifiedCount = result?.lineDiffs.filter((diff) => diff.type === "modified").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Original Text</CardTitle>
            <CardDescription>Enter the first text to compare</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Enter original text..."
              value={text1}
              onChange={(e) => setText1(e.target.value)}
              className="min-h-[300px] font-mono"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Modified Text</CardTitle>
            <CardDescription>Enter the second text to compare</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Enter modified text..."
              value={text2}
              onChange={(e) => setText2(e.target.value)}
              className="min-h-[300px] font-mono"
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center">
        <Button onClick={compareTextBlocks} size="lg" className="gap-2">
          <ArrowRight className="h-4 w-4" />
          Compare Texts
        </Button>
      </div>

      {result && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Comparison Results</CardTitle>
                <CardDescription>Line, unified, and character-level views</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={copyStats} className="gap-2">
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Stats
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <div className="rounded-lg bg-muted p-3 text-center">
                <div className="text-2xl font-bold">{Math.round(result.similarity)}%</div>
                <div className="text-sm text-muted-foreground">Similarity</div>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <div className="text-2xl font-bold">{result.equal ? "Yes" : "No"}</div>
                <div className="text-sm text-muted-foreground">Exact Match</div>
              </div>
              <div className="rounded-lg bg-green-500/10 p-3 text-center">
                <div className="text-2xl font-bold text-green-500">{result.comparison.addedLines}</div>
                <div className="text-sm text-muted-foreground">Added</div>
              </div>
              <div className="rounded-lg bg-red-500/10 p-3 text-center">
                <div className="text-2xl font-bold text-red-500">{result.comparison.removedLines}</div>
                <div className="text-sm text-muted-foreground">Removed</div>
              </div>
              <div className="rounded-lg bg-yellow-500/10 p-3 text-center">
                <div className="text-2xl font-bold text-yellow-500">{modifiedCount}</div>
                <div className="text-sm text-muted-foreground">Modified</div>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <div className="text-2xl font-bold">{result.comparison.unchangedLines}</div>
                <div className="text-sm text-muted-foreground">Unchanged</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-medium">Original Stats</h3>
                  <Badge variant="outline">Left</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Lines</dt>
                    <dd className="font-medium">{result.originalStats.lines}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Words</dt>
                    <dd className="font-medium">{result.originalStats.words}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Characters</dt>
                    <dd className="font-medium">{result.originalStats.characters}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Bytes</dt>
                    <dd className="font-medium">{result.originalStats.bytes}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-medium">Modified Stats</h3>
                  <Badge variant="outline">Right</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Lines</dt>
                    <dd className="font-medium">{result.modifiedStats.lines}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Words</dt>
                    <dd className="font-medium">{result.modifiedStats.words}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Characters</dt>
                    <dd className="font-medium">{result.modifiedStats.characters}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Bytes</dt>
                    <dd className="font-medium">{result.modifiedStats.bytes}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <Tabs defaultValue="line-diff" className="w-full">
              <TabsList className="h-auto w-full justify-start gap-1 rounded-lg bg-muted p-1">
                <TabsTrigger value="line-diff" className="flex-1">
                  Line Diff
                </TabsTrigger>
                <TabsTrigger value="unified-diff" className="flex-1">
                  Unified Diff
                </TabsTrigger>
                <TabsTrigger value="character-diff" className="flex-1">
                  Character Diff
                </TabsTrigger>
              </TabsList>

              <TabsContent value="line-diff" className="space-y-2">
                <div className="max-h-[420px] space-y-2 overflow-y-auto">
                  {result.lineDiffs.map((diff, index) => (
                    <div key={`${diff.lineNumber}-${index}`} className={`rounded-lg border p-3 ${getLineColor(diff.type)}`}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Line {diff.lineNumber + 1}</span>
                        {getLineBadge(diff.type)}
                      </div>
                      {diff.type === "modified" && diff.oldContent !== undefined ? (
                        <div className="space-y-2">
                          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2">
                            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-red-500">
                              Before
                            </div>
                            <div className="whitespace-pre-wrap break-words font-mono text-sm text-red-500 line-through decoration-red-500">
                              {diff.oldContent || "(empty line)"}
                            </div>
                          </div>
                          <div className="rounded-md border border-green-500/20 bg-green-500/5 p-2">
                            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-green-600 dark:text-green-400">
                              After
                            </div>
                            <div className="whitespace-pre-wrap break-words font-mono text-sm">
                              {diff.content || "(empty line)"}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap break-words font-mono text-sm">
                          {diff.content || "(empty line)"}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="unified-diff">
                {result.unifiedDiff.length > 0 ? (
                  <div className="max-h-[420px] overflow-auto rounded-lg border bg-card">
                    <div className="border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Unified Patch
                    </div>
                    <div className="p-2 font-mono text-sm">
                      {result.unifiedDiff.map((line, index) => (
                        <div
                          key={`${line}-${index}`}
                          className={`whitespace-pre px-3 py-1 ${getUnifiedDiffLineClass(line)}`}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                    No unified diff to show because the texts are identical.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="character-diff" className="space-y-3">
                <div>
                  <h3 className="font-medium">Character-Level Changes</h3>
                  <p className="text-sm text-muted-foreground">
                    Character-level detail is shown for each changed line.
                  </p>
                </div>

                {result.characterDetails.length > 0 ? (
                  <div className="max-h-[420px] space-y-3 overflow-auto">
                    {result.characterDetails.map((detail) => (
                      <div key={detail.label} className="rounded-lg border bg-muted/40 p-4">
                        <h4 className="mb-2 font-medium">{detail.label}</h4>
                        <div className="whitespace-pre-wrap break-words font-mono text-sm leading-7">
                          {detail.items.map((item, index) => (
                            <span key={`${detail.label}-${item.type}-${index}`} className={`rounded px-0.5 ${getCharClassName(item.type)}`}>
                              {item.value || " "}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                    No character-level changes were found.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
