import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  CHARACTER_SETS,
  LENGTH_LIMITS,
  MAX_COUNT,
  alphabetForMode,
  buildAlphabet,
  entropyForOptions,
  generateRandomStrings,
  isByteMode,
  validateAlphabet,
  type CharacterSet,
  type RandomStringMode,
} from "@/utils/random-string";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What is a Nano ID?",
    a: "A Nano ID is a short random identifier. The default uses 21 characters from A-Z, a-z, 0-9, _ and -. That gives about 126 bits of entropy, which is close to a UUID v4, in a shorter and URL-safe string.",
  },
  {
    q: "Are these strings safe to use as tokens?",
    a: "Yes. The tool uses the Web Crypto random source. It discards random values that do not map evenly to the alphabet, so every character has the same probability. 128 bits or more is a good minimum for secret tokens.",
  },
  {
    q: "What does the entropy value mean?",
    a: "Entropy is the number of random bits in one string. Each extra bit doubles the number of possible values. The prefix is fixed text, so it does not add entropy.",
  },
  {
    q: "Why do Hex and Base64URL use bytes for the length?",
    a: "These modes encode random bytes. One byte gives 2 hex characters or about 1.33 Base64URL characters. The entropy is always 8 bits for each byte.",
  },
  {
    q: "Are the strings sent anywhere?",
    a: "No. The strings are made on your device and stay there.",
  },
];

