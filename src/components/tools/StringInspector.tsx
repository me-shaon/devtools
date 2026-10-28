import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useState } from "react";
import { ScanText, TriangleAlert } from "lucide-react";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import {
  findNormalizationVariants,
  getNormalizedForms,
  getStringStats,
  inspectCharacters,
  stripFlaggedCharacters,
  type CharFlag,
  type CharInfo,
  type LineEnding,
} from "@/utils/string-inspector";

const CHAR_LIMIT = 500;

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Why do Characters and UTF-16 code units differ?",
    a: "Characters counts what a reader sees (grapheme clusters). A family emoji built with zero-width joiners is one character but many code units. JavaScript `length` reports UTF-16 code units, and databases often limit UTF-8 bytes.",
  },
  {
    q: "Which characters are flagged?",
    a: "Zero-width characters, the byte order mark, no-break and other unusual spaces, bidirectional controls such as RLO, and control characters. These can break comparisons, identifiers, and parsers without being visible.",
  },
  {
    q: "Why are there no Unicode character names?",
    a: "The full Unicode name list is large and the tool runs offline, so only hard-to-see characters get a name. Every character shows its code point, category, and UTF-8 bytes.",
  },
  {
    q: "What does the Normalization section show?",
    a: "Unicode can write one character in more than one way. For example, `é` can be U+00E9 or `e` followed by U+0301. The section shows if the text is already in NFC, NFD, NFKC, and NFKD, and the length of each form. Copy a form to make comparisons and lookups match.",
  },
  {
    q: "Why do two strings that look the same not compare equal?",
    a: "One string can use a composed character and the other a base letter plus a combining mark. The tool warns when your text writes the same character in two ways. Copy the NFC form to use one spelling.",
  },
];

const FLAG_TEXT: Record<CharFlag, string> = {
  invisible: "Invisible",
  control: "Control",
  bidi: "Bidi control",
};

const LINE_ENDING_TEXT: Record<LineEnding, string> = {
  none: "None",
  LF: "LF (Unix)",
  CRLF: "CRLF (Windows)",
  CR: "CR (classic Mac)",
  mixed: "Mixed",
};

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

function CharRow({ info }: { info: CharInfo }) {
  return (
    <div
      role="row"
      className={`grid grid-cols-[4.5rem_5.5rem_1fr_auto] items-center gap-3 border-b border-border/50 px-4 py-1.5 text-xs ${info.flag ? "bg-warning/10" : ""}`}
    >
      <span role="cell" className={`truncate font-mono ${info.display !== info.char ? "text-2xs text-muted-foreground" : "text-sm"}`}>
        {info.display}
      </span>
      <span role="cell" className="font-mono">{info.hex}</span>
      <span role="cell" className="min-w-0">
        <span className="block truncate">
          {info.flag && <span className="mr-1 font-medium text-warning">{FLAG_TEXT[info.flag]}</span>}
          {info.label ?? info.category}
        </span>
        <span className="block font-mono text-2xs text-muted-foreground">
          {info.utf8}
          {info.flag && ` · first at line ${info.firstLine}, column ${info.firstColumn}`}
        </span>
      </span>
      <span role="cell" className="text-right font-mono text-muted-foreground">×{info.count.toLocaleString()}</span>
    </div>
  );
}

