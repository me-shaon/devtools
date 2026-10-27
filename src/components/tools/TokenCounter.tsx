import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  BASIS_LABELS,
  CONTEXT_PRESETS,
  ESTIMATE_FAMILIES,
  MODEL_NAME_LIMIT,
  PRICE_TABLE_LIMIT,
  TOKEN_VIEW_LIMIT,
  contextUsage,
  costFor,
  countO200k,
  estimateTokens,
  exportPriceTable,
  formatUsd,
  getTextStats,
  importPriceTable,
  loadPriceRows,
  newRowId,
  savePriceRows,
  tokensForBasis,
  visibleWhitespace,
  type O200kResult,
  type PriceRow,
  type TokenBasis,
} from "@/utils/token-counter";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which counts are exact and which are estimates?",
    a: "The OpenAI count is exact for GPT-4o and newer models, which use the o200k_base encoding. The tool runs that tokenizer on your device. Claude, Gemini and Llama tokenizers are not public or not bundled, so their counts are estimates and show \"≈ estimate\".",
  },
  {
    q: "How are the estimates made?",
    a: "Claude is the o200k count × 1.2 (range × 1.0 to × 1.35). Gemini is × 1.0 (range × 0.9 to × 1.15). Llama 3 and later is × 1.1 (range × 1.0 to × 1.25). The rule of thumb is ASCII characters ÷ 4, plus 1 token for each CJK character and 1 token for each 2 other characters. These ratios are averages for English prose and code. Other languages can fall outside the range. Use the provider's own token counter when you need an exact number.",
  },
  {
    q: "Why are model prices not built in?",
    a: "Prices change often and the app works offline, so built-in prices would go out of date without notice. Add each model and its price per million tokens from the provider's pricing page. The table stays on this device. Use Export JSON to share one table with your team.",
  },
  {
    q: "Is my text sent anywhere?",
    a: "No. Counting, estimates and costs are calculated on your device. The tool makes no network requests, and the text is not saved. Only the price table is saved, in this app's local storage.",
  },
];

const BASIS_OPTIONS: TokenBasis[] = ["openai", "claude", "gemini", "llama", "rule"];