const SET_LABELS: Record<CharacterSet, string> = {
  lowercase: "Lowercase",
  uppercase: "Uppercase",
  digits: "Digits",
  symbols: "Symbols",
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const parseWhole = (text: string, fallback: number, min: number, max: number) => {
  const value = Number.parseInt(text, 10);
  return Number.isNaN(value) ? fallback : clamp(value, min, max);
};

export function RandomString() {
  const [mode, setMode] = useState<RandomStringMode>("nanoid");
  const [lengthText, setLengthText] = useState<Record<RandomStringMode, string>>({
    nanoid: String(LENGTH_LIMITS.nanoid.fallback),
    custom: String(LENGTH_LIMITS.custom.fallback),
    hex: String(LENGTH_LIMITS.hex.fallback),
    base64url: String(LENGTH_LIMITS.base64url.fallback),
  });
  const [countText, setCountText] = useState("5");
  const [prefix, setPrefix] = useState("");
  const [sets, setSets] = useState<Record<CharacterSet, boolean>>({ lowercase: true, uppercase: true, digits: true, symbols: false });
  const [customAlphabet, setCustomAlphabet] = useState("");
  const [nonce, setNonce] = useState(0);
  const [output, setOutput] = useState("");

  const limits = LENGTH_LIMITS[mode];
  const length = parseWhole(lengthText[mode], limits.fallback, limits.min, limits.max);
  const count = parseWhole(countText, 1, 1, MAX_COUNT);
  const pendingPrefix = useDebouncedValue(prefix);
  const pendingAlphabet = useDebouncedValue(customAlphabet);

  const alphabet = useMemo(
    () => (mode === "custom" ? buildAlphabet(sets, pendingAlphabet) : alphabetForMode(mode)),
    [mode, sets, pendingAlphabet],
  );
  const error = mode === "custom" ? validateAlphabet(alphabet) : "";
  const bits = error ? 0 : entropyForOptions({ mode, length, alphabet });
  const byteMode = isByteMode(mode);

  useEffect(() => {
    if (error) {
      setOutput("");
      return;
    }
    setOutput(generateRandomStrings({ mode, length, count, prefix: pendingPrefix, alphabet }).join("\n"));
  }, [mode, length, count, pendingPrefix, alphabet, error, nonce]);

  const setLength = (value: string) => setLengthText((current) => ({ ...current, [mode]: value }));

  return (
    <ToolWorkspace
      id="random-string"
      toolbar={
        <>
          <Tabs value={mode} onValueChange={(v) => setMode(v as RandomStringMode)}>
            <TabsList aria-label="Format">
              <TabsTrigger value="nanoid">Nano ID</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
              <TabsTrigger value="hex">Hex</TabsTrigger>
              <TabsTrigger value="base64url">Base64URL</TabsTrigger>
            </TabsList>
          </Tabs>
          <button type="button" className="toolbar-text-button indent-control" onClick={() => setNonce((n) => n + 1)} disabled={Boolean(error)}>
            <RefreshCw size={14} aria-hidden="true" />
            Regenerate
          </button>
        </>
      }
      notice={error ? <div className="workspace-notice" data-tone="error" role="alert">{error}</div> : undefined}
      first={
        <EditorPane title="Options">
          <div className="pane-options">
            <label htmlFor="random-length" className="w-20 font-medium">{byteMode ? "Bytes" : "Length"}</label>
            <Slider
              className="min-w-32 flex-1"
              value={[length]}
              onValueChange={([value]) => setLength(String(value))}
              min={limits.min}
              max={limits.max}
              step={1}
              aria-label={byteMode ? "Bytes slider" : "Length slider"}
            />
            <Input
              id="random-length"
              type="number"
              min={limits.min}
              max={limits.max}
              className="h-7 w-20 text-xs"
              value={lengthText[mode]}
              onChange={(e) => setLength(e.target.value)}
              onBlur={() => setLength(String(length))}
            />
          </div>
          <div className="pane-options">
            <label htmlFor="random-count" className="w-20 font-medium">Count</label>
            <Input
              id="random-count"
              type="number"
              min={1}
              max={MAX_COUNT}
              className="h-7 w-20 text-xs"
              value={countText}
              onChange={(e) => setCountText(e.target.value)}
              onBlur={() => setCountText(String(count))}
            />
            <span className="text-muted-foreground">1 to {MAX_COUNT}</span>
          </div>
          <div className="pane-options">
            <label htmlFor="random-prefix" className="w-20 font-medium">Prefix</label>
            <Input
              id="random-prefix"
              className="h-7 w-48 font-mono text-xs"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="Optional, e.g. user_"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {mode === "custom" && (
            <>
              <div className="pane-options">
                {(Object.keys(CHARACTER_SETS) as CharacterSet[]).map((key) => (
                  <label key={key} className="option-switch" htmlFor={`random-set-${key}`}>
                    {SET_LABELS[key]}
                    <Switch
                      id={`random-set-${key}`}
                      checked={sets[key]}
                      onCheckedChange={(checked) => setSets((current) => ({ ...current, [key]: checked }))}
                      disabled={Boolean(customAlphabet)}
                    />
                  </label>
                ))}
              </div>
              <div className="pane-options">
                <label htmlFor="random-alphabet" className="w-20 font-medium">Alphabet</label>
                <Input
                  id="random-alphabet"
                  className="h-7 min-w-48 flex-1 font-mono text-xs"
                  value={customAlphabet}
                  onChange={(e) => setCustomAlphabet(e.target.value)}
                  placeholder="Optional, e.g. 0123456789ABCDEF"
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="text-muted-foreground">A custom alphabet replaces the character sets.</span>
              </div>
            </>
          )}
          <div className="pane-options">
            <span className="w-20 font-medium">Characters</span>
            <code className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground" data-testid="random-alphabet-preview">
              {byteMode ? `${alphabet.join("")} (encoded from random bytes)` : alphabet.join("") || "None"}
            </code>
          </div>
        </EditorPane>
      }
      second={
        <EditorPane title="Output" htmlFor={output ? "random-output" : undefined} scroll={false}
          actions={<CopyButton value={output} label="Copy all" />}>
          {output ? (
            <CodeTextarea id="random-output" value={output} readOnly />
          ) : (
            <PaneEmpty title="Random strings appear here" hint="Choose a character set or enter an alphabet." />
          )}
        </EditorPane>
      }
      status={
        error ? (
          <span className="text-destructive">No alphabet</span>
        ) : (
          <>
            <span>~{Math.round(bits)} bits</span>
            <span>{count} {count === 1 ? "string" : "strings"}</span>
            <span>{alphabet.length}-character alphabet</span>
          </>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
