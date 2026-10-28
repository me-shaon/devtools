import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { countO200k } from "@/utils/token-counter";
import {
  CONFIG_FORMATS,
  FORMAT_NAMES,
  compareTokens,
  convertConfig,
  detectConfigFormat,
  loadToml,
  loadToon,
  needsToml,
  needsToon,
  type ConfigFormat,
  type EnvNesting,
  type TokenComparison,
  type TomlModule,
  type ToonDelimiter,
  type ToonModule,
  type YamlIndent,
} from "@/utils/yaml-json";

interface Result {
  output: string;
  error: string;
  documents: number;
  data?: unknown;
}

const EMPTY: Result = { output: "", error: "", documents: 0 };

const PLACEHOLDERS: Record<ConfigFormat, string> = {
  yaml: "name: DevTools\ntags:\n  - offline\n  - desktop",
  json: '{"name":"DevTools","tags":["offline","desktop"]}',
  toml: '[package]\nname = "devtools"\nversion = "2.1.0"',
  env: "# .env\nPORT=3000\nDATABASE_URL=\"postgres://localhost/app\"",
  properties: "server.port=8080\nspring.application.name=devtools",
  toon: "name: DevTools\ntools[2]{id,offline}:\n  json-viewer,true\n  yaml-json,true",
};

const countTokens = (text: string, signal: AbortSignal) => countO200k(text, { signal }).then((result) => result.count);

const formatCount = (n: number) => n.toLocaleString("en-US");

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Is my data uploaded?",
    a: "No. The conversion runs on this device. Nothing is sent over the network.",
  },
  {
    q: "Which formats can I convert?",
    a: "JSON, YAML, TOML, .env, Java .properties, and TOON, in any direction. Pick the source and target formats in the toolbar. When you paste into an empty input, the tool picks the source format for you.",
  },
  {
    q: "What happens with several YAML documents?",
    a: "YAML files can hold several documents separated by a line with three dashes (---). JSON and TOON output is an array with one item for each document. YAML output keeps the documents separate. TOML, .env, and .properties need one document.",
  },
  {
    q: "What is TOON?",
    a: "TOON (Token-Oriented Object Notation) is a compact, line-based encoding of the JSON data model. It is made for data that you put in LLM prompts. Nested objects use indentation, like YAML. An array of objects that have the same keys becomes a table: the header lists the keys one time, and each object becomes one row. The header also gives the number of items, for example users[3]{id,name}:.",
  },
  {
    q: "When does TOON use fewer tokens than JSON?",
    a: "TOON saves the most tokens on arrays of objects that have the same keys and primitive values, such as rows from a database. It saves fewer tokens when the objects have different keys. For deeply nested or non-uniform data, minified JSON can use fewer tokens than TOON. The tool shows the real numbers for your data.",
  },
  {
    q: "How are the tokens counted?",
    a: "When the source or the target is TOON, the status bar shows the tokens of the TOON text and of the same data as JSON. The tool counts with the o200k_base encoding, the same as the Token Counter (GPT-4o and newer). The percent saved compares TOON with minified JSON. Pretty JSON with a 2-space indent is also shown. Other models use other tokenizers, so their counts are different.",
  },
  {
    q: "Which TOON delimiter should I use?",
    a: "The delimiter separates the values in table rows and in inline arrays. A comma is the default. A tab often uses fewer tokens, and a value that has commas needs no quotes. Use a pipe when the values have commas and tabs. TOON input can use any of the three delimiters, because the header tells the parser which one it uses.",
  },
  {
    q: "How are nested values written to a .env file?",
    a: "Each nested key becomes one UPPER_SNAKE variable. Parts join with two underscores by default, so database.maxPool becomes DATABASE__MAX_POOL. ASP.NET Core and pydantic read this style. Set Nested keys to A_B for Spring Boot, which reads DATABASE_MAX_POOL. List items use their index, for example SERVERS__0.",
  },
  {
    q: "How are .properties keys turned into nested YAML or JSON?",
    a: "Dots in a key make nested objects, and [0] makes a list, the way Spring Boot reads application.properties. A key cannot hold a value and also have nested keys, for example a=1 and a.b=2. The tool shows an error for this. When the target is .properties, nested keys join with dots again.",
  },
  {
    q: "Why are numbers from .env and .properties files in quotes?",
    a: "These files store every value as text. The tool keeps the values as strings, so 8080 becomes \"8080\" in YAML. This also matches a Kubernetes ConfigMap, which needs string values. The tool does not expand ${VAR} references in .env files.",
  },
  {
    q: "Why does TOML show an error for null?",
    a: "TOML has no null value. Remove the key or give it a value before you convert. TOML dates become ISO 8601 text in the other formats.",
  },
  {
    q: "Why are my comments missing from the output?",
    a: "The tool reads the data and writes it again, so comments are not kept. YAML anchors and aliases are expanded into full copies of the values.",
  },
  {
    q: "How do I find a syntax error?",
    a: "The error message shows the line and column where the parser stopped. The real mistake is often on that line or just before it, for example a wrong indent or a missing quote.",
  },
];

