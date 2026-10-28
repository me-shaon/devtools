import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { CASE_TYPES, convertToAllCases, slugLines, type SlugSeparator } from "@/utils/case";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "How does the tool find the words?",
    a: "Spaces, underscores, hyphens, dots, and other symbols separate words. A capital letter starts a new word. A run of capitals is one word, so `HTTPServerID` becomes `http`, `server`, and `id`.",
  },
  {
    q: "How are plurals and numbers handled?",
    a: "A capital run that ends in a lowercase s is one plural word, so `userIDs` becomes `user_ids`. Digits stay with the word before them, so `base64Encode` becomes `base64_encode`.",
  },
  {
    q: "What does Keep acronyms do?",
    a: "It keeps words that you wrote in capitals, such as `ID` or `URL`, in capitals. This applies to camelCase, PascalCase, Train-Case, Title Case, and Sentence case. `user_ID` becomes `UserID` instead of `UserId`. If the whole line is in capitals, no word counts as an acronym.",
  },
  {
    q: "Can I convert many names at once?",
    a: "Yes. Put one name on each line. The tool converts each line on its own and keeps blank lines.",
  },
  {
    q: "How is the slug made?",
    a: "The slug is for URLs. The tool removes accents, so `Crème Brûlée` becomes `creme-brulee`. It writes letters such as `ß` and `æ` as `ss` and `ae`. Other symbols become the separator. Letters with no ASCII form, such as CJK, are removed. Set Max length to cut the slug at a word boundary.",
  },
  {
    q: "Why do lowercase and UPPERCASE keep my punctuation?",
    a: "These two cases change only the letter case of your text. The other cases rebuild the text from its words, so they drop symbols.",
  },
];

// Lets a read-only result grow to show every line of a multi-line result.
const fitHeight = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

export function CaseConverter() {
  const [input, setInput] = useState("");
  const [keepAcronyms, setKeepAcronyms] = useState(false);
  const [slugSeparator, setSlugSeparator] = useState<SlugSeparator>("-");
  const [slugKeepCase, setSlugKeepCase] = useState(false);
  const [slugMaxLength, setSlugMaxLength] = useState("");
  const text = useDebouncedValue(input);
  const listRef = useRef<HTMLDivElement>(null);

  const outputs = useMemo(() => (text.trim() ? convertToAllCases(text, { keepAcronyms }) : null), [text, keepAcronyms]);
  const maxLength = Math.max(0, Math.floor(Number(slugMaxLength) || 0));
  const slug = useMemo(
    () => (text.trim() ? slugLines(text, { separator: slugSeparator, keepCase: slugKeepCase, maxLength }) : ""),
    [text, slugSeparator, slugKeepCase, maxLength],
  );
  const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;

  useEffect(() => {
    listRef.current?.querySelectorAll("textarea").forEach(fitHeight);
  }, [outputs, slug]);

  return (
    <ToolWorkspace
      id="case-converter"
      toolbar={
        <label className="option-switch" htmlFor="case-keep-acronyms">
          Keep acronyms
          <Switch id="case-keep-acronyms" checked={keepAcronyms} onCheckedChange={setKeepAcronyms} />
        </label>
      }
      first={
        <EditorPane
          title="Input"
          htmlFor="case-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea
            id="case-input"
            placeholder={"Enter a name or phrase, one per line (e.g., HTTPServerID, user_name)"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane title="Cases">
          <div className="result-list" ref={listRef}>
            {CASE_TYPES.map((type) => {
              const value = outputs?.[type] ?? "";
              return (
                <div key={type} className="result-row">
                  <label className="result-row-label" htmlFor={`case-out-${type}`}>{type}</label>
                  <textarea
                    id={`case-out-${type}`}
                    className="result-row-value code-textarea"
                    value={value}
                    readOnly
                    rows={1}
                    ref={fitHeight}
                  />
                  <CopyButton value={value} iconOnly label={`Copy ${type}`} />
                </div>
              );
            })}
            <div className="result-row">
              <label className="result-row-label" htmlFor="case-out-slug">slug</label>
              <textarea id="case-out-slug" className="result-row-value code-textarea" value={slug} readOnly rows={1} ref={fitHeight} />
              <CopyButton value={slug} iconOnly label="Copy slug" />
            </div>
            <div className="pane-options">
              <Tabs value={slugSeparator} onValueChange={(v) => setSlugSeparator(v as SlugSeparator)}>
                <TabsList aria-label="Slug separator">
                  <TabsTrigger value="-">Hyphen</TabsTrigger>
                  <TabsTrigger value="_">Underscore</TabsTrigger>
                </TabsList>
              </Tabs>
              <label className="option-switch" htmlFor="case-slug-keep-case">
                Keep case
                <Switch id="case-slug-keep-case" checked={slugKeepCase} onCheckedChange={setSlugKeepCase} />
              </label>
              <label className="option-switch" htmlFor="case-slug-max-length">
                Max length
                <Input
                  id="case-slug-max-length"
                  type="number"
                  min={0}
                  placeholder="None"
                  className="h-7 w-20 text-xs"
                  value={slugMaxLength}
                  onChange={(e) => setSlugMaxLength(e.target.value)}
                />
              </label>
            </div>
          </div>
        </EditorPane>
      }
      status={<span>{lineCount ? `${lineCount.toLocaleString()} ${lineCount === 1 ? "line" : "lines"}` : "Ready"}</span>}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
