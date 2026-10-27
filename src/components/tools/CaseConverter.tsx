import { useEffect, useMemo, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { CASE_TYPES, convertToAllCases } from "@/utils/case";

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
  const text = useDebouncedValue(input);
  const listRef = useRef<HTMLDivElement>(null);

  const outputs = useMemo(() => (text.trim() ? convertToAllCases(text, { keepAcronyms }) : null), [text, keepAcronyms]);
  const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;

  useEffect(() => {
    listRef.current?.querySelectorAll("textarea").forEach(fitHeight);
  }, [outputs]);

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
          </div>
        </EditorPane>
      }
      status={<span>{lineCount ? `${lineCount.toLocaleString()} ${lineCount === 1 ? "line" : "lines"}` : "Ready"}</span>}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