const parseCount = (text: string) => {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const parsePrice = (text: string) => {
  if (text.trim() === "") return Number.NaN;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : Number.NaN;
};

const n = (value: number) => value.toLocaleString();

const SELECT_CLASS = "h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary";

function SectionTitle({ id, children }: { id?: string; children: string }) {
  return (
    <div className="pane-options">
      <h3 id={id} className="text-xs font-medium">{children}</h3>
    </div>
  );
}

function ContextMeter({ used, context }: { used: number; context: number }) {
  const usage = contextUsage(used, context);
  const width = Math.min(100, usage.percent);
  const percentText = `${usage.percent < 10 && usage.percent > 0 ? usage.percent.toFixed(1) : Math.round(usage.percent)}%`;
  const valueText = `${n(used)} of ${n(context)} tokens (${percentText})`;
  return (
    <div className="flex flex-col gap-1.5 px-4 py-2">
      <div
        role="meter"
        aria-label="Context window used"
        aria-valuemin={0}
        aria-valuemax={context}
        aria-valuenow={Math.min(used, context)}
        aria-valuetext={valueText}
        className="h-2.5 w-full overflow-hidden rounded-full border border-muted-foreground"
      >
        <div className={`h-full ${usage.over ? "bg-destructive" : "bg-primary"}`} style={{ width: `${width}%` }} />
      </div>
      <p className="text-xs tabular-nums">
        {valueText}
        {" · "}
        {usage.over ? (
          <span className="font-medium text-destructive">Over the limit by {n(-usage.remaining)} tokens</span>
        ) : (
          <span className="text-muted-foreground">{n(usage.remaining)} tokens left</span>
        )}
      </p>
    </div>
  );
}

function TokenView({ result }: { result: O200kResult }) {
  return (
    <>
      {result.truncated && (
        <div className="pane-options text-muted-foreground">
          Showing the first {n(TOKEN_VIEW_LIMIT)} tokens of {n(result.count)}. The counts above include all tokens.
        </div>
      )}
      <div className="whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs leading-6" aria-label="Tokens" role="group" data-testid="token-view">
        {result.pieces.map((piece, i) => (
          <span
            key={i}
            className={`rounded-sm px-px ${i % 2 === 0 ? "bg-primary/10" : "bg-muted"}`}
            title={piece.tokens > 1 ? `${piece.tokens} tokens for one character` : undefined}
          >
            {visibleWhitespace(piece.text)}
          </span>
        ))}
      </div>
    </>
  );
}

export function TokenCounter() {
  const [input, setInput] = useState("");
  const text = useDebouncedValue(input, 250);
  const [showTokens, setShowTokens] = useState(false);
  const [result, setResult] = useState<(O200kResult & { text: string; withPieces: boolean }) | null>(null);
  const [countError, setCountError] = useState("");

  const [outputText, setOutputText] = useState("0");
  const [contextText, setContextText] = useState("128000");

  const [rows, setRows] = useState<PriceRow[]>(() => loadPriceRows());
  const [draft, setDraft] = useState({ name: "", input: "", output: "", basis: "openai" as TokenBasis });
  const [draftError, setDraftError] = useState("");
  const [tablePanel, setTablePanel] = useState<"import" | "export" | null>(null);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");

  const stats = useMemo(() => getTextStats(text), [text]);

  useEffect(() => {
    if (!text) {
      setResult(null);
      setCountError("");
      return;
    }
    const controller = new AbortController();
    countO200k(text, { signal: controller.signal, pieceLimit: showTokens ? TOKEN_VIEW_LIMIT : 0 })
      .then((counted) => {
        setResult({ ...counted, text, withPieces: showTokens });
        setCountError("");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCountError("Could not load the tokenizer. Reload the tool and try again.");
      });
    return () => controller.abort();
  }, [text, showTokens]);

  const pending = input !== text;
  const counting = Boolean(text) && !countError && (!result || result.text !== text || (showTokens && !result.withPieces));
  const busy = pending || counting;
  // While a new count runs, the previous count stays on screen so the numbers do not flicker.
  const tokens = text && result ? result.count : 0;
  const hasCount = Boolean(text && result);

  const outputTokens = parseCount(outputText);
  const context = parseCount(contextText);

  const updateRows = (next: PriceRow[]) => {
    setRows(next);
    savePriceRows(next);
  };

  const addRow = (event: FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    const inputPrice = parsePrice(draft.input);
    const outputPrice = parsePrice(draft.output);
    if (!name) return setDraftError("Enter a model name.");
    if (Number.isNaN(inputPrice)) return setDraftError("Enter an input price of 0 or more.");
    if (Number.isNaN(outputPrice)) return setDraftError("Enter an output price of 0 or more.");
    if (rows.length >= PRICE_TABLE_LIMIT) return setDraftError(`The table can hold up to ${PRICE_TABLE_LIMIT} models.`);
    updateRows([...rows, { id: newRowId(), name, input: inputPrice, output: outputPrice, basis: draft.basis }]);
    setDraft({ name: "", input: "", output: "", basis: draft.basis });
    setDraftError("");
  };

  const runImport = () => {
    const parsed = importPriceTable(importText);
    if ("error" in parsed) {
      setImportError(parsed.error);
      return;
    }
    updateRows(parsed.rows);
    setImportError("");
    setImportText("");
    setTablePanel(null);
  };

  const summary = hasCount
    ? JSON.stringify(
        {
          o200kTokens: tokens,
          estimates: Object.fromEntries(ESTIMATE_FAMILIES.map((f) => [f.id, estimateTokens(f, tokens, stats).value])),
          characters: stats.characters,
          words: stats.words,
          lines: stats.lines,
          utf8Bytes: stats.bytes,
        },
        null,
        2,
      )
    : "";

  const countValue = (value: number) => (hasCount ? n(value) : busy ? "Counting…" : "0");
  const exported = tablePanel === "export" ? exportPriceTable(rows) : "";

  return (
    <ToolWorkspace
      id="token-counter"
      toolbar={
        <>
          <label className="option-switch" htmlFor="token-show">
            Show tokens
            <Switch id="token-show" checked={showTokens} onCheckedChange={setShowTokens} />
          </label>
          <CopyButton value={summary} label="Copy counts" />
        </>
      }
      notice={countError ? <div className="workspace-notice" data-tone="error" role="alert">{countError}</div> : undefined}
      first={
        <EditorPane
          title="Text"
          htmlFor="token-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea
            id="token-input"
            placeholder="Paste a prompt or document to count its tokens"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane title="Counts">
          <div className="result-list">
            <div className="result-row">
              <span className="result-row-label">OpenAI tokens</span>
              <span className="result-row-value tabular-nums" data-testid="token-count">{countValue(tokens)}</span>
              <span className="text-2xs text-muted-foreground">Exact, o200k_base</span>
            </div>
            {(
              [
                ["Characters", stats.characters],
                ["Words", stats.words],
                ["Lines", stats.lines],
                ["UTF-8 bytes", stats.bytes],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="result-row">
                <span className="result-row-label">{label}</span>
                <span className="result-row-value tabular-nums">{n(value)}</span>
                <span />
              </div>
            ))}

            <SectionTitle>Other models</SectionTitle>
            {ESTIMATE_FAMILIES.map((family) => {
              const estimate = estimateTokens(family, tokens, stats);
              const ready = family.id === "rule" || hasCount;
              return (
                <div key={family.id} className="result-row">
                  <span className="result-row-label">{family.label}</span>
                  <span className="result-row-value tabular-nums">
                    {ready ? `≈ ${n(estimate.value)}` : busy ? "Counting…" : "≈ 0"}
                    {ready && estimate.value > 0 && (
                      <span className="text-muted-foreground"> ({n(estimate.low)} to {n(estimate.high)})</span>
                    )}
                  </span>
                  <span className="text-2xs text-muted-foreground">≈ estimate</span>
                </div>
              );
            })}

            {showTokens && (
              <>
                <SectionTitle>Tokens (o200k_base)</SectionTitle>
                {result && result.text === text && result.withPieces ? (
                  result.count > 0 ? <TokenView result={result} /> : null
                ) : text ? (
                  <div className="pane-options text-muted-foreground">Counting…</div>
                ) : (
                  <div className="pane-options text-muted-foreground">Enter text to see how it splits into tokens.</div>
                )}
              </>
            )}

            <SectionTitle>Context window</SectionTitle>
            <div className="pane-options">
              <label htmlFor="token-context" className="font-medium">Context size</label>
              <Input
                id="token-context"
                type="number"
                min={1}
                className="h-7 w-28 text-xs tabular-nums"
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
              />
              <div className="flex flex-wrap gap-1" role="group" aria-label="Common context sizes">
                {CONTEXT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="toolbar-text-button border border-border"
                    aria-pressed={context === preset.value}
                    aria-label={`${preset.label} context, ${n(preset.value)} tokens`}
                    onClick={() => setContextText(String(preset.value))}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            {context > 0 ? (
              <ContextMeter used={tokens + outputTokens} context={context} />
            ) : (
              <div className="pane-options text-muted-foreground">Enter the model's context size in tokens.</div>
            )}
            <div className="px-4 pb-2 text-2xs text-muted-foreground">Uses the exact OpenAI count plus the output tokens below.</div>

            <SectionTitle id="token-cost-title">Cost</SectionTitle>
            <div className="pane-options">
              <label htmlFor="token-output" className="font-medium">Output tokens</label>
              <Input
                id="token-output"
                type="number"
                min={0}
                className="h-7 w-28 text-xs tabular-nums"
                value={outputText}
                onChange={(e) => setOutputText(e.target.value)}
              />
              <span className="text-muted-foreground">Tokens you expect the model to write.</span>
            </div>

            {rows.length === 0 ? (
              <div className="pane-options text-muted-foreground">
                Add a model and its price per million tokens from the provider's pricing page.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" aria-labelledby="token-cost-title">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <th scope="col" className="px-4 py-1.5 font-medium">Model</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Input / 1M</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Output / 1M</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Input cost</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Output cost</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Total</th>
                      <th scope="col" className="px-2 py-1.5"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const estimated = row.basis !== "openai";
                      const inputTokens = tokensForBasis(row.basis, tokens, stats);
                      const cost = costFor(row, inputTokens, outputTokens);
                      const prefix = estimated ? "≈ " : "";
                      return (
                        <tr key={row.id} className="border-b border-border/50 tabular-nums" data-testid="price-row">
                          <th scope="row" className="px-4 py-1.5 text-left font-normal">
                            <span className="block font-medium">{row.name}</span>
                            <span className="block text-2xs text-muted-foreground">{BASIS_LABELS[row.basis]}</span>
                          </th>
                          <td className="px-2 py-1.5 text-right">{`$${row.input}`}</td>
                          <td className="px-2 py-1.5 text-right">{`$${row.output}`}</td>
                          <td className="px-2 py-1.5 text-right">{prefix}{formatUsd(cost.input)}</td>
                          <td className="px-2 py-1.5 text-right">{formatUsd(cost.output)}</td>
                          <td className="px-2 py-1.5 text-right font-medium">
                            {prefix}{formatUsd(cost.total)}
                            {estimated && <span className="block text-2xs font-normal text-muted-foreground">≈ estimate</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              type="button"
                              className="toolbar-text-button"
                              aria-label={`Remove ${row.name}`}
                              onClick={() => updateRows(rows.filter((r) => r.id !== row.id))}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <form className="pane-options" onSubmit={addRow} aria-label="Add a model price">
              <label htmlFor="token-price-name" className="sr-only">Model name</label>
              <Input
                id="token-price-name"
                className="h-7 w-40 text-xs"
                placeholder="Model name"
                maxLength={MODEL_NAME_LIMIT}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoComplete="off"
              />
              <label htmlFor="token-price-input" className="sr-only">Input price, US dollars per 1M tokens</label>
              <Input
                id="token-price-input"
                type="number"
                min={0}
                step="any"
                className="h-7 w-28 text-xs tabular-nums"
                placeholder="Input $ / 1M"
                value={draft.input}
                onChange={(e) => setDraft({ ...draft, input: e.target.value })}
              />
              <label htmlFor="token-price-output" className="sr-only">Output price, US dollars per 1M tokens</label>
              <Input
                id="token-price-output"
                type="number"
                min={0}
                step="any"
                className="h-7 w-28 text-xs tabular-nums"
                placeholder="Output $ / 1M"
                value={draft.output}
                onChange={(e) => setDraft({ ...draft, output: e.target.value })}
              />
              <label htmlFor="token-price-basis" className="sr-only">Token count to use</label>
              <select
                id="token-price-basis"
                className={SELECT_CLASS}
                value={draft.basis}
                onChange={(e) => setDraft({ ...draft, basis: e.target.value as TokenBasis })}
              >
                {BASIS_OPTIONS.map((basis) => (
                  <option key={basis} value={basis}>{BASIS_LABELS[basis]}</option>
                ))}
              </select>
              <button type="submit" className="toolbar-text-button border border-border">
                <Plus size={14} aria-hidden="true" />
                Add model
              </button>
            </form>
            {draftError && <div className="workspace-notice" data-tone="error" role="alert">{draftError}</div>}

            <div className="pane-options">
              <button
                type="button"
                className="toolbar-text-button"
                aria-expanded={tablePanel === "import"}
                onClick={() => {
                  setTablePanel(tablePanel === "import" ? null : "import");
                  setImportError("");
                }}
              >
                <Upload size={14} aria-hidden="true" />
                Import JSON
              </button>
              <button
                type="button"
                className="toolbar-text-button"
                aria-expanded={tablePanel === "export"}
                disabled={rows.length === 0}
                onClick={() => setTablePanel(tablePanel === "export" ? null : "export")}
              >
                <Download size={14} aria-hidden="true" />
                Export JSON
              </button>
            </div>
            {tablePanel === "import" && (
              <div className="flex flex-col gap-2 px-4 pb-3">
                <label htmlFor="token-import" className="text-xs font-medium">Price table JSON</label>
                <CodeTextarea
                  id="token-import"
                  className="min-h-32 rounded-md border border-input"
                  placeholder={'{ "models": [{ "name": "my-model", "input": 2.5, "output": 10 }] }'}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                {importError && <div className="workspace-notice" data-tone="error" role="alert">{importError}</div>}
                <div className="flex gap-2">
                  <button type="button" className="toolbar-text-button border border-border" onClick={runImport} disabled={!importText.trim()}>
                    Replace table
                  </button>
                  <span className="self-center text-2xs text-muted-foreground">Import replaces the current table.</span>
                </div>
              </div>
            )}
            {tablePanel === "export" && (
              <div className="flex flex-col gap-2 px-4 pb-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="token-export" className="text-xs font-medium">Price table JSON</label>
                  <CopyButton value={exported} label="Copy JSON" />
                </div>
                <CodeTextarea id="token-export" className="min-h-32 rounded-md border border-input" value={exported} readOnly />
              </div>
            )}
          </div>
        </EditorPane>
      }
      status={
        text ? (
          <>
            <span className="tabular-nums">{busy ? "Counting…" : `${n(tokens)} ${tokens === 1 ? "token" : "tokens"} (o200k)`}</span>
            <span className="tabular-nums">{n(stats.characters)} characters</span>
          </>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
