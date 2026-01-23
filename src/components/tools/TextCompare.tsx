import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface DiffLine {
  line: number;
  type: "same" | "added" | "removed" | "modified";
  content: string;
  oldContent?: string;
}

export function TextCompare() {
  const [text1, setText1] = useState("");
  const [text2, setText2] = useState("");
  const [diffs, setDiffs] = useState<DiffLine[]>([]);
  const [copied, setCopied] = useState(false);

  const compareTexts = () => {
    if (!text1.trim() && !text2.trim()) {
      toast.error("Please enter text to compare");
      return;
    }

    const lines1 = text1.split("\n");
    const lines2 = text2.split("\n");
    const result: DiffLine[] = [];

    const maxLines = Math.max(lines1.length, lines2.length);

    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i] || "";
      const line2 = lines2[i] || "";

      if (line1 === line2) {
        if (line1) {
          result.push({ line: i + 1, type: "same", content: line1 });
        }
      } else if (!line1 && line2) {
        result.push({ line: i + 1, type: "added", content: line2 });
      } else if (line1 && !line2) {
        result.push({ line: i + 1, type: "removed", content: line1 });
      } else {
        result.push({ line: i + 1, type: "modified", content: line2, oldContent: line1 });
      }
    }

    setDiffs(result);
    toast.success("Comparison complete!");
  };

  const copyStats = () => {
    const stats = {
      totalLines: diffs.length,
      added: diffs.filter((d) => d.type === "added").length,
      removed: diffs.filter((d) => d.type === "removed").length,
      modified: diffs.filter((d) => d.type === "modified").length,
      unchanged: diffs.filter((d) => d.type === "same").length,
    };
    navigator.clipboard.writeText(JSON.stringify(stats, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Statistics copied!");
  };

  const getDiffColor = (type: DiffLine["type"]) => {
    switch (type) {
      case "added":
        return "bg-green-500/10 border-green-500/30";
      case "removed":
        return "bg-red-500/10 border-red-500/30";
      case "modified":
        return "bg-yellow-500/10 border-yellow-500/30";
      default:
        return "";
    }
  };

  const getDiffBadge = (type: DiffLine["type"]) => {
    switch (type) {
      case "added":
        return <Badge className="bg-green-500">Added</Badge>;
      case "removed":
        return <Badge className="bg-red-500">Removed</Badge>;
      case "modified":
        return <Badge className="bg-yellow-500">Modified</Badge>;
      default:
        return null;
    }
  };

  const stats = {
    totalLines: diffs.length,
    added: diffs.filter((d) => d.type === "added").length,
    removed: diffs.filter((d) => d.type === "removed").length,
    modified: diffs.filter((d) => d.type === "modified").length,
    unchanged: diffs.filter((d) => d.type === "same").length,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <Button onClick={compareTexts} size="lg" className="gap-2">
          <ArrowRight className="h-4 w-4" />
          Compare Texts
        </Button>
      </div>

      {diffs.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Comparison Results</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyStats}
                  className="gap-2"
                >
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
              <CardDescription>Line by line comparison</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="text-center p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold">{stats.totalLines}</div>
                  <div className="text-sm text-muted-foreground">Total Lines</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-500/10">
                  <div className="text-2xl font-bold text-green-500">{stats.added}</div>
                  <div className="text-sm text-muted-foreground">Added</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-500/10">
                  <div className="text-2xl font-bold text-red-500">{stats.removed}</div>
                  <div className="text-sm text-muted-foreground">Removed</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-yellow-500/10">
                  <div className="text-2xl font-bold text-yellow-500">{stats.modified}</div>
                  <div className="text-sm text-muted-foreground">Modified</div>
                </div>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {diffs.map((diff, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${getDiffColor(diff.type)}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Line {diff.line}</span>
                      {getDiffBadge(diff.type)}
                    </div>
                    {diff.type === "modified" && diff.oldContent && (
                      <div className="text-sm text-red-400 mb-1 line-through decoration-red-500">
                        {diff.oldContent}
                      </div>
                    )}
                    <div className="text-sm font-mono">{diff.content || "(empty line)"}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
