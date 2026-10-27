import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUpDown, ChevronDown, ChevronUp, GitCompare } from "lucide-react";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import {
  areTextsEqual,
  calculateSimilarity,
  getChangeStarts,
  getCharDiff,
  getLineDiff,
  getTextStats,
  getUnifiedDiff,
  getWordDiff,
  mergeDiffResults,
  type CompareOptions,
  type DiffResult,
  type LineDiff,
} from "@/utils/text-compare";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What is the difference between the line, word, character, and unified views?",
    a: "Line view shows every line and marks the changed ones. Word view and character view list only the changed lines and highlight what changed inside each one. Unified view shows patch-style output similar to Git. All views show the same comparison at different levels of detail.",
  },
  {
    q: "When should I use word view instead of character view?",
    a: "Use word view for prose and code, because it marks whole words and keeps the result easy to read. Use character view to find a single changed character, such as a typo or a changed digit.",
  },
  {
    q: "What happens when I insert or delete a line?",
    a: "The tool aligns the two texts before it compares them. An inserted or deleted line shows as one change, and the lines after it stay unchanged.",
  },
  {
    q: "How is similarity calculated?",
    a: "Similarity is the share of lines that match after alignment, out of the longer text. The ignore whitespace and ignore case options apply to it.",
  },
  {
    q: "How do I move between changes?",
    a: "Use the arrow buttons above the differences. A change is a group of changed lines next to each other. The counter shows which change is selected and how many there are.",
  },
  {
    q: "Why does a modified line appear as a removal and an addition in unified view?",
    a: "Patch-style diffs show a changed line as the old line removed and the new line added. Git and code review tools use the same format, so you can copy it into a discussion or apply it as a patch.",
  },
];

type DiffView = "line" | "word" | "character" | "unified";

interface InlineDiffDetail {
  key: string;
  label: string;
  items: DiffResult[];
  /** Index of the change that starts at this line, if one does. */
  change?: number;
}

/** One entry per changed line, with the inline diff from the given function. */
function getInlineDetails(
  lineDiffs: LineDiff[],
  changeStarts: number[],
  diffLine: (oldLine: string, newLine: string) => DiffResult[]
): InlineDiffDetail[] {
  const changeAt = new Map(changeStarts.map((lineIndex, change) => [lineIndex, change]));
  return lineDiffs.flatMap((diff, index) => {
    if (diff.type === "unchanged") return [];
    const base = { key: `${diff.type}-${index}`, change: changeAt.get(index) };
    if (diff.type === "modified") {
      return [{ ...base, label: `Line ${diff.lineNumber + 1}`, items: diffLine(diff.oldContent ?? "", diff.content) }];
    }
    if (diff.type === "added") {
      return [{ ...base, label: `Added line ${diff.lineNumber + 1}`, items: [{ type: "added", value: diff.content }] }];
    }
    return [{ ...base, label: `Removed line ${diff.lineNumber + 1}`, items: [{ type: "removed", value: diff.content }] }];
  });
}

