import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { GitCompare, ListOrdered, Shuffle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { compareLists, processLines, type LineFilter, type LineSort, type LineToolResult } from "@/utils/line-tools";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "In which order are the options applied?",
    a: "Trim lines, then remove empty lines, then filter, then remove duplicates, then sort, then reverse. Dedupe keeps the first copy of each line.",
  },
  {
    q: "How does the filter work?",
    a: "Keep lines keeps the lines that contain the text. Remove lines drops them. Turn on Regex to match a JavaScript regular expression instead. Ignore case applies to the filter too.",
  },
  {
    q: "What does Natural sort do?",
    a: "It compares numbers inside lines by value, so `file2` comes before `file10`. A to Z sorts by the system locale with numbers compared digit by digit.",
  },
  {
    q: "How does Compare work?",
    a: "Compare treats each list as a set of lines. It shows the lines only in A, only in B, in both lists, and the union. Duplicates count once. Each result keeps the order and spelling of the first copy.",
  },
  {
    q: "What happens to Windows line endings?",
    a: "Lines are split on LF, CRLF, and CR. The result uses CRLF if the input has any CRLF, otherwise LF. A final line break in the input is kept.",
  },
];

const SORTS: { value: LineSort; label: string }[] = [
  { value: "none", label: "Original" },
  { value: "asc", label: "A→Z" },
  { value: "desc", label: "Z→A" },
  { value: "natural", label: "Natural" },
  { value: "length", label: "Length" },
  { value: "shuffle", label: "Shuffle" },
];

type Mode = "process" | "compare";
type CompareSet = "onlyA" | "onlyB" | "both" | "union";

const COMPARE_SETS: { value: CompareSet; label: string }[] = [
  { value: "onlyA", label: "Only in A" },
  { value: "onlyB", label: "Only in B" },
  { value: "both", label: "In both" },
  { value: "union", label: "Union" },
];

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

const option = (id: string, label: string, checked: boolean, onChange: (next: boolean) => void, disabled = false) => (
  <label className="option-switch" htmlFor={id}>
    {label}
    <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
  </label>
);

const inputPane = (id: string, title: string, value: string, onChange: (next: string) => void, placeholder: string) => (
  <EditorPane
    title={title}
    htmlFor={id}
    scroll={false}
    actions={value ? <button type="button" className="toolbar-text-button" onClick={() => onChange("")}>Clear</button> : undefined}
  >
    <CodeTextarea id={id} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  </EditorPane>
);

