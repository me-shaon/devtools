import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ArrowUpDown, GitCompare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import {
  diffJson,
  formatChanges,
  formatPatch,
  parseSide,
  previewValue,
  valueType,
  type ArrayMode,
  type ChangeKind,
  type JsonChange,
} from "@/utils/json-diff";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "How is this different from Text Compare?",
    a: "Text Compare compares lines. JSON Diff reads both documents and compares the values. The tool ignores key order, indentation, and line breaks. Each change shows the path to the value, such as `$.users[2].email`.",
  },
  {
    q: "How do I compare arrays that changed order?",
    a: "Select By key and type the id field, such as `id`. Items with the same id are compared, at any position. Each item must have a unique id. If not, the tool compares that array by index. For arrays of strings or numbers, turn on Ignore order.",
  },
  {
    q: "Which input can I paste?",
    a: "Paste JSON, JSON5, NDJSON, or a Python, Ruby, or JavaScript data literal. Text that is not JSON is read as YAML. Large integers stay exact, so 12345678901234567890 and 12345678901234567891 are different.",
  },
  {
    q: "How do I use the JSON Patch?",
    a: "Click Copy JSON Patch to get RFC 6902 operations. Apply them in order to the original to get the modified document. In By key mode, the patch adds new items at the end of the array and does not move items.",
  },
  {
    q: "Is a number the same as the same number in a string?",
    a: "No. The tool compares types. `1` and `\"1\"` show as a type change. `1.0` and `1` are the same number.",
  },
];

const KINDS: { kind: ChangeKind; label: string; marker: string; className: string }[] = [
  { kind: "added", label: "Added", marker: "+", className: "text-success" },
  { kind: "removed", label: "Removed", marker: "-", className: "text-destructive" },
  { kind: "changed", label: "Changed", marker: "~", className: "text-warning" },
  { kind: "type", label: "Type changed", marker: "!", className: "text-warning" },
];
const KIND_STYLE = Object.fromEntries(KINDS.map((entry) => [entry.kind, entry])) as Record<ChangeKind, (typeof KINDS)[number]>;

/** Rows past this count are not drawn. Copy changes still copies all of them. */
const MAX_ROWS = 1000;

type Filter = ChangeKind | "all";

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

function ChangeRow({ change }: { change: JsonChange }) {
  const style = KIND_STYLE[change.kind];
  return (
    <li className="grid grid-cols-[1.25rem_1fr] gap-x-2 border-b border-border/50 px-4 py-2 font-mono text-xs leading-[18px]" data-kind={change.kind}>
      <span className={`select-none font-semibold ${style.className}`} aria-label={style.label}>{style.marker}</span>
      <span className="min-w-0 break-all text-foreground">{change.path}</span>
      <span aria-hidden="true" />
      <span className="min-w-0 break-all">
        {change.kind !== "added" && (
          <span className="text-destructive">
            {change.kind === "type" && `${valueType(change.oldValue)} `}
            {previewValue(change.oldValue)}
          </span>
        )}
        {(change.kind === "changed" || change.kind === "type") && <span className="text-muted-foreground"> → </span>}
        {change.kind !== "removed" && (
          <span className="text-success">
            {change.kind === "type" && `${valueType(change.newValue)} `}
            {previewValue(change.newValue)}
          </span>
        )}
      </span>
    </li>
  );
}

