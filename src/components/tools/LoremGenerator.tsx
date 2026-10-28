import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { MAX_COUNT, formatItems, generateItems, type LoremFormat, type LoremKind } from "@/utils/lorem";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which fake data can I make?",
    a: "Titles, full names, emails, and URLs. The names come from a small built-in list. Everything is made on your device.",
  },
  {
    q: "Are the emails and URLs real?",
    a: "No. They use `example.com`, `example.org`, and `example.net`. These domains are reserved for examples, so no message or request can reach a real person.",
  },
  {
    q: "Can I use the emails in a column with a unique constraint?",
    a: "Yes. The emails in one list are always unique. When a name repeats, the tool adds a number, such as `ana.lee2@example.com`.",
  },
  {
    q: "How do I paste the output into a fixture or a spreadsheet?",
    a: "Choose JSON array to get a list of strings for a JavaScript or JSON fixture. For a CSV column or a SQL script, use Text with titles, names, emails, or URLs. Text puts one item on each line.",
  },
  {
    q: "What does Regenerate do?",
    a: "It makes a new random list with the same options. The list also changes when you change an option.",
  },
];

const KIND_LABELS: Record<LoremKind, { tab: string; one: string; many: string }> = {
  paragraphs: { tab: "Paragraphs", one: "paragraph", many: "paragraphs" },
  sentences: { tab: "Sentences", one: "sentence", many: "sentences" },
  words: { tab: "Words", one: "word", many: "words" },
  titles: { tab: "Titles", one: "title", many: "titles" },
  names: { tab: "Names", one: "name", many: "names" },
  emails: { tab: "Emails", one: "email", many: "emails" },
  urls: { tab: "URLs", one: "URL", many: "URLs" },
};

const DEFAULT_COUNTS: Record<LoremKind, number> = {
  paragraphs: 3,
  sentences: 5,
  words: 50,
  titles: 10,
  names: 10,
  emails: 10,
  urls: 10,
};

const LOREM_KINDS = new Set<LoremKind>(["paragraphs", "sentences", "words"]);

const parseCount = (text: string, fallback: number) => {
  const value = Number.parseInt(text, 10);
  return Number.isNaN(value) ? fallback : Math.min(Math.max(value, 1), MAX_COUNT);
};

export function LoremGenerator() {
  const [kind, setKind] = useState<LoremKind>("paragraphs");
  const [countText, setCountText] = useState<Record<LoremKind, string>>(
    () => Object.fromEntries(Object.entries(DEFAULT_COUNTS).map(([k, v]) => [k, String(v)])) as Record<LoremKind, string>,
  );
  const [format, setFormat] = useState<LoremFormat>("text");
  const [startWithLorem, setStartWithLorem] = useState(true);
  const [nonce, setNonce] = useState(0);

  const count = parseCount(countText[kind], DEFAULT_COUNTS[kind]);
  const lorem = LOREM_KINDS.has(kind);

  const output = useMemo(
    () => formatItems(generateItems(kind, count, { startWithLorem: lorem && startWithLorem }), kind, format),
    // The nonce makes Regenerate draw a new list with the same options.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [kind, count, startWithLorem, lorem, format, nonce],
  );

  const setCount = (value: string) => setCountText((current) => ({ ...current, [kind]: value }));
  const label = KIND_LABELS[kind];

  return (
    <ToolWorkspace
      id="lorem-generator"
      toolbar={
        <>
          <Tabs value={kind} onValueChange={(v) => setKind(v as LoremKind)}>
            <TabsList aria-label="Content">
              {(Object.keys(KIND_LABELS) as LoremKind[]).map((k) => (
                <TabsTrigger key={k} value={k}>{KIND_LABELS[k].tab}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <button type="button" className="toolbar-text-button indent-control" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw size={14} aria-hidden="true" />
            Regenerate
          </button>
        </>
      }
      first={
        <EditorPane title="Options">
          <div className="pane-options">
            <label htmlFor="lorem-count" className="w-20 font-medium">Count</label>
            <Input
              id="lorem-count"
              type="number"
              min={1}
              max={MAX_COUNT}
              className="h-7 w-20 text-xs"
              value={countText[kind]}
              onChange={(e) => setCount(e.target.value)}
              onBlur={() => setCount(String(count))}
            />
            <span className="text-muted-foreground">1 to {MAX_COUNT.toLocaleString()} {label.many}</span>
          </div>
          <div className="pane-options">
            <span className="w-20 font-medium">Format</span>
            <Tabs value={format} onValueChange={(v) => setFormat(v as LoremFormat)}>
              <TabsList aria-label="Format">
                <TabsTrigger value="text">Text</TabsTrigger>
                <TabsTrigger value="json">JSON array</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {lorem && (
            <div className="pane-options">
              <label className="option-switch" htmlFor="lorem-start">
                Start with "Lorem ipsum"
                <Switch id="lorem-start" checked={startWithLorem} onCheckedChange={setStartWithLorem} />
              </label>
            </div>
          )}
        </EditorPane>
      }
      second={
        <EditorPane title="Output" htmlFor="lorem-output" scroll={false} actions={<CopyButton value={output} label="Copy all" />}>
          <CodeTextarea id="lorem-output" value={output} readOnly />
        </EditorPane>
      }
      status={
        <>
          <span>{count.toLocaleString()} {count === 1 ? label.one : label.many}</span>
          <span>{output.length.toLocaleString()} characters</span>
        </>
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
