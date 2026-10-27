import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitCompare } from "lucide-react";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import {
  areTextsEqual,
  calculateSimilarity,
  getCharDiff,
  getLineDiff,
  getTextStats,
  getUnifiedDiff,
  type DiffResult,
  type LineDiff,
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

type DiffView = "line" | "unified" | "character";

interface CharacterDiffDetail {
  label: string;
  items: DiffResult[];
}

function getCharacterDetails(lineDiffs: LineDiff[]): CharacterDiffDetail[] {
  return lineDiffs
    .filter((diff) => diff.type !== "unchanged")
    .map((diff) => {
      if (diff.type === "modified") {
        return { label: `Line ${diff.lineNumber + 1}`, items: getCharDiff(diff.oldContent ?? "", diff.content) };
      }
      if (diff.type === "added") {
        return { label: `Added line ${diff.lineNumber + 1}`, items: getCharDiff("", diff.content) };
      }
      return { label: `Removed line ${diff.lineNumber + 1}`, items: getCharDiff(diff.content, "") };
    });
}


const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const LINE_STYLES: Record<LineDiff["type"], { marker: string; className: string }> = {
  added: { marker: "+", className: "bg-success/10 text-success" },
  removed: { marker: "-", className: "bg-destructive/10 text-destructive" },
  modified: { marker: "~", className: "bg-warning/10 text-warning" },
  unchanged: { marker: " ", className: "text-foreground" },
};

const getCharClassName = (type: DiffResult["type"]) => {
  switch (type) {
    case "added":
      return "bg-success/20 text-success";
    case "removed":
      return "bg-destructive/20 text-destructive line-through";
    default:
      return "text-foreground";
  }
};

const getUnifiedDiffLineClass = (line: string) => {
  if (line.startsWith("@@")) return "bg-info/10 text-info";
  if (line.startsWith("---") || line.startsWith("+++")) return "text-muted-foreground";
  if (line.startsWith("+")) return "bg-success/10 text-success";
  if (line.startsWith("-")) return "bg-destructive/10 text-destructive";
  return "text-foreground";
};

export function TextCompare() {
  const [text1, setText1] = useState("");
  const [text2, setText2] = useState("");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [view, setView] = useState<DiffView>("line");
  const original = useDebouncedValue(text1);
  const modified = useDebouncedValue(text2);

  const result = useMemo(() => {
    if (!original && !modified) return null;
    const options = { ignoreWhitespace, ignoreCase };
    const lineDiffs = getLineDiff(original, modified, options);
    const count = (type: LineDiff["type"]) => lineDiffs.filter((diff) => diff.type === type).length;
    return {
      lineDiffs,
      added: count("added"),
      removed: count("removed"),
      modified: count("modified"),
      unchanged: count("unchanged"),
      similarity: Math.round(calculateSimilarity(original, modified, options)),
      equal: areTextsEqual(original, modified, options),
      unifiedDiff: getUnifiedDiff(original, modified, 3, options),
      characterDetails: getCharacterDetails(lineDiffs),
    };
  }, [original, modified, ignoreWhitespace, ignoreCase]);

  const statsJson = result
    ? JSON.stringify(
        {
          similarity: result.similarity,
          equal: result.equal,
          added: result.added,
          removed: result.removed,
          modified: result.modified,
          unchanged: result.unchanged,
          original: getTextStats(original),
          modifiedText: getTextStats(modified),
        },
        null,
        2
      )
    : "";

  const inputPane = (id: string, title: string, value: string, onChange: (next: string) => void, placeholder: string) => (
    <EditorPane
      title={title}
      htmlFor={id}
      scroll={false}
      actions={
        value ? (
          <>
            <span className="text-xs font-normal text-muted-foreground">{plural(value.split("\n").length, "line")}</span>
            <button type="button" className="toolbar-text-button" onClick={() => onChange("")}>Clear</button>
          </>
        ) : undefined
      }
    >
      <CodeTextarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </EditorPane>
  );

  const renderLineView = (lineDiffs: LineDiff[]) => (
    <div className="py-2 font-mono text-sm leading-[22px]">
      {lineDiffs.map((diff, index) => {
        const style = LINE_STYLES[diff.type];
        return (
          <div key={`${diff.lineNumber}-${index}`} className={style.className}>
            {diff.type === "modified" && diff.oldContent !== undefined && (
              <div className="grid grid-cols-[3rem_1.5rem_1fr] bg-destructive/10 text-destructive">
                <span className="select-none pr-2 text-right text-foreground/75">{diff.lineNumber + 1}</span>
                <span className="select-none" aria-hidden="true">-</span>
                <span className="whitespace-pre-wrap break-words pr-4">{diff.oldContent}</span>
              </div>
            )}
            <div className={`grid grid-cols-[3rem_1.5rem_1fr] ${diff.type === "modified" ? "bg-success/10 text-success" : ""}`}>
              <span className="select-none pr-2 text-right text-foreground/75">{diff.lineNumber + 1}</span>
              <span className="select-none" aria-hidden="true">{diff.type === "modified" ? "+" : style.marker}</span>
              <span className="whitespace-pre-wrap break-words pr-4">{diff.content}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderUnifiedView = (lines: string[]) =>
    lines.length > 0 ? (
      <div className="py-2 font-mono text-sm leading-[22px]">
        {lines.map((line, index) => (
          <div key={`${line}-${index}`} className={`whitespace-pre px-4 ${getUnifiedDiffLineClass(line)}`}>
            {line}
          </div>
        ))}
      </div>
    ) : (
      <PaneEmpty title="No differences" hint="The texts are identical." />
    );

  const renderCharacterView = (details: CharacterDiffDetail[]) =>
    details.length > 0 ? (
      <div className="result-list">
        {details.map((detail) => (
          <div key={detail.label} className="border-b border-border/50 px-4 py-2">
            <div className="result-row-label mb-1">{detail.label}</div>
            <div className="whitespace-pre-wrap break-words font-mono text-sm leading-[22px]">
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
      <PaneEmpty title="No differences" hint="No character-level changes were found." />
    );

  return (
    <ToolWorkspace
      id="text-compare"
      toolbar={
        <>
          <Tabs value={view} onValueChange={(v) => setView(v as DiffView)}>
            <TabsList aria-label="Diff view">
              <TabsTrigger value="line">Line</TabsTrigger>
              <TabsTrigger value="unified">Unified</TabsTrigger>
              <TabsTrigger value="character">Character</TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="option-switch indent-control" htmlFor="text-compare-ignore-whitespace">
            Ignore whitespace
            <Switch id="text-compare-ignore-whitespace" checked={ignoreWhitespace} onCheckedChange={setIgnoreWhitespace} />
          </label>
          <label className="option-switch indent-control" htmlFor="text-compare-ignore-case">
            Ignore case
            <Switch id="text-compare-ignore-case" checked={ignoreCase} onCheckedChange={setIgnoreCase} />
          </label>
        </>
      }
      first={
        <PanelGroup direction="vertical">
          <Panel minSize={20} defaultSize={50}>
            {inputPane("text-compare-original", "Original", text1, setText1, "Enter original text...")}
          </Panel>
          <PanelResizeHandle className="editor-resize" aria-label="Resize original and modified" />
          <Panel minSize={20} defaultSize={50}>
            {inputPane("text-compare-modified", "Modified", text2, setText2, "Enter modified text...")}
          </Panel>
        </PanelGroup>
      }
      second={
        <EditorPane
          title="Differences"
          actions={
            result ? (
              <>
                {view === "unified" && <CopyButton value={result.unifiedDiff.join("\n")} label="Copy patch" />}
                <CopyButton value={statsJson} label="Copy stats" />
              </>
            ) : undefined
          }
        >
          {!result ? (
            <PaneEmpty
              icon={<GitCompare size={20} aria-hidden="true" />}
              title="Enter two texts to compare"
              hint="Differences appear here as you type."
            />
          ) : view === "line" ? (
            renderLineView(result.lineDiffs)
          ) : view === "unified" ? (
            renderUnifiedView(result.unifiedDiff)
          ) : (
            renderCharacterView(result.characterDetails)
          )}
        </EditorPane>
      }
      status={
        result ? (
          <>
            <span className={result.equal ? "text-success" : undefined}>{result.equal ? "Identical" : "Different"}</span>
            <span>{result.similarity}% similar</span>
            <span>
              <span className="text-success">{result.added} added</span>·
              <span className="text-destructive">{result.removed} removed</span>·
              <span className="text-warning">{result.modified} modified</span>
            </span>
          </>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
