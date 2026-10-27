import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useState } from "react";
import { ChevronDown, ShieldCheck, TriangleAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import {
  DETECTORS,
  defaultDetectorSettings,
  getDetector,
  redactText,
  restorePlaceholders,
  type DetectorGroup,
  type DetectorId,
  type DetectorSettings,
  type MaskStyle,
} from "@/utils/secret-redactor";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Does this find every secret?",
    a: "No. Detection is pattern-based. It finds known key formats, values of fields with secret-looking names, and common personal data. It can miss secrets in unusual formats and can flag harmless text. Review the redacted text before you share it.",
  },
  {
    q: "Which mask style should I use with an AI assistant?",
    a: "Placeholder gives each distinct value its own name, such as `<EMAIL_1>`, so the AI can still follow the structure. The same value always gets the same placeholder. Label shows only the type, and Partial keeps the first 4 and last 2 characters.",
  },
  {
    q: "How does Restore work?",
    a: "In Placeholder style, paste the AI reply into the Restore box. Each placeholder that the reply repeats exactly is replaced with the original value from the placeholder map. The map and the restored text stay on this device.",
  },
  {
    q: "Why are some detectors off by default?",
    a: "Phone numbers, Social Security numbers, and high-entropy strings match many harmless values such as order numbers and hashes. Turn them on when the text is likely to contain them.",
  },
];

const STYLES: { value: MaskStyle; label: string }[] = [
  { value: "label", label: "Label" },
  { value: "partial", label: "Partial" },
  { value: "placeholder", label: "Placeholder" },
];

const GROUPS: { id: DetectorGroup; label: string }[] = [
  { id: "keys", label: "API keys" },
  { id: "credentials", label: "Credentials" },
  { id: "personal", label: "Personal data" },
  { id: "heuristic", label: "Heuristic" },
];

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

