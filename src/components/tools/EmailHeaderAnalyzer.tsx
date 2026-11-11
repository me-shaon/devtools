import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useRef, useState } from "react";
import { FileUp, MailSearch } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { MAX_EMAIL_BYTES } from "@/utils/email-reader";
import { readEmail } from "@/utils/email-runner";
import {
  analyzeHeaders,
  authSummary,
  formatDelay,
  resultTone,
  SLOW_HOP_MS,
  type AuthResult,
  type HeaderAnalysis,
  type Hop,
} from "@/utils/email-headers";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "How do I get the headers of a message?",
    a: "In Gmail, open the message, open the More menu, and select Show original. In Outlook, open the message and select File, then Properties, and copy Internet headers. In Apple Mail, select View, then Message, then All Headers. You can also open a .eml or .msg file.",
  },
  {
    q: "In which order are the hops?",
    a: "Each server adds a Received header above the ones before it. The tool reverses them, so hop 1 is the server that sent the message first and the last hop is the server that delivered it.",
  },
  {
    q: "How is the delay calculated?",
    a: "The delay of a hop is the time in its Received header minus the time of the hop before it. The first hop is compared with the Date header. Server clocks can be wrong, so a small or negative delay is not exact.",
  },
  {
    q: "Can I trust the SPF, DKIM, and DMARC results?",
    a: "Trust the results that your own mail server wrote. They are in the top Authentication-Results header, and the tool shows them first. A sender can add false Authentication-Results headers lower in the message.",
  },
  {
    q: "Is anything sent over the network?",
    a: "No. The tool reads the headers on this device and does no DNS lookups. The results come from the headers that the servers wrote when they received the message.",
  },
];

const TONE_CLASS = { pass: "text-success", fail: "text-destructive", neutral: "text-warning" } as const;

const formatDate = (date: Date) =>
  date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });

const formatHopTime = (date: Date) =>
  date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });

/** Lets a host name wrap after its dots, not in the middle of a label. */
function HostName({ value }: { value: string }) {
  const labels = value.split(".");
  return (
    <span className="block break-words font-mono">
      {labels.map((label, i) => (
        <span key={i}>
          {label}
          {i < labels.length - 1 && <>.<wbr /></>}
        </span>
      ))}
    </span>
  );
}

function ResultValue({ result }: { result: AuthResult | null }) {
  if (!result) return <span className="text-muted-foreground">Not checked</span>;
  const details = Object.entries(result.props)
    .filter(([key]) => !key.endsWith(".b"))
    .map(([key, value]) => `${key}=${value}`);
  return (
    <span className="block min-w-0">
      <span className={`font-medium ${TONE_CLASS[resultTone(result.result)]}`}>{result.result}</span>
      {details.length > 0 && <span className="ml-2 break-all font-mono text-2xs text-muted-foreground">{details.join(" ")}</span>}
      {result.comment && <span className="block break-words text-2xs text-muted-foreground">{result.comment}</span>}
    </span>
  );
}

function HopRow({ hop }: { hop: Hop }) {
  const slow = hop.delay !== null && hop.delay >= SLOW_HOP_MS;
  return (
    <tr className="border-b border-border/40 align-top">
      <td className="px-4 py-1.5 font-mono text-muted-foreground">{hop.index}</td>
      <td className="min-w-0 py-1.5 pr-3">
        <HostName value={hop.from || "(local)"} />
        {hop.ip && <span className="block font-mono text-2xs text-muted-foreground">{hop.ip}</span>}
      </td>
      <td className="py-1.5 pr-3">
        <HostName value={hop.by || "Unknown"} />
        {hop.protocol && <span className="block font-mono text-2xs text-muted-foreground">{hop.protocol}</span>}
      </td>
      <td className="py-1.5 pr-3 text-muted-foreground">{hop.date ? formatHopTime(hop.date) : "No date"}</td>
      <td className={`py-1.5 pr-4 text-right font-mono ${slow ? "font-medium text-warning" : hop.delay !== null && hop.delay < 0 ? "text-destructive" : ""}`}>
        {hop.delay === null ? "–" : formatDelay(hop.delay)}
      </td>
    </tr>
  );
}