export function LineTools() {
  const [mode, setMode] = useState<Mode>("process");
  const [input, setInput] = useState("");
  const [sort, setSort] = useState<LineSort>("none");
  const [reverse, setReverse] = useState(false);
  const [dedupe, setDedupe] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [trim, setTrim] = useState(false);
  const [removeEmpty, setRemoveEmpty] = useState(false);
  const [filterPattern, setFilterPattern] = useState("");
  const [filterMode, setFilterMode] = useState<NonNullable<LineFilter["mode"]>>("keep");
  const [filterRegex, setFilterRegex] = useState(false);
  // Changing the nonce runs the shuffle again.
  const [shuffleNonce, setShuffleNonce] = useState(0);
  const text = useDebouncedValue(input);
  const pattern = useDebouncedValue(filterPattern);

  const [listA, setListA] = useState("");
  const [listB, setListB] = useState("");
  const [compareSet, setCompareSet] = useState<CompareSet>("onlyA");
  const [compareIgnoreCase, setCompareIgnoreCase] = useState(false);
  const [compareTrim, setCompareTrim] = useState(true);
  const [ignoreBlank, setIgnoreBlank] = useState(true);
  const textA = useDebouncedValue(listA);
  const textB = useDebouncedValue(listB);

  const processed = useMemo<{ result: LineToolResult | null; error: string }>(() => {
    if (!text) return { result: null, error: "" };
    try {
      const filter = { pattern, mode: filterMode, regex: filterRegex };
      return { result: processLines(text, { filter, sort, reverse, dedupe, ignoreCase, trim, removeEmpty }), error: "" };
    } catch (err) {
      return { result: null, error: (err as Error).message };
    }
    // shuffleNonce is a deliberate trigger for a new shuffle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, pattern, filterMode, filterRegex, sort, reverse, dedupe, ignoreCase, trim, removeEmpty, shuffleNonce]);
  const result = processed.result;

  const compared = useMemo(() => {
    if (!textA && !textB) return null;
    return compareLists(textA, textB, { ignoreCase: compareIgnoreCase, trim: compareTrim, ignoreBlank });
  }, [textA, textB, compareIgnoreCase, compareTrim, ignoreBlank]);
  const compareOutput = compared ? compared[compareSet].join(compared.eol) : "";
  const compareLabel = COMPARE_SETS.find((s) => s.value === compareSet)?.label ?? "";

  if (mode === "compare") {
    return (
      <ToolWorkspace
        id="line-tools"
        toolbar={
          <>
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList aria-label="Mode">
                <TabsTrigger value="process">Process</TabsTrigger>
                <TabsTrigger value="compare">Compare</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={compareSet} onValueChange={(v) => setCompareSet(v as CompareSet)}>
              <TabsList aria-label="Result set">
                {COMPARE_SETS.map((s) => (
                  <TabsTrigger key={s.value} value={s.value}>
                    {s.label}{compared ? ` (${compared[s.value].length.toLocaleString()})` : ""}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </>
        }
        secondaryToolbar={
          <>
            {option("line-tools-compare-ignore-case", "Ignore case", compareIgnoreCase, setCompareIgnoreCase)}
            {option("line-tools-compare-trim", "Trim lines", compareTrim, setCompareTrim)}
            {option("line-tools-compare-ignore-blank", "Ignore blank lines", ignoreBlank, setIgnoreBlank)}
          </>
        }
        first={
          <PanelGroup direction="vertical">
            <Panel minSize={20} defaultSize={50}>
              {inputPane("line-tools-list-a", "List A", listA, setListA, "Paste the first list, one item per line")}
            </Panel>
            <PanelResizeHandle className="editor-resize" aria-label="Resize list A and list B" />
            <Panel minSize={20} defaultSize={50}>
              {inputPane("line-tools-list-b", "List B", listB, setListB, "Paste the second list, one item per line")}
            </Panel>
          </PanelGroup>
        }
        second={
          <EditorPane
            title="Result"
            htmlFor={compared ? "line-tools-compare-output" : undefined}
            scroll={false}
            actions={<CopyButton value={compareOutput} label="Copy" ariaLabel={`Copy ${compareLabel}`} />}
          >
            {compared ? (
              <CodeTextarea id="line-tools-compare-output" value={compareOutput} readOnly />
            ) : (
              <PaneEmpty icon={<GitCompare size={20} aria-hidden="true" />} title="Compared lines appear here" hint="Paste a list in A and in B." />
            )}
          </EditorPane>
        }
        status={
          compared ? (
            <span>
              A: {plural(compared.uniqueA, "unique item")} · B: {plural(compared.uniqueB, "unique item")} · {compared.both.length.toLocaleString()} in both
            </span>
          ) : (
            <span>Ready</span>
          )
        }
        help={<ToolFaqSection items={FAQ_ITEMS} />}
      />
    );
  }

  return (
    <ToolWorkspace
      id="line-tools"
      toolbar={
        <>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList aria-label="Mode">
              <TabsTrigger value="process">Process</TabsTrigger>
              <TabsTrigger value="compare">Compare</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={sort} onValueChange={(v) => setSort(v as LineSort)}>
            <TabsList aria-label="Sort">
              {SORTS.map((s) => (
                <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {sort === "shuffle" && (
            <button type="button" className="toolbar-text-button" onClick={() => setShuffleNonce((n) => n + 1)} disabled={!result}>
              <Shuffle size={14} aria-hidden="true" />
              Shuffle again
            </button>
          )}
        </>
      }
      secondaryToolbar={
        <div className="regex-fields">
          <div className="regex-field">
            <select
              aria-label="Filter mode"
              className="h-7 rounded-md border border-input bg-background px-1.5 pr-6 text-xs text-foreground"
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as NonNullable<LineFilter["mode"]>)}
            >
              <option value="keep">Keep lines</option>
              <option value="remove">Remove lines</option>
            </select>
            <Input
              aria-label="Filter lines"
              className="h-7 text-xs font-mono"
              value={filterPattern}
              onChange={(e) => setFilterPattern(e.target.value)}
              placeholder={filterRegex ? "matching a regex, e.g. ^api-" : "containing text"}
              aria-invalid={Boolean(processed.error)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {option("line-tools-filter-regex", "Regex", filterRegex, setFilterRegex)}
          {option("line-tools-reverse", "Reverse", reverse, setReverse)}
          {option("line-tools-dedupe", "Remove duplicates", dedupe, setDedupe)}
          {option("line-tools-ignore-case", "Ignore case", ignoreCase, setIgnoreCase)}
          {option("line-tools-trim", "Trim lines", trim, setTrim)}
          {option("line-tools-remove-empty", "Remove empty lines", removeEmpty, setRemoveEmpty)}
        </div>
      }
      notice={
        processed.error ? (
          <div className="workspace-notice" data-tone="error" role="alert">{processed.error}</div>
        ) : undefined
      }
      first={inputPane("line-tools-input", "Lines", input, setInput, "Paste one item per line")}
      second={
        <EditorPane
          title="Result"
          htmlFor={result ? "line-tools-output" : undefined}
          scroll={false}
          actions={<CopyButton value={result?.output ?? ""} label="Copy" ariaLabel="Copy result lines" />}
        >
          {result ? (
            <CodeTextarea id="line-tools-output" value={result.output} readOnly />
          ) : (
            <PaneEmpty icon={<ListOrdered size={20} aria-hidden="true" />} title="Processed lines appear here" />
          )}
        </EditorPane>
      }
      status={
        result ? (
          <span>
            {plural(result.inputLines, "line")} → {plural(result.outputLines, "line")}
            {result.filterMatched !== undefined && ` · ${result.filterMatched.toLocaleString()} matched`}
            {dedupe && ` · ${plural(result.duplicatesRemoved, "duplicate")} removed`}
            {removeEmpty && result.emptyRemoved > 0 && ` · ${plural(result.emptyRemoved, "empty line")} removed`}
          </span>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