export function JsonDiff() {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [arrayMode, setArrayMode] = useState<ArrayMode>("index");
  const [matchKey, setMatchKey] = useState("id");
  const [ignoreOrder, setIgnoreOrder] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const leftText = useDebouncedValue(left);
  const rightText = useDebouncedValue(right);
  const keyText = useDebouncedValue(matchKey);

  const leftSide = useMemo(() => (leftText.trim() ? parseSide(leftText) : undefined), [leftText]);
  const rightSide = useMemo(() => (rightText.trim() ? parseSide(rightText) : undefined), [rightText]);
  const result = useMemo(
    () =>
      leftSide?.ok && rightSide?.ok
        ? diffJson(leftSide.value, rightSide.value, { arrayMode, matchKey: keyText, ignoreOrder, ignoreWhitespace })
        : undefined,
    [leftSide, rightSide, arrayMode, keyText, ignoreOrder, ignoreWhitespace],
  );

  const shown = useMemo(() => (result ? (filter === "all" ? result.changes : result.changes.filter((c) => c.kind === filter)) : []), [result, filter]);
  const changesText = useMemo(() => formatChanges(shown), [shown]);
  const patchText = useMemo(() => (result ? formatPatch(result.patch) : ""), [result]);

  const swap = () => {
    setLeft(right);
    setRight(left);
  };

  const errors: string[] = [];
  if (leftSide && "error" in leftSide) errors.push(`Original: ${leftSide.error}`);
  if (rightSide && "error" in rightSide) errors.push(`Modified: ${rightSide.error}`);
  const notices: string[] = [];
  if (leftSide?.ok && leftSide.notice) notices.push(`Original: ${leftSide.notice}`);
  if (rightSide?.ok && rightSide.notice) notices.push(`Modified: ${rightSide.notice}`);
  if (result && result.keyFallbacks > 0) {
    const key = keyText.trim() || "id";
    notices.push(`${plural(result.keyFallbacks, "array")} of objects compared by index. Each item must have a unique "${key}" value.`);
  }

  const notice = (
    <>
      {errors.length > 0 && (
        <div className="workspace-notice" data-tone="error" role="alert">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}
      {notices.length > 0 && (
        <div className="workspace-notice" role="status">
          {notices.map((text) => <p key={text}>{text}</p>)}
        </div>
      )}
    </>
  );

  const total = result?.changes.length ?? 0;

  const inputPane = (id: string, title: string, value: string, onChange: (next: string) => void, placeholder: string) => (
    <EditorPane
      title={title}
      htmlFor={id}
      scroll={false}
      actions={value ? <button type="button" className="toolbar-text-button" onClick={() => onChange("")}>Clear</button> : undefined}
    >
      <CodeTextarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </EditorPane>
  );

  return (
    <ToolWorkspace
      id="json-diff"
      toolbar={
        <>
          <Tabs value={arrayMode} onValueChange={(v) => setArrayMode(v as ArrayMode)}>
            <TabsList aria-label="Array items">
              <TabsTrigger value="index">By index</TabsTrigger>
              <TabsTrigger value="key">By key</TabsTrigger>
            </TabsList>
          </Tabs>
          {arrayMode === "key" && (
            <Input
              className="h-7 w-24 text-xs"
              aria-label="Match key"
              value={matchKey}
              onChange={(e) => setMatchKey(e.target.value)}
              placeholder="id"
              autoComplete="off"
              spellCheck={false}
            />
          )}
          <label className="option-switch indent-control" htmlFor="json-diff-ignore-order">
            Ignore order
            <Switch id="json-diff-ignore-order" checked={ignoreOrder} onCheckedChange={setIgnoreOrder} />
          </label>
          <label className="option-switch indent-control" htmlFor="json-diff-ignore-whitespace">
            Ignore whitespace
            <Switch id="json-diff-ignore-whitespace" checked={ignoreWhitespace} onCheckedChange={setIgnoreWhitespace} />
          </label>
          <button type="button" className="toolbar-text-button" onClick={swap} disabled={!left && !right}>
            <ArrowUpDown size={14} aria-hidden="true" />
            Swap
          </button>
        </>
      }
      secondaryToolbar={
        total > 0 ? (
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList aria-label="Show changes">
              <TabsTrigger value="all">All {total.toLocaleString()}</TabsTrigger>
              {KINDS.map(({ kind, label }) => (
                <TabsTrigger key={kind} value={kind} disabled={!result?.counts[kind]}>
                  {label} {result?.counts[kind].toLocaleString()}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : undefined
      }
      notice={notice}
      first={
        <PanelGroup direction="vertical">
          <Panel minSize={20} defaultSize={50}>
            {inputPane("json-diff-original", "Original", left, setLeft, "Paste the original JSON or YAML")}
          </Panel>
          <PanelResizeHandle className="editor-resize" aria-label="Resize original and modified" />
          <Panel minSize={20} defaultSize={50}>
            {inputPane("json-diff-modified", "Modified", right, setRight, "Paste the modified JSON or YAML")}
          </Panel>
        </PanelGroup>
      }
      second={
        <EditorPane
          title="Changes"
          actions={
            total > 0 ? (
              <>
                <CopyButton value={changesText} label="Copy changes" />
                <CopyButton value={patchText} label="Copy JSON Patch" />
              </>
            ) : undefined
          }
        >
          {!result ? (
            <PaneEmpty icon={<GitCompare size={20} aria-hidden="true" />} title="Enter two documents to compare" hint="Changes appear here as you type." />
          ) : total === 0 ? (
            <PaneEmpty title="No differences" hint="The two documents have the same values." />
          ) : (
            <>
              <ul aria-label="Changes">
                {shown.slice(0, MAX_ROWS).map((change, index) => <ChangeRow key={`${change.path}-${index}`} change={change} />)}
              </ul>
              {shown.length > MAX_ROWS && (
                <p className="px-4 py-2 text-xs text-muted-foreground">
                  Showing the first {MAX_ROWS.toLocaleString()} of {shown.length.toLocaleString()} changes. Use Copy changes to get all of them.
                </p>
              )}
            </>
          )}
        </EditorPane>
      }
      status={
        <>
          {leftSide?.ok && rightSide?.ok && <span>{leftSide.format === rightSide.format ? leftSide.format.toUpperCase() : `${leftSide.format.toUpperCase()} and ${rightSide.format.toUpperCase()}`}</span>}
          {errors.length > 0 ? (
            <span className="text-destructive">Invalid input</span>
          ) : result ? (
            total === 0 ? (
              <span className="text-success">No differences</span>
            ) : (
              <span>
                <span className="text-success">{result.counts.added} added</span>·
                <span className="text-destructive">{result.counts.removed} removed</span>·
                <span className="text-warning">{result.counts.changed} changed</span>·
                <span className="text-warning">{result.counts.type} type changed</span>
              </span>
            )
          ) : (
            <span>Ready</span>
          )}
        </>
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