function Analysis({ analysis }: { analysis: HeaderAnalysis }) {
  const summary: [string, string][] = (
    [
      ["From", analysis.from],
      ["To", analysis.to],
      ["Subject", analysis.subject],
      ["Date", analysis.date ? formatDate(analysis.date) : ""],
      ["Return-Path", analysis.returnPath],
      ["Reply-To", analysis.replyTo],
      ["Message-ID", analysis.messageId],
    ] as [string, string][]
  ).filter(([, value]) => value);

  const methods = ["spf", "dkim", "dmarc"].map((method) => [method, authSummary(analysis.auth, method)] as const);
  const arc = authSummary(analysis.auth, "arc");
  const server = analysis.auth[0]?.server;
  const signers = analysis.dkimSignatures.filter((sig) => sig.domain);

  return (
    <div className="result-list">
      {analysis.warnings.map((warning) => (
        <div key={warning} className="pane-options text-warning" role="status">{warning}</div>
      ))}
      {summary.map(([label, value]) => (
        <div key={label} className="result-row">
          <span className="result-row-label">{label}</span>
          <span className="result-row-value break-all">{value}</span>
          <span />
        </div>
      ))}

      <div className="pane-options">
        <span className="font-medium" id="email-headers-auth">Authentication</span>
        {server && <span className="text-muted-foreground">Checked by {server}</span>}
      </div>
      <div role="table" aria-labelledby="email-headers-auth">
        {methods.map(([method, result]) => (
          <div key={method} role="row" className="result-row">
            <span role="rowheader" className="result-row-label">{method.toUpperCase()}</span>
            <span role="cell" className="result-row-value"><ResultValue result={result} /></span>
            <span />
          </div>
        ))}
        {arc && (
          <div role="row" className="result-row">
            <span role="rowheader" className="result-row-label">ARC</span>
            <span role="cell" className="result-row-value"><ResultValue result={arc} /></span>
            <span />
          </div>
        )}
        {signers.length > 0 && (
          <div role="row" className="result-row">
            <span role="rowheader" className="result-row-label">Signed by</span>
            <span role="cell" className="result-row-value break-all font-mono">
              {signers.map((sig) => `${sig.domain}${sig.selector ? ` (s=${sig.selector})` : ""}`).join(", ")}
            </span>
            <span />
          </div>
        )}
      </div>

      <div className="pane-options">
        <span className="font-medium" id="email-headers-hops">Delivery path</span>
        {analysis.totalDelay !== null && <span className="text-muted-foreground">Total {formatDelay(analysis.totalDelay)}</span>}
      </div>
      {analysis.hops.length ? (
        <table className="w-full table-fixed text-xs" aria-labelledby="email-headers-hops">
          <thead>
            <tr className="border-b text-left text-2xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="w-10 px-4 py-1.5 font-medium">#</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">From</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">By</th>
              <th scope="col" className="w-36 py-1.5 pr-3 font-medium">Time</th>
              <th scope="col" className="w-24 py-1.5 pr-4 text-right font-medium">Delay</th>
            </tr>
          </thead>
          <tbody>
            {analysis.hops.map((hop) => (
              <HopRow key={hop.index} hop={hop} />
            ))}
          </tbody>
        </table>
      ) : (
        <div className="pane-options text-muted-foreground">The headers have no Received lines.</div>
      )}
    </div>
  );
}

export function EmailHeaderAnalyzer() {
  const [input, setInput] = useState("");
  const text = useDebouncedValue(input);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return { ok: true as const, analysis: analyzeHeaders(text) };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  }, [text]);
  const analysis = parsed?.ok ? parsed.analysis : null;

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_EMAIL_BYTES) {
      toast.error("The file is larger than 100 MB.");
      return;
    }
    const result = await readEmail(new Uint8Array(await file.arrayBuffer()));
    if (!result) return;
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if (!result.email.headers.length) {
      toast.error("This message has no transport headers. Outlook keeps them only for messages that arrived over the internet.");
      return;
    }
    setInput(result.email.headers.map((h) => `${h.name}: ${h.value}`).join("\n"));
  };

  const report = analysis
    ? JSON.stringify(
        {
          from: analysis.from,
          subject: analysis.subject,
          date: analysis.date?.toISOString() ?? null,
          totalDelayMs: analysis.totalDelay,
          authentication: analysis.auth,
          dkimSignatures: analysis.dkimSignatures,
          hops: analysis.hops.map(({ index, from, ip, by, protocol, date, delay }) => ({ index, from, ip, by, protocol, date: date?.toISOString() ?? null, delayMs: delay })),
          warnings: analysis.warnings,
        },
        null,
        2,
      )
    : "";

  const failing = analysis
    ? ["spf", "dkim", "dmarc"].flatMap((method) => {
        const result = authSummary(analysis.auth, method)?.result ?? "";
        return resultTone(result) === "fail" ? [`${method.toUpperCase()} ${result}`] : [];
      })
    : [];

  return (
    <ToolWorkspace
      id="email-headers"
      toolbar={
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".eml,.msg,.txt,message/rfc822,application/vnd.ms-outlook"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void openFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button type="button" className="toolbar-text-button" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={14} aria-hidden="true" />
            Open file
          </button>
          <CopyButton value={report} label="Copy report" />
        </>
      }
      notice={parsed && !parsed.ok ? <div className="workspace-notice" data-tone="error" role="alert">{parsed.error}</div> : undefined}
      first={
        <EditorPane
          title="Headers"
          htmlFor="email-headers-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea
            id="email-headers-input"
            placeholder="Paste the headers of an email, or open a .eml or .msg file"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane title="Analysis">
          {analysis ? (
            <Analysis analysis={analysis} />
          ) : (
            <PaneEmpty
              icon={<MailSearch size={20} aria-hidden="true" />}
              title="The delivery path appears here"
              hint="See each server the message passed through, the delay at each hop, and the SPF, DKIM, and DMARC results."
            />
          )}
        </EditorPane>
      }
      status={
        analysis ? (
          <>
            <span>{analysis.hops.length} {analysis.hops.length === 1 ? "hop" : "hops"}</span>
            {analysis.totalDelay !== null && <span>{formatDelay(analysis.totalDelay)} in transit</span>}
            {failing.length > 0 ? (
              <span className="text-destructive">{failing.join(", ")}</span>
            ) : analysis.auth.length > 0 ? (
              <span className="text-success">No failed checks</span>
            ) : null}
          </>
        ) : parsed ? (
          <span className="text-destructive">Invalid input</span>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