export function SecretRedactor() {
  const [input, setInput] = useState("");
  const [style, setStyle] = useState<MaskStyle>("placeholder");
  const [detectors, setDetectors] = useState<DetectorSettings>(defaultDetectorSettings);
  const [keepPrivateIps, setKeepPrivateIps] = useState(true);
  const [showDetectors, setShowDetectors] = useState(false);
  const [showValues, setShowValues] = useState(false);
  const [reply, setReply] = useState("");
  const text = useDebouncedValue(input);
  const replyText = useDebouncedValue(reply);

  const result = useMemo(() => (text ? redactText(text, { detectors, keepPrivateIps, style }) : null), [text, detectors, keepPrivateIps, style]);

  const restored = useMemo(
    () => (result && style === "placeholder" && replyText ? restorePlaceholders(replyText, result.mapping) : null),
    [result, style, replyText],
  );

  const enabledCount = DETECTORS.filter((d) => detectors[d.id]).length;
  const setDetector = (id: DetectorId, on: boolean) => setDetectors((current) => ({ ...current, [id]: on }));

  const option = (id: string, label: string, checked: boolean, onChange: (next: boolean) => void, disabled = false) => (
    <label key={id} className="option-switch" htmlFor={id}>
      {label}
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );

  const detectorPanel = showDetectors ? (
    <div id="secret-redactor-detectors" className="flex flex-col" role="group" aria-label="Detectors">
      {GROUPS.map((group) => (
        <div key={group.id} className="pane-options">
          <span className="w-24 shrink-0 text-2xs font-medium text-muted-foreground">{group.label}</span>
          {DETECTORS.filter((d) => d.group === group.id).map((d) =>
            option(`secret-redactor-${d.id}`, d.label, detectors[d.id], (on) => setDetector(d.id, on)),
          )}
          {group.id === "personal" &&
            option("secret-redactor-keep-private-ips", "Keep private IPs", keepPrivateIps, setKeepPrivateIps, !detectors["ip-address"])}
        </div>
      ))}
    </div>
  ) : undefined;

  const placeholderMode = style === "placeholder";

  return (
    <ToolWorkspace
      id="secret-redactor"
      toolbar={
        <>
          <Tabs value={style} onValueChange={(v) => setStyle(v as MaskStyle)}>
            <TabsList aria-label="Mask style">
              {STYLES.map((s) => (
                <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <button
            type="button"
            className="toolbar-text-button"
            aria-expanded={showDetectors}
            aria-controls="secret-redactor-detectors"
            onClick={() => setShowDetectors((open) => !open)}
          >
            <ChevronDown size={14} aria-hidden="true" className={showDetectors ? "rotate-180" : undefined} />
            Detectors ({enabledCount} of {DETECTORS.length} on)
          </button>
        </>
      }
      notice={detectorPanel}
      first={
        <EditorPane
          title="Text to redact"
          htmlFor="secret-redactor-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea
            id="secret-redactor-input"
            placeholder="Paste logs, code, or config to mask secrets and personal data before you share it"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane
          title="Redacted"
          htmlFor={result ? "secret-redactor-output" : undefined}
          scroll={false}
          actions={<CopyButton value={result?.output ?? ""} label="Copy redacted" />}
        >
          {result ? (
            <>
              <CodeTextarea id="secret-redactor-output" value={result.output} readOnly />
              <div className="max-h-[55%] shrink-0 overflow-auto border-t border-border">
                <div className="result-list">
                  <div className="pane-options">
                    <span className="font-medium" id="secret-redactor-findings">Findings</span>
                  </div>
                  {result.findings.length === 0 ? (
                    <div className="pane-options text-muted-foreground">
                      No secrets or personal data found. Review the text before you share it.
                    </div>
                  ) : (
                    <div role="table" aria-labelledby="secret-redactor-findings">
                      {result.findings.map((f) => (
                        <div key={f.detector} className="result-row" role="row">
                          <span className="result-row-label" role="cell">{f.label}</span>
                          <span className="result-row-value" role="cell">×{f.count.toLocaleString()}</span>
                          <span className="text-xs text-muted-foreground" role="cell">First on line {f.firstLine.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {placeholderMode && result.mapping.length > 0 && (
                  <div className="result-list">
                    <div className="pane-options">
                      <span className="font-medium" id="secret-redactor-map">Placeholder map</span>
                      {option("secret-redactor-show-values", "Show values", showValues, setShowValues)}
                    </div>
                    <div className="pane-options text-muted-foreground">
                      <ShieldCheck size={14} aria-hidden="true" />
                      <span>The map stays on this device. Copy redacted never includes it.</span>
                    </div>
                    <div role="table" aria-labelledby="secret-redactor-map">
                      {result.mapping.map((m) => (
                        <div key={m.placeholder} className="result-row" role="row">
                          <span className="result-row-label font-mono" role="cell">{m.placeholder}</span>
                          <span className="result-row-value" role="cell">
                            {showValues ? m.original : "•".repeat(Math.min(m.original.length, 12))}
                          </span>
                          <span className="text-2xs text-muted-foreground" role="cell">{getDetector(m.detector).tag}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="result-list">
                  <div className="pane-options">
                    <label className="font-medium" htmlFor="secret-redactor-reply">Restore an AI reply</label>
                    {restored && <CopyButton value={restored.output} label="Copy restored" />}
                  </div>
                  {placeholderMode ? (
                    <>
                      <div className="flex h-28 flex-col border-b border-border/50">
                        <CodeTextarea
                          id="secret-redactor-reply"
                          placeholder="Paste the AI reply that uses placeholders such as <EMAIL_1>"
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                        />
                      </div>
                      {restored && (
                        <>
                          <div className="pane-options text-muted-foreground" role="status">
                            {plural(restored.restored, "placeholder")} restored
                            {restored.unknown.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-warning">
                                <TriangleAlert size={14} aria-hidden="true" />
                                Not in the map: {restored.unknown.slice(0, 4).join(", ")}
                                {restored.unknown.length > 4 && ` and ${restored.unknown.length - 4} more`}
                              </span>
                            )}
                          </div>
                          <div className="flex h-28 flex-col">
                            <CodeTextarea id="secret-redactor-restored" aria-label="Restored reply" value={restored.output} readOnly />
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="pane-options text-muted-foreground">Switch to Placeholder style to put original values back into an AI reply.</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <PaneEmpty
              icon={<ShieldCheck size={20} aria-hidden="true" />}
              title="Redacted text appears here"
              hint="API keys, tokens, passwords, emails, and other personal data are masked as you type."
            />
          )}
        </EditorPane>
      }
      status={
        result ? (
          result.total > 0 ? (
            <span>
              {plural(result.total, "item")} redacted · {plural(result.types, "type")}
            </span>
          ) : (
            <span>No items found</span>
          )
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