export function StringInspector() {
  const [input, setInput] = useState("");
  const text = useDebouncedValue(input);

  const result = useMemo(() => {
    if (!text) return null;
    return { stats: getStringStats(text), chars: inspectCharacters(text, CHAR_LIMIT) };
  }, [text]);

  const normalization = useMemo(
    () => (text ? { forms: getNormalizedForms(text), check: findNormalizationVariants(text) } : null),
    [text],
  );
  const variants = normalization?.check.variants ?? [];

  const cleaned = useMemo(() => (result?.chars.flaggedCount ? stripFlaggedCharacters(text) : ""), [result, text]);

  const statRows: [string, string][] = result
    ? [
        ["Characters", result.stats.graphemes.toLocaleString()],
        ["UTF-16 units", result.stats.codeUnits.toLocaleString()],
        ["Code points", result.stats.codePoints.toLocaleString()],
        ["UTF-8 bytes", result.stats.bytes.toLocaleString()],
        ["Words", result.stats.words.toLocaleString()],
        ["Lines", result.stats.lines.toLocaleString()],
        ["Sentences", result.stats.sentences.toLocaleString()],
        ["Whitespace", result.stats.whitespace.toLocaleString()],
        ["Longest line", `${plural(result.stats.longestLine, "character")} (line ${result.stats.longestLineNumber.toLocaleString()})`],
        ["Line endings", LINE_ENDING_TEXT[result.stats.lineEnding]],
      ]
    : [];

  const statsJson = result ? JSON.stringify(result.stats, null, 2) : "";
  const flagged = result?.chars.flagged ?? [];

  return (
    <ToolWorkspace
      id="string-inspector"
      toolbar={
        <>
          <CopyButton value={statsJson} label="Copy stats" />
          {cleaned && <CopyButton value={cleaned} label="Copy without flagged characters" />}
        </>
      }
      first={
        <EditorPane
          title="Text"
          htmlFor="string-inspector-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea
            id="string-inspector-input"
            placeholder="Paste text to count characters and find hidden ones"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane title="Inspection">
          {result ? (
            <div className="result-list">
              {flagged.length > 0 && (
                <div className="pane-options text-warning" role="status">
                  <TriangleAlert size={14} aria-hidden="true" />
                  <span>
                    {plural(result.chars.flaggedCount, "hidden or control character")} found:{" "}
                    {flagged.slice(0, 6).map((c) => `${c.abbr ?? c.hex} ×${c.count}`).join(", ")}
                    {flagged.length > 6 && ` and ${flagged.length - 6} more`}
                  </span>
                </div>
              )}
              {variants.length > 0 && (
                <div className="pane-options text-warning" role="status">
                  <TriangleAlert size={14} aria-hidden="true" />
                  <span>
                    {plural(variants.length, "character")} written in more than one way:{" "}
                    {variants.slice(0, 3).map((v) => `${v.nfc} (${v.spellings.map((cps) => cps.join(" ")).join(" or ")})`).join(", ")}
                    {variants.length > 3 && ` and ${variants.length - 3} more`}. They look the same but do not compare equal. Copy the NFC form to use one spelling.
                  </span>
                </div>
              )}
              {statRows.map(([label, value]) => (
                <div key={label} className="result-row">
                  <span className="result-row-label">{label}</span>
                  <span className="result-row-value">{value}</span>
                  <span />
                </div>
              ))}
              <div className="pane-options">
                <span className="font-medium">Normalization</span>
              </div>
              {normalization?.check.truncated && (
                <div className="pane-options text-muted-foreground">
                  The check for characters written in more than one way covered only the first{" "}
                  {normalization.check.checked.toLocaleString()} characters.
                </div>
              )}
              {normalization?.forms.map((f) => (
                <div key={f.form} className="result-row">
                  <span className="result-row-label">{f.form}</span>
                  <span className="result-row-value">
                    {f.same ? "Same as input" : "Differs from input"} · {plural(f.codePoints, "code point")}, {plural(f.codeUnits, "UTF-16 unit")},{" "}
                    {plural(f.bytes, "byte")}
                  </span>
                  <CopyButton value={f.value} iconOnly label={`Copy ${f.form}`} />
                </div>
              ))}
              <div className="pane-options">
                <span className="font-medium" id="string-inspector-chars">
                  Characters ({result.chars.distinct.toLocaleString()} distinct)
                </span>
              </div>
              {result.chars.truncated && (
                <div className="pane-options text-muted-foreground">
                  Showing the first {CHAR_LIMIT} distinct characters. Flagged characters past this point are still counted above.
                </div>
              )}
              <div role="table" aria-labelledby="string-inspector-chars">
                {result.chars.chars.map((info) => (
                  <CharRow key={info.codePoint} info={info} />
                ))}
              </div>
            </div>
          ) : (
            <PaneEmpty
              icon={<ScanText size={20} aria-hidden="true" />}
              title="Statistics appear here"
              hint="Hidden characters such as zero-width spaces are flagged."
            />
          )}
        </EditorPane>
      }
      status={
        result ? (
          <>
            <span>{plural(result.stats.graphemes, "character")}</span>
            <span>{plural(result.stats.bytes, "byte")}</span>
            {result.chars.flaggedCount > 0 ? (
              <span className="text-warning">{result.chars.flaggedCount.toLocaleString()} flagged</span>
            ) : (
              <span className="text-success">No hidden characters</span>
            )}
          </>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
