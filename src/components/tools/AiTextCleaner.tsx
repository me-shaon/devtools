import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { DEFAULT_CLEAN_OPTIONS, cleanText, type ChangeKind, type CleanOptions, type EmDashStyle } from "@/utils/ai-text-cleaner";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which invisible characters are removed?",
    a: "Zero-width spaces and joiners, the word joiner, the byte order mark, soft hyphens, bidirectional marks, embeddings, and isolates, stray variation selectors, and tag characters. Joiners and selectors inside emoji sequences such as family or flag emoji are kept, and so are joiners inside words in scripts such as Persian or Hindi.",
  },
  {
    q: "Is text inside code changed?",
    a: "Markdown and citation removal skip fenced code blocks and inline code. Quote, dash, space, and invisible character options apply everywhere, because curly quotes and hidden characters also break code.",
  },
  {
    q: "Which citation markers are removed?",
    a: "Numeric markers such as `[1]`, `[1, 2]`, and `[1][2]`, ChatGPT markers such as `【4†source】` and `:contentReference[oaicite:0]{index=0}`, and private-use cite markers. Index expressions such as `arr[1] = x` are left alone.",
  },
  {
    q: "Can I run the cleaner twice?",
    a: "Yes. The options give the same result when you clean text that is already clean, so a second pass reports no changes.",
  },
];

const CHANGE_NAMES: Record<ChangeKind, string> = {
  invisible: "Invisible",
  spaces: "Spaces",
  citations: "Citations",
  markdown: "Markdown",
  quotes: "Quotes",
  dashes: "Dashes",
  ellipsis: "Ellipses",
  whitespace: "Whitespace",
};

type BooleanOption = Exclude<keyof CleanOptions, "emDashStyle">;

const PRIMARY_OPTIONS: { key: BooleanOption; label: string }[] = [
  { key: "invisible", label: "Remove invisible characters" },
  { key: "spaces", label: "Normalize spaces" },
  { key: "quotes", label: "Straighten quotes" },
  { key: "ellipsis", label: "Expand ellipses" },
  { key: "citations", label: "Remove citations" },
  { key: "whitespace", label: "Trim whitespace" },
];

export function AiTextCleaner() {
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<CleanOptions>(DEFAULT_CLEAN_OPTIONS);
  const text = useDebouncedValue(input);

  const result = useMemo(() => (text ? cleanText(text, options) : null), [text, options]);

  const set = <K extends keyof CleanOptions>(key: K, value: CleanOptions[K]) => setOptions((current) => ({ ...current, [key]: value }));

  const option = (key: BooleanOption, label: string, disabled = false) => {
    const id = `ai-text-cleaner-${key}`;
    return (
      <label key={key} className="option-switch" htmlFor={id}>
        {label}
        <Switch id={id} checked={options[key]} onCheckedChange={(on) => set(key, on)} disabled={disabled} />
      </label>
    );
  };

  return (
    <ToolWorkspace
      id="ai-text-cleaner"
      toolbar={<>{PRIMARY_OPTIONS.map((o) => option(o.key, o.label))}</>}
      secondaryToolbar={
        <>
          {option("dashes", "Replace dashes")}
          <Tabs value={options.emDashStyle} onValueChange={(v) => set("emDashStyle", v as EmDashStyle)}>
            <TabsList aria-label="Em dash replacement">
              <TabsTrigger value="spaced" disabled={!options.dashes}>Em dash as “ - ”</TabsTrigger>
              <TabsTrigger value="double" disabled={!options.dashes}>Em dash as “--”</TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="indent-control">{option("markdown", "Remove Markdown")}</span>
          {option("markdownLists", "Remove list markers", !options.markdown)}
        </>
      }
      first={
        <EditorPane
          title="Text"
          htmlFor="ai-text-cleaner-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea
            id="ai-text-cleaner-input"
            placeholder="Paste text copied from an AI chat or a document"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane
          title="Cleaned"
          htmlFor={result ? "ai-text-cleaner-output" : undefined}
          scroll={false}
          actions={<CopyButton value={result?.output ?? ""} label="Copy" ariaLabel="Copy cleaned text" />}
        >
          {result ? (
            <>
              <CodeTextarea id="ai-text-cleaner-output" value={result.output} readOnly />
              <div className="max-h-[40%] shrink-0 overflow-auto border-t border-border">
                <div className="result-list">
                  <div className="pane-options">
                    <span className="font-medium" id="ai-text-cleaner-changes">Changes</span>
                  </div>
                  {result.changes.length === 0 ? (
                    <div className="pane-options text-muted-foreground">No changes needed with the current options.</div>
                  ) : (
                    <div role="table" aria-labelledby="ai-text-cleaner-changes">
                      {result.changes.map((change) => (
                        <div key={change.kind} className="result-row" role="row">
                          <span className="result-row-label" role="cell">{CHANGE_NAMES[change.kind]}</span>
                          <span className="result-row-value" role="cell">{change.label}</span>
                          <span role="cell" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <PaneEmpty
              icon={<Sparkles size={20} aria-hidden="true" />}
              title="Cleaned text appears here"
              hint="Hidden characters, curly quotes, and citation markers are removed as you type."
            />
          )}
        </EditorPane>
      }
      status={
        result ? (
          <>
            <span>
              {text.length.toLocaleString()} → {result.output.length.toLocaleString()} characters
            </span>
            <span>{result.total === 0 ? "No changes" : `${result.total.toLocaleString()} change${result.total === 1 ? "" : "s"}`}</span>
          </>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
