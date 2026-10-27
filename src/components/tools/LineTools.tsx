import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useState } from "react";
import { ListOrdered, Shuffle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { processLines, type LineSort } from "@/utils/line-tools";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "In which order are the options applied?",
    a: "Trim lines, then remove empty lines, then remove duplicates, then sort, then reverse. Dedupe keeps the first copy of each line.",
  },
  {
    q: "What does Natural sort do?",
    a: "It compares numbers inside lines by value, so `file2` comes before `file10`. A to Z sorts by the system locale with numbers compared digit by digit.",
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

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

export function LineTools() {
  const [input, setInput] = useState("");
  const [sort, setSort] = useState<LineSort>("none");
  const [reverse, setReverse] = useState(false);
  const [dedupe, setDedupe] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [trim, setTrim] = useState(false);
  const [removeEmpty, setRemoveEmpty] = useState(false);
  // Changing the nonce runs the shuffle again.
  const [shuffleNonce, setShuffleNonce] = useState(0);
  const text = useDebouncedValue(input);

  const result = useMemo(() => {
    if (!text) return null;
    return processLines(text, { sort, reverse, dedupe, ignoreCase, trim, removeEmpty });
    // shuffleNonce is a deliberate trigger for a new shuffle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, sort, reverse, dedupe, ignoreCase, trim, removeEmpty, shuffleNonce]);

  const option = (id: string, label: string, checked: boolean, onChange: (next: boolean) => void, disabled = false) => (
    <label className="option-switch" htmlFor={id}>
      {label}
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );

  return (
    <ToolWorkspace
      id="line-tools"
      toolbar={
        <>
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
        <>
          {option("line-tools-reverse", "Reverse", reverse, setReverse)}
          {option("line-tools-dedupe", "Remove duplicates", dedupe, setDedupe)}
          {option("line-tools-ignore-case", "Ignore case", ignoreCase, setIgnoreCase)}
          {option("line-tools-trim", "Trim lines", trim, setTrim)}
          {option("line-tools-remove-empty", "Remove empty lines", removeEmpty, setRemoveEmpty)}
        </>
      }
      first={
        <EditorPane
          title="Lines"
          htmlFor="line-tools-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea
            id="line-tools-input"
            placeholder="Paste one item per line"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </EditorPane>
      }
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