/** Index of the first line of each run of +/- lines in a unified diff. */
function getUnifiedChangeStarts(lines: string[]): number[] {
  const isChange = (line: string | undefined) =>
    line !== undefined && /^[+-]/.test(line) && !line.startsWith("---") && !line.startsWith("+++");
  return lines.flatMap((line, index) => (index >= 2 && isChange(line) && !(index > 2 && isChange(lines[index - 1])) ? [index] : []));
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const LINE_STYLES: Record<LineDiff["type"], { marker: string; className: string }> = {
  added: { marker: "+", className: "bg-success/10 text-success" },
  removed: { marker: "-", className: "bg-destructive/10 text-destructive" },
  modified: { marker: "~", className: "bg-warning/10 text-warning" },
  unchanged: { marker: " ", className: "text-foreground" },
};

const CURRENT_CHANGE_CLASS = "ring-1 ring-inset ring-ring";

const getInlineClassName = (type: DiffResult["type"]) => {
  switch (type) {
    case "added":
      return "rounded bg-success/20 px-0.5 text-success";
    case "removed":
      return "rounded bg-destructive/20 px-0.5 text-destructive line-through";
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
  const [currentChange, setCurrentChange] = useState(0);
  const diffRef = useRef<HTMLDivElement>(null);
  const original = useDebouncedValue(text1);
  const modified = useDebouncedValue(text2);

  const result = useMemo(() => {
    if (!original && !modified) return null;
    const options: CompareOptions = { ignoreWhitespace, ignoreCase };
    const lineDiffs = getLineDiff(original, modified, options);
    const changeStarts = getChangeStarts(lineDiffs);
    const count = (type: LineDiff["type"]) => lineDiffs.filter((diff) => diff.type === type).length;
    const unifiedDiff = getUnifiedDiff(original, modified, 3, options);
    return {
      lineDiffs,
      changeStarts,
      added: count("added"),
      removed: count("removed"),
      modified: count("modified"),
      unchanged: count("unchanged"),
      similarity: Math.round(calculateSimilarity(original, modified, options)),
      equal: areTextsEqual(original, modified, options),
      unifiedDiff,
      unifiedChangeStarts: getUnifiedChangeStarts(unifiedDiff),
      wordDetails: getInlineDetails(lineDiffs, changeStarts, (a, b) => getWordDiff(a, b, options)),
      characterDetails: getInlineDetails(lineDiffs, changeStarts, (a, b) => mergeDiffResults(getCharDiff(a, b))),
    };
  }, [original, modified, ignoreWhitespace, ignoreCase]);

  const changeCount = result?.changeStarts.length ?? 0;
  const activeChange = Math.min(currentChange, Math.max(0, changeCount - 1));

  // A new comparison starts at the first change.
  useEffect(() => setCurrentChange(0), [result]);

  const goToChange = (step: number) => {
    if (changeCount === 0) return;
    const next = (activeChange + step + changeCount) % changeCount;
    setCurrentChange(next);
    diffRef.current?.querySelector(`[data-change="${next}"]`)?.scrollIntoView?.({ block: "center" });
  };

  const swap = () => {
    setText1(text2);
    setText2(text1);
  };

  const changeProps = (change: number | undefined) =>
    change === undefined ? {} : { "data-change": change };
  const currentClass = (change: number | undefined) => (change !== undefined && change === activeChange ? CURRENT_CHANGE_CLASS : "");

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

  const renderLineView = (lineDiffs: LineDiff[], changeStarts: number[]) => {
    const changeAt = new Map(changeStarts.map((lineIndex, change) => [lineIndex, change]));
    return (
      <div className="py-2 font-mono text-sm leading-[22px]">
        {lineDiffs.map((diff, index) => {
          const style = LINE_STYLES[diff.type];
          const change = changeAt.get(index);
          return (
            <div key={`${diff.lineNumber}-${index}`} className={`${style.className} ${currentClass(change)}`} {...changeProps(change)}>
              {diff.type === "modified" && diff.oldContent !== undefined && (
                <div className="grid grid-cols-[3rem_1.5rem_1fr] bg-destructive/10 text-destructive">
                  <span className="select-none pr-2 text-right text-foreground/75">{(diff.oldLineNumber ?? diff.lineNumber) + 1}</span>
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
  };

  const renderUnifiedView = (lines: string[], changeStarts: number[]) => {
    if (lines.length === 0) return <PaneEmpty title="No differences" hint="The texts are identical." />;
    const changeAt = new Map(changeStarts.map((lineIndex, change) => [lineIndex, change]));
    return (
      <div className="py-2 font-mono text-sm leading-[22px]">
        {lines.map((line, index) => {
          const change = changeAt.get(index);
          return (
            <div
              key={`${line}-${index}`}
              className={`whitespace-pre px-4 ${getUnifiedDiffLineClass(line)} ${currentClass(change)}`}
              {...changeProps(change)}
            >
              {line}
            </div>
          );
        })}
      </div>
    );
  };

  const renderInlineView = (details: InlineDiffDetail[], hint: string) =>
    details.length > 0 ? (
      <div className="result-list">
        {details.map((detail) => (
          <div key={detail.key} className={`border-b border-border/50 px-4 py-2 ${currentClass(detail.change)}`} {...changeProps(detail.change)}>
            <div className="result-row-label mb-1">{detail.label}</div>
            <div className="whitespace-pre-wrap break-words font-mono text-sm leading-[22px]">
              {detail.items.map((item, index) => (
                <span key={`${detail.key}-${index}`} data-diff={item.type} className={getInlineClassName(item.type)}>
                  {item.value || " "}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <PaneEmpty title="No differences" hint={hint} />
    );

  let diffContent: ReactNode = null;
  if (result) {
    if (view === "line") diffContent = renderLineView(result.lineDiffs, result.changeStarts);
    else if (view === "word") diffContent = renderInlineView(result.wordDetails, "No word-level changes were found.");
    else if (view === "character") diffContent = renderInlineView(result.characterDetails, "No character-level changes were found.");
    else diffContent = renderUnifiedView(result.unifiedDiff, result.unifiedChangeStarts);
  }

  return (
    <ToolWorkspace
      id="text-compare"
      toolbar={
        <>
          <Tabs value={view} onValueChange={(v) => setView(v as DiffView)}>
            <TabsList aria-label="Diff view">
              <TabsTrigger value="line">Line</TabsTrigger>
              <TabsTrigger value="word">Word</TabsTrigger>
              <TabsTrigger value="character">Character</TabsTrigger>
              <TabsTrigger value="unified">Unified</TabsTrigger>
            </TabsList>
          </Tabs>
          <button type="button" className="toolbar-text-button" onClick={swap} disabled={!text1 && !text2}>
            <ArrowUpDown size={14} aria-hidden="true" />
            Swap
          </button>
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
                {changeCount > 0 && (
                  <>
                    <span className="text-xs font-normal text-muted-foreground" aria-live="polite">
                      Change {activeChange + 1} of {changeCount}
                    </span>
                    <button type="button" className="toolbar-text-button" onClick={() => goToChange(-1)} aria-label="Previous change">
                      <ChevronUp size={14} aria-hidden="true" />
                    </button>
                    <button type="button" className="toolbar-text-button" onClick={() => goToChange(1)} aria-label="Next change">
                      <ChevronDown size={14} aria-hidden="true" />
                    </button>
                  </>
                )}
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
          ) : (
            <div ref={diffRef} className="contents">{diffContent}</div>
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