const FormatSelect = ({ label, name, value, onChange }: { label: string; name: string; value: ConfigFormat; onChange: (next: ConfigFormat) => void }) => (
  <label className="indent-control">
    {label}
    <select aria-label={name} value={value} onChange={(e) => onChange(e.target.value as ConfigFormat)}>
      {CONFIG_FORMATS.map((format) => (
        <option key={format} value={format}>{FORMAT_NAMES[format]}</option>
      ))}
    </select>
  </label>
);

export function YamlJson() {
  const [from, setFrom] = useState<ConfigFormat>("yaml");
  const [to, setTo] = useState<ConfigFormat>("json");
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState<YamlIndent>(2);
  const [envNesting, setEnvNesting] = useState<EnvNesting>("__");
  const [toonDelimiter, setToonDelimiter] = useState<ToonDelimiter>(",");
  const [toml, setToml] = useState<TomlModule>();
  const [toon, setToon] = useState<ToonModule>();
  const [loadError, setLoadError] = useState("");

  const tomlNeeded = needsToml(from, to);
  useEffect(() => {
    if (!tomlNeeded || toml) return;
    let cancelled = false;
    loadToml()
      .then((mod) => !cancelled && setToml(mod))
      .catch(() => !cancelled && setLoadError("Could not load the TOML parser."));
    return () => {
      cancelled = true;
    };
  }, [tomlNeeded, toml]);

  const toonNeeded = needsToon(from, to);
  useEffect(() => {
    if (!toonNeeded || toon) return;
    let cancelled = false;
    loadToon()
      .then((mod) => !cancelled && setToon(mod))
      .catch(() => !cancelled && setLoadError("Could not load the TOON encoder."));
    return () => {
      cancelled = true;
    };
  }, [toonNeeded, toon]);

  // Debounce input and formats together so a format change never runs on stale text
  const job = useMemo(() => ({ input, from, to }), [input, from, to]);
  const pending = useDebouncedValue(job);
  const waitingForToml = needsToml(pending.from, pending.to) && !toml;
  const waitingForToon = needsToon(pending.from, pending.to) && !toon;

  const result = useMemo<Result>(() => {
    if (!pending.input.trim() || waitingForToml || waitingForToon) return EMPTY;
    try {
      const converted = convertConfig(pending.input, pending.from, pending.to, { indent, envNesting, toonDelimiter }, toml, toon);
      return { ...converted, error: "" };
    } catch (error) {
      return { ...EMPTY, error: error instanceof Error ? error.message : "Could not convert the data." };
    }
  }, [pending, indent, envNesting, toonDelimiter, toml, toon, waitingForToml, waitingForToon]);

  // A result for the previous formats or text is stale until the debounce catches up
  const current = pending.from === from && pending.to === to && input.trim() ? result : EMPTY;
  const error = loadError || current.error;

  // The token comparison loads the tokenizer only when one side is TOON
  const toonText = !result.output ? "" : pending.to === "toon" ? result.output : pending.from === "toon" ? pending.input : "";
  const [tokens, setTokens] = useState<{ result: Result; value: TokenComparison }>();
  useEffect(() => {
    if (!toonText) return;
    const controller = new AbortController();
    compareTokens(result.data, toonText, (text) => countTokens(text, controller.signal))
      .then((value) => !controller.signal.aborted && setTokens({ result, value }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [result, toonText]);
  const comparison = toonText && tokens?.result === current ? tokens.value : undefined;

  const changeInput = (next: string) => {
    // A paste into an empty input sets the source format. Typing never changes it.
    if (!input.trim() && next.trim().length > 1) {
      const detected = detectConfigFormat(next);
      if (detected && detected !== from) {
        setFrom(detected);
        if (detected === to) setTo(detected === "json" ? "yaml" : "json");
      }
    }
    setInput(next);
  };

  // Picking the format on the other side swaps the two, so source and target stay different.
  const changeFrom = (next: ConfigFormat) => {
    if (next === to) setTo(from);
    setFrom(next);
  };
  const changeTo = (next: ConfigFormat) => {
    if (next === from) setFrom(to);
    setTo(next);
  };

  const swap = () => {
    setInput(current.output);
    setFrom(to);
    setTo(from);
  };

  const inputName = FORMAT_NAMES[from];
  const outputName = FORMAT_NAMES[to];

  const status = () => {
    if (error) return <span className="text-destructive">Invalid input</span>;
    if (input.trim() && waitingForToml) return <span>Loading the TOML parser</span>;
    if (input.trim() && waitingForToon) return <span>Loading the TOON encoder</span>;
    if (!current.output) return <span>Ready</span>;
    const lines = current.output.split("\n").length;
    return (
      <>
        <span>{lines} {lines === 1 ? "line" : "lines"}</span>
        {(to === "json" || to === "toon") && current.documents > 1 && <span>{current.documents} documents converted to {to === "json" ? "a JSON" : "a TOON"} array</span>}
        {comparison && (
          <span data-testid="toon-tokens" title="Tokens counted with the o200k_base encoding (GPT-4o and newer)">
            o200k tokens: TOON {formatCount(comparison.toon)}, JSON {formatCount(comparison.json)} minified, {formatCount(comparison.prettyJson)} pretty.{" "}
            {comparison.saved >= 0 ? `TOON saves ${comparison.saved}% against minified JSON.` : `TOON uses ${-comparison.saved}% more than minified JSON.`}
          </span>
        )}
      </>
    );
  };

  return (
    <ToolWorkspace
      id="yaml-json"
      toolbar={
        <>
          <FormatSelect label="From" name="Source format" value={from} onChange={changeFrom} />
          <FormatSelect label="To" name="Target format" value={to} onChange={changeTo} />
          {(to === "json" || to === "yaml" || to === "toon") && (
            <label className="indent-control">
              Indent
              <select aria-label="Indentation" value={indent} onChange={(e) => setIndent(Number(e.target.value) as YamlIndent)}>
                <option value="2">2 spaces</option>
                <option value="4">4 spaces</option>
              </select>
            </label>
          )}
          {to === "env" && (
            <label className="indent-control">
              Nested keys
              <select aria-label="Nested keys" value={envNesting} onChange={(e) => setEnvNesting(e.target.value as EnvNesting)}>
                <option value="__">A__B</option>
                <option value="_">A_B</option>
              </select>
            </label>
          )}
          {to === "toon" && (
            <label className="indent-control">
              Delimiter
              <select aria-label="TOON delimiter" value={toonDelimiter} onChange={(e) => setToonDelimiter(e.target.value as ToonDelimiter)}>
                <option value=",">Comma</option>
                <option value={"\t"}>Tab</option>
                <option value="|">Pipe</option>
              </select>
            </label>
          )}
          <button type="button" className="toolbar-text-button" onClick={swap} disabled={!current.output}>
            <ArrowLeftRight size={14} aria-hidden="true" />
            Swap
          </button>
        </>
      }
      notice={
        error ? (
          <div className="workspace-notice" data-tone="error" role="alert">{error}</div>
        ) : undefined
      }
      first={
        <EditorPane title={`${inputName} input`} htmlFor="yaml-json-input" scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}>
          <CodeTextarea
            id="yaml-json-input"
            placeholder={PLACEHOLDERS[from]}
            value={input}
            onChange={(e) => changeInput(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane title={`${outputName} output`} htmlFor={current.output ? "yaml-json-output" : undefined} scroll={false}
          actions={<CopyButton value={current.output} label={`Copy ${outputName}`} />}>
          {current.output ? (
            <CodeTextarea id="yaml-json-output" value={current.output} readOnly />
          ) : (
            <PaneEmpty title={`${outputName} appears here`} hint={`Type or paste ${inputName} on the left.`} />
          )}
        </EditorPane>
      }
      status={status()}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
