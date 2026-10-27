import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type UIEvent } from "react";
import { Regex } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  MATCH_LIMIT,
  REGEX_FLAGS,
  compileRegex,
  highlightSegments,
  parseRegexLiteral,
  toggleFlag,
  type RegexFlag,
  type RegexMatch,
  type RegexResult,
} from "@/utils/regex";
import { runRegexInWorker } from "@/utils/regex-runner";

type Mode = "match" | "replace";

interface Preset {
  name: string;
  pattern: string;
  sample: string;
}

// Presets match whole lines, so applying one also turns on g and m.
const PRESETS: Preset[] = [
  { name: "Email", pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", sample: "ann@example.com\nnot-an-email\nbob.smith+tag@mail.co" },
  { name: "URL", pattern: "^https?:\\/\\/[\\w\\-]+(\\.[\\w\\-]+)+[/#?]?.*$", sample: "https://example.com/path?q=1\nftp://example.com\nhttp://localhost" },
  { name: "IPv4", pattern: "^((25[0-5]|(2[0-4]|1\\d|[1-9]|)\\d)\\.?\\b){4}$", sample: "192.168.0.1\n256.1.1.1\n10.0.0.255" },
  { name: "Hex color", pattern: "^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$", sample: "#1e90ff\n#abc\n#12345g" },
  { name: "Date (YYYY-MM-DD)", pattern: "^(?<year>\\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\\d|3[01])$", sample: "2024-05-17\n2024-13-01\n1999-12-31" },
  { name: "Username", pattern: "^[a-zA-Z0-9_]{3,16}$", sample: "dev_user\nab\nthis_name_is_far_too_long" },
  { name: "Strong password", pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$", sample: "Secr3t!pass\npassword\nSHORT1!a" },
  { name: "Credit card", pattern: "^\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}$", sample: "4111 1111 1111 1111\n4111-1111-1111-1111\n1234" },
  { name: "Phone (US)", pattern: "^\\+1\\s?\\(\\d{3}\\)\\s?\\d{3}[- ]?\\d{4}$", sample: "+1 (555) 123-4567\n555-1234" },
  { name: "Time (24h)", pattern: "^([01]?\\d|2[0-3]):[0-5]\\d$", sample: "09:30\n23:59\n24:00" },
];

const FLAG_LABELS: Record<RegexFlag, string> = {
  g: "Global: find every match",
  i: "Ignore case",
  m: "Multiline: ^ and $ match at each line",
  s: "Dot all: . also matches line breaks",
  u: "Unicode: read code points and allow \\p{…}",
};

const CHEAT_SHEET: [string, string][] = [
  [".", "Any character except a line break"],
  ["\\d \\w \\s", "Digit, word character, whitespace"],
  ["\\D \\W \\S", "Not a digit, word character, whitespace"],
  ["[abc] [^abc]", "One of a, b, c / none of them"],
  ["^ $", "Start / end of text (of line with m)"],
  ["\\b", "Word boundary"],
  ["* + ?", "0 or more, 1 or more, 0 or 1"],
  ["{2,5}", "2 to 5 times"],
  ["*? +?", "As few as possible (lazy)"],
  ["(…)", "Capture group"],
  ["(?<name>…)", "Named capture group"],
  ["(?:…)", "Group without capture"],
  ["a|b", "a or b"],
  ["(?=…) (?!…)", "Followed by / not followed by"],
  ["(?<=…) (?<!…)", "Preceded by / not preceded by"],
  ["\\1 \\k<name>", "Same text as a group again"],
  ["$1 $<name>", "Replace: text of a group"],
  ["$&", "Replace: the whole match"],
  ["$` $'", "Replace: text before / after the match"],
  ["$$", "Replace: a literal $"],
];

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which regex syntax does this use?",
    a: "It uses the JavaScript RegExp engine, the same one browsers and Node.js use. Syntax from PCRE, Python, or Go mostly works. Features such as possessive quantifiers and inline flags like (?i) do not.",
  },
  {
    q: "What do the flags mean?",
    a: "g finds every match instead of only the first. i ignores letter case. m makes ^ and $ match at each line. s lets the dot match line breaks. u reads the text as code points and allows \\p{…} classes.",
  },
  {
    q: "How do I use groups in the replacement?",
    a: "Write $1 for the text of group 1 and $<name> for a named group. $& is the whole match, and $$ is a literal dollar sign. Without the g flag, only the first match is replaced.",
  },
  {
    q: "Why does a group show as not matched?",
    a: "The group is in an optional or alternative part of the pattern that the match did not use. JavaScript reports such a group as undefined, and the replacement inserts nothing for it.",
  },
  {
    q: "What happens with a very slow pattern?",
    a: "The tester runs the pattern in the background and stops it after 2 seconds. It also stops after 1,000 matches. Nested quantifiers such as (a+)+ cause most slow patterns.",
  },
  {
    q: "Can I paste a regex literal?",
    a: "Yes. Paste a literal such as /\\d+/gi into the empty pattern field. The tester puts the pattern in the field and turns on the flags. The Copy button gives you the literal back.",
  },
  {
    q: "Are the presets guaranteed validators?",
    a: "No. They are starting points for common formats. Each preset matches whole lines, so it turns on the g and m flags and tests every line of the text.",
  },
];

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "es"}`;

function MatchList({ matches }: { matches: RegexMatch[] }) {
  return (
    <ol className="regex-matches" aria-label="Matches">
      {matches.map((match, i) => (
        <li key={`${match.index}-${i}`}>
          <div className="regex-match-head">
            <span>Match {i + 1}</span>
            <span>{match.index === match.end ? `at ${match.index}` : `${match.index}–${match.end}`}</span>
          </div>
          <code className="regex-match-value">{match.value || <span className="regex-empty-value">empty</span>}</code>
          {match.groups.length > 0 && (
            <dl className="regex-groups">
              {match.groups.map((group) => (
                <div key={group.number} className="contents">
                  <dt>{group.name ? `${group.number} ${group.name}` : group.number}</dt>
                  <dd>
                    {group.value === undefined ? (
                      <span className="regex-empty-value">not matched</span>
                    ) : (
                      group.value || <span className="regex-empty-value">empty</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ol>
  );
}

function CheatSheet() {
  return (
    <details className="tool-help">
      <summary>Cheat sheet</summary>
      <dl className="tool-help-content regex-cheatsheet">
        {CHEAT_SHEET.map(([token, meaning]) => (
          <div key={token}>
            <dt>{token}</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function RegexGenerator() {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("g");
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("match");
  const [replacement, setReplacement] = useState("");
  const [result, setResult] = useState<RegexResult | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const livePattern = useDebouncedValue(pattern);
  const text = useDebouncedValue(input);
  const liveReplacement = useDebouncedValue(replacement);
  const replacing = mode === "replace";

  useEffect(() => {
    if (!livePattern) {
      setResult(null);
      return;
    }
    let current = true;
    runRegexInWorker({ pattern: livePattern, flags, text, replacement: replacing ? liveReplacement : undefined }).then((next) => {
      if (current && next) setResult(next);
    });
    return () => {
      current = false;
    };
  }, [livePattern, flags, text, replacing, liveReplacement]);

  const matches = useMemo(() => (result && "matches" in result ? result.matches : []), [result]);
  const error = result && "error" in result ? result.error : "";
  const segments = useMemo(() => highlightSegments(input, matches), [input, matches]);
  const groupCount = matches[0]?.groups.length ?? 0;

  // The copied literal escapes "/" so it works in source code.
  const compiled = compileRegex(pattern, flags);
  const literal = `/${compiled.ok ? compiled.regex.source : pattern}/${flags}`;

  const applyPreset = (name: string) => {
    const preset = PRESETS.find((p) => p.name === name);
    if (!preset) return;
    setPattern(preset.pattern);
    setFlags("gm");
    if (!input) setInput(preset.sample);
  };

  // A pasted literal such as /\d+/gi fills the pattern and the flags.
  const pastePattern = (event: ClipboardEvent<HTMLInputElement>) => {
    const field = event.currentTarget;
    if (field.selectionStart !== 0 || field.selectionEnd !== field.value.length) return;
    const parsed = parseRegexLiteral(event.clipboardData.getData("text"));
    if (!parsed) return;
    event.preventDefault();
    setPattern(parsed.pattern);
    setFlags(parsed.flags);
  };

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (!highlightRef.current) return;
    highlightRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };

  const truncatedNotice =
    result?.ok && result.truncated === "limit"
      ? `Showing the first ${MATCH_LIMIT.toLocaleString()} matches. Highlights and the list stop there.`
      : result?.ok && result.truncated === "time"
        ? `Matching took more than 1 second, so it stopped after ${plural(matches.length, "match")}.`
        : "";

  const notice = error ? (
    <div className="workspace-notice" data-tone="error" role="alert">{error}</div>
  ) : truncatedNotice ? (
    <div className="workspace-notice" role="status">{truncatedNotice}</div>
  ) : undefined;

  const matchesText = matches.map((m) => m.value).join("\n");

  let second;
  if (!pattern) {
    second = <PaneEmpty icon={<Regex size={20} aria-hidden="true" />} title="Enter a pattern" hint="Matches and groups appear here as you type." />;
  } else if (replacing) {
    second = result?.ok && result.replaced !== undefined ? (
      <CodeTextarea id="regex-output" value={result.replaced} readOnly />
    ) : (
      <PaneEmpty title="Replaced text appears here" />
    );
  } else if (result?.ok && matches.length > 0) {
    second = <MatchList matches={matches} />;
  } else {
    second = <PaneEmpty title={error ? "Fix the pattern to see matches" : "No matches"} />;
  }

  return (
    <ToolWorkspace
      id="regex-generator"
      toolbar={
        <>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList aria-label="Mode">
              <TabsTrigger value="match">Match</TabsTrigger>
              <TabsTrigger value="replace">Replace</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="layout-switch" role="group" aria-label="Flags">
            {REGEX_FLAGS.map((flag) => (
              <button
                key={flag}
                type="button"
                className="font-mono"
                aria-pressed={flags.includes(flag)}
                aria-label={FLAG_LABELS[flag]}
                title={FLAG_LABELS[flag]}
                onClick={() => setFlags(toggleFlag(flags, flag))}
              >
                {flag}
              </button>
            ))}
          </div>
          <label className="indent-control">
            Preset
            <select aria-label="Preset" value="" onChange={(e) => applyPreset(e.target.value)}>
              <option value="" disabled>Choose…</option>
              {PRESETS.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
        </>
      }
      secondaryToolbar={
        <div className="regex-fields">
          <div className="regex-field">
            <label htmlFor="regex-pattern" className="sr-only">Pattern</label>
            <span aria-hidden="true">/</span>
            <Input
              id="regex-pattern"
              className="h-7 text-xs font-mono"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              onPaste={pastePattern}
              placeholder="Enter regex pattern, e.g. (\d+)-(\w+)"
              aria-invalid={Boolean(error)}
              autoComplete="off"
              spellCheck={false}
            />
            <span aria-hidden="true">/{flags}</span>
            <CopyButton value={pattern ? literal : ""} label="Copy" ariaLabel="Copy pattern as a regex literal" iconOnly />
          </div>
          {replacing && (
            <label className="regex-field" htmlFor="regex-replacement">
              <span className="whitespace-nowrap">Replace with</span>
              <Input
                id="regex-replacement"
                className="h-7 text-xs font-mono"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="e.g. $2: $1 or $<name>"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          )}
        </div>
      }
      notice={notice}
      first={
        <EditorPane
          title="Test text"
          htmlFor="regex-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <div className="regex-editor">
            <div ref={highlightRef} className="code-textarea regex-highlights" aria-hidden="true" data-testid="regex-highlights">
              {segments.map((segment, i) =>
                segment.match === undefined ? (
                  segment.text
                ) : (
                  <mark key={i} className="regex-mark" data-alt={segment.match % 2 === 1}>{segment.text}</mark>
                ),
              )}
              {/* A trailing line break needs a character after it to take up a line. */}
              {"​"}
            </div>
            <CodeTextarea
              id="regex-input"
              placeholder="Enter text to test against the pattern"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onScroll={syncScroll}
            />
          </div>
        </EditorPane>
      }
      second={
        <EditorPane
          title={replacing ? "Replaced text" : `Matches${result?.ok ? ` (${matches.length.toLocaleString()})` : ""}`}
          htmlFor={replacing && result?.ok ? "regex-output" : undefined}
          scroll={!replacing}
          actions={
            replacing ? (
              <CopyButton value={result?.ok ? (result.replaced ?? "") : ""} label="Copy" ariaLabel="Copy replaced text" />
            ) : (
              <CopyButton value={matchesText} label="Copy" ariaLabel="Copy matches, one per line" />
            )
          }
        >
          {second}
        </EditorPane>
      }
      status={
        pattern && result?.ok ? (
          <span>
            {plural(matches.length, "match")}
            {groupCount > 0 && ` · ${groupCount} ${groupCount === 1 ? "group" : "groups"}`}
          </span>
        ) : (
          <span>Ready</span>
        )
      }
      help={
        <>
          <CheatSheet />
          <ToolFaqSection items={FAQ_ITEMS} />
        </>
      }
    />
  );
}
