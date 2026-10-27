import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import {
  decodeBackslash,
  decodeHex,
  decodeHtml,
  decodeUnicode,
  encodeBackslash,
  encodeHex,
  encodeHtml,
  encodeUnicode,
  type EscapeResult,
} from "@/utils/escape";

type Mode = "html" | "backslash" | "unicode" | "hex";
type Direction = "encode" | "decode";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Is decoding HTML safe for untrusted input?",
    a: "Yes. The decoder replaces character references such as `&lt;` and `&#x1F600;` with plain text. It never parses markup or runs scripts. Unknown entity names are left as written.",
  },
  {
    q: "What is the difference between Backslash and Unicode?",
    a: "Backslash escapes quotes, backslashes, and control characters so text fits in a JavaScript or JSON string. Unicode writes non-ASCII characters as `\\uXXXX` so the text is pure ASCII.",
  },
  {
    q: "Which hex formats can I decode?",
    a: "Plain digits such as `48656c6c6f`, bytes split by spaces, colons, commas, or dashes, and bytes with `0x` or `\\x` prefixes. The bytes must be valid UTF-8.",
  },
];

const MODE_LABELS: Record<Mode, string> = {
  html: "HTML entities",
  backslash: "Backslash",
  unicode: "Unicode",
  hex: "Hex",
};

const PLACEHOLDERS: Record<Mode, Record<Direction, string>> = {
  html: { encode: 'Enter text to escape (e.g., <a href="x">Tom & Jerry</a>)', decode: "Enter HTML entities (e.g., &lt;p&gt;caf&eacute; &#x1F600;&lt;/p&gt;)" },
  backslash: { encode: 'Enter text to escape (e.g., He said "hi"\\n)', decode: "Enter an escaped string (e.g., line 1\\nline 2\\t\\u00e9)" },
  unicode: { encode: "Enter text to escape (e.g., café 😀)", decode: "Enter Unicode escapes (e.g., caf\\u00e9 \\u{1F600})" },
  hex: { encode: "Enter text to convert to hex (e.g., Hello)", decode: "Enter hex bytes (e.g., 48 65 6c 6c 6f)" },
};

export function EscapeTools() {
  const [mode, setMode] = useState<Mode>("html");
  const [direction, setDirection] = useState<Direction>("encode");
  const [input, setInput] = useState("");
  const [htmlNonAscii, setHtmlNonAscii] = useState(false);
  const [unicodeBraces, setUnicodeBraces] = useState(false);
  const [unicodeAll, setUnicodeAll] = useState(false);
  const [hexSpaced, setHexSpaced] = useState(true);
  const [hexUpper, setHexUpper] = useState(false);
  const text = useDebouncedValue(input);

  const result = useMemo<EscapeResult>(() => {
    if (!text) return { ok: true, value: "" };
    const encode = direction === "encode";
    switch (mode) {
      case "html":
        return encode ? { ok: true, value: encodeHtml(text, { nonAscii: htmlNonAscii }) } : { ok: true, value: decodeHtml(text) };
      case "backslash":
        return encode ? { ok: true, value: encodeBackslash(text) } : decodeBackslash(text);
      case "unicode":
        return encode ? { ok: true, value: encodeUnicode(text, { braces: unicodeBraces, all: unicodeAll }) } : decodeUnicode(text);
      case "hex":
        return encode ? { ok: true, value: encodeHex(text, { spaced: hexSpaced, uppercase: hexUpper }) } : decodeHex(text);
    }
  }, [text, mode, direction, htmlNonAscii, unicodeBraces, unicodeAll, hexSpaced, hexUpper]);

  const output = "value" in result ? result.value : "";
  const error = "error" in result ? result.error : "";
  const encoding = direction === "encode";
  const outputTitle = encoding ? "Escaped" : "Unescaped";

  // Move the result into the input and reverse the direction
  const swap = () => {
    setInput(output);
    setDirection(encoding ? "decode" : "encode");
  };

  const option = (id: string, label: string, checked: boolean, onChange: (next: boolean) => void) => (
    <label className="option-switch indent-control" htmlFor={id}>
      {label}
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  );

  return (
    <ToolWorkspace
      id="escape-tools"
      toolbar={
        <>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList aria-label="Format">
              {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
                <TabsTrigger key={m} value={m}>{MODE_LABELS[m]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Tabs value={direction} onValueChange={(v) => setDirection(v as Direction)} className="indent-control">
            <TabsList aria-label="Direction">
              <TabsTrigger value="encode">Encode</TabsTrigger>
              <TabsTrigger value="decode">Decode</TabsTrigger>
            </TabsList>
          </Tabs>
          {encoding && mode === "html" && option("escape-html-non-ascii", "Non-ASCII as entities", htmlNonAscii, setHtmlNonAscii)}
          {encoding && mode === "unicode" && (
            <>
              {option("escape-unicode-braces", "Use \\u{…}", unicodeBraces, setUnicodeBraces)}
              {option("escape-unicode-all", "Escape ASCII too", unicodeAll, setUnicodeAll)}
            </>
          )}
          {encoding && mode === "hex" && (
            <>
              {option("escape-hex-spaced", "Space between bytes", hexSpaced, setHexSpaced)}
              {option("escape-hex-upper", "Uppercase", hexUpper, setHexUpper)}
            </>
          )}
          <button type="button" className="toolbar-text-button" onClick={swap} disabled={!output}>
            Swap
          </button>
        </>
      }
      notice={error ? <div className="workspace-notice" data-tone="error" role="alert">{error}</div> : undefined}
      first={
        <EditorPane
          title={encoding ? "Text" : mode === "hex" ? "Hex" : "Escaped text"}
          htmlFor="escape-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea id="escape-input" placeholder={PLACEHOLDERS[mode][direction]} value={input} onChange={(e) => setInput(e.target.value)} />
        </EditorPane>
      }
      second={
        <EditorPane
          title={outputTitle}
          htmlFor={output ? "escape-output" : undefined}
          scroll={false}
          actions={<CopyButton value={output} label="Copy" ariaLabel={`Copy ${outputTitle.toLowerCase()} text`} />}
        >
          {output ? <CodeTextarea id="escape-output" value={output} readOnly /> : <PaneEmpty title={`${outputTitle} text appears here`} />}
        </EditorPane>
      }
      status={
        error ? (
          <span className="text-destructive">Invalid input</span>
        ) : output ? (
          <span>{text.length.toLocaleString()} → {output.length.toLocaleString()} characters</span>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
