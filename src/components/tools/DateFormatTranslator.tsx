import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { DIALECTS, DIALECT_LABELS, describePart, renderFormat, translateFormat, type Dialect } from "@/utils/date-format";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "How does a Go layout work?",
    a: "Go writes a format as the reference time Mon Jan 2 15:04:05 MST 2006. Each value stands for a field: 2006 is the year, 01 the month, 15 the hour. Go has no escape syntax, so text such as \"Monday\" or \"1\" is read as a value. The Go row warns when that happens.",
  },
  {
    q: "Why do Moment.js and date-fns use different letters?",
    a: "date-fns uses Unicode letters like Java: yyyy is the year and dd the day of month. In Moment.js and Day.js, YYYY is the year and DD the day of month. In date-fns, YYYY is a week-numbering year and DD is the day of year. Both throw unless you set an option.",
  },
  {
    q: "How is literal text escaped?",
    a: "Java, Swift, and date-fns put text in single quotes, and '' is one quote. Moment.js and Day.js use [text]. PHP puts a backslash before each letter. .NET accepts quotes or a backslash. strftime writes a percent sign as %%. Go cannot escape text.",
  },
  {
    q: "What do the warnings mean?",
    a: "A warning means the target has no exact token for a field. The tool uses the closest token, or leaves the field out, and says which. The preview shows what the target really prints, so you can compare the rows.",
  },
  {
    q: "Which source dialect is used?",
    a: "Auto picks the dialect from the format, for example % signs for strftime or 2006 for Go. A format such as d MMM is valid in several dialects. If Auto picks the wrong one, choose the source by hand.",
  },
  {
    q: "Which strftime does each row target?",
    a: "C strftime is the C library function, also used by the date command. Python passes most directives to the C library, and adds %f. Ruby has its own implementation with %L, %N, and the - flag on every platform.",
  },
];

/** Parses a datetime-local value as local time, or as UTC. */
const parsePreviewDate = (value: string, utc: boolean) => {
  if (!value) return null;
  const date = new Date(utc ? `${value}Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function DateFormatTranslator() {
  const [input, setInput] = useState("");
  const [source, setSource] = useState<Dialect | "auto">("auto");
  const [previewText, setPreviewText] = useState("");
  const [utc, setUtc] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const format = useDebouncedValue(input);

  // The preview follows the clock until the user picks a date.
  useEffect(() => {
    if (previewText) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [previewText]);

  const translation = useMemo(() => (format ? translateFormat(format, source) : null), [format, source]);
  const previewDate = parsePreviewDate(previewText, utc) ?? now;
  const detectedLabel = translation?.detected ? DIALECT_LABELS[translation.source] : null;

  return (
    <ToolWorkspace
      id="date-format"
      toolbar={
        <label className="indent-control" style={{ paddingLeft: 0, borderLeft: 0 }}>
          Source
          <select aria-label="Source dialect" value={source} onChange={(e) => setSource(e.target.value as Dialect | "auto")}>
            <option value="auto">{detectedLabel ? `Auto (${detectedLabel})` : "Auto"}</option>
            {DIALECTS.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </label>
      }
      secondaryToolbar={
        <>
          <label htmlFor="date-format-preview" className="text-xs text-muted-foreground">Preview date</label>
          <Input
            id="date-format-preview"
            type="datetime-local"
            step={1}
            className="h-7 w-56 text-xs"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
          />
          <button type="button" className="toolbar-text-button" onClick={() => setPreviewText("")} disabled={!previewText}>
            Now
          </button>
          <label className="option-switch indent-control" htmlFor="date-format-utc">
            UTC
            <Switch id="date-format-utc" checked={utc} onCheckedChange={setUtc} />
          </label>
        </>
      }
      notice={
        translation?.warnings.length ? (
          <div className="workspace-notice" role="status">{translation.warnings.join(" ")}</div>
        ) : undefined
      }
      first={
        <EditorPane
          title="Format"
          htmlFor="date-format-input"
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea
            id="date-format-input"
            className="flex-none"
            rows={3}
            placeholder="Enter a format (e.g., 2006-01-02T15:04:05Z07:00, %Y-%m-%d, yyyy-MM-dd'T'HH:mm:ss, Y-m-d H:i:s)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {translation && translation.parts.length > 0 && (
            <table className="mx-4 mb-4 text-xs" aria-label="Tokens">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-4 font-medium">Token</th>
                  <th className="py-1 font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {translation.parts
                  .filter((part) => part.src)
                  .map((part, index) => (
                    <tr key={index} className="border-t border-border/50">
                      <td className="py-1 pr-4 font-mono whitespace-pre">{part.src}</td>
                      <td className={`py-1 ${part.kind === "literal" ? "text-muted-foreground" : ""}`}>{describePart(part)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </EditorPane>
      }
      second={
        <EditorPane title="Translations">
          {translation ? (
            <div className="result-list">
              {DIALECTS.map(({ id, label }) => {
                const result = translation.targets[id];
                const isSource = id === translation.source;
                return (
                  <div key={id} className="result-row" style={{ alignItems: "start" }}>
                    <label className="result-row-label" htmlFor={`date-format-out-${id}`}>
                      {label}
                      {isSource && <span className="block font-normal">Source</span>}
                    </label>
                    <div className="min-w-0">
                      <textarea
                        id={`date-format-out-${id}`}
                        className="result-row-value code-textarea w-full"
                        value={result.format}
                        readOnly
                        rows={1}
                        placeholder="No equivalent"
                      />
                      {result.format && (
                        <p className="font-mono text-xs text-muted-foreground whitespace-pre-wrap" data-testid={`date-format-preview-${id}`}>
                          {renderFormat(result.format, id, previewDate, { utc })}
                        </p>
                      )}
                      {result.warnings.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-warning" aria-label={`${label} warnings`}>
                          {result.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <CopyButton value={result.format} iconOnly label={`Copy ${label} format`} />
                  </div>
                );
              })}
            </div>
          ) : (
            <PaneEmpty title="Translations appear here" hint="Each row shows the format in one language, a preview, and any warnings." />
          )}
        </EditorPane>
      }
      status={
        translation ? (
          <span>Read as {DIALECT_LABELS[translation.source]}{translation.detected ? " (detected)" : ""}</span>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
