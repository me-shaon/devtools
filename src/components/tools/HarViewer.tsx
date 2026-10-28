import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Download, FileJson, FileUp } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { saveFile } from "@/lib/desktop";
import { formatBytes } from "@/utils/hash";
import {
  filterRows,
  methodsOf,
  parseHar,
  queryParams,
  requestBody,
  RESOURCE_TYPE_LABELS,
  responseBody,
  responseBodyText,
  sanitizeHar,
  sortRows,
  timingBreakdown,
  toCurl,
  type HarNameValue,
  type HarRow,
  type HarSummary,
  type ParsedHar,
  type ResourceType,
  type SortDirection,
  type SortKey,
  type StatusClass,
} from "@/utils/har";

interface OpenedFile {
  name: string;
  text: string;
  size: number;
}

type DetailTab = "headers" | "query" | "cookies" | "request" | "response" | "timings";

const ROW_HEIGHT = 28;
const OVERSCAN = 12;
/** Longer bodies show cut short. Copy response gets the full text. */
const BODY_PREVIEW_CHARS = 200_000;
const STATUS_CLASSES: StatusClass[] = ["2xx", "3xx", "4xx", "5xx", "failed"];
const TYPES = Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[];

const STATUS_COLORS: Record<StatusClass, string> = {
  "1xx": "text-muted-foreground",
  "2xx": "text-success",
  "3xx": "text-info",
  "4xx": "text-warning",
  "5xx": "text-destructive",
  failed: "text-destructive",
};

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "How do I get a HAR file?",
    a: "Open the browser developer tools and select the Network tab. Load the page, then right-click a request and select Save all as HAR. Firefox and Safari have the same command in the Network panel.",
  },
  {
    q: "Is my HAR file uploaded?",
    a: "No. The tool reads and parses the file on this device. A HAR file can contain cookies, tokens, and passwords, so do not paste it into online viewers.",
  },
  {
    q: "What does Save sanitized HAR remove?",
    a: "It replaces the values of Authorization, Cookie, Set-Cookie, X-API-Key, and other credential headers. It also replaces all cookie values and query or form values with names such as token, key, or password. Keys and tokens in bodies are found with the Secret Redactor rules. Turn on Remove response bodies to remove all response content. Examine the file before you share it.",
  },
  {
    q: "Why do some timings show n/a?",
    a: "The HAR format uses -1 for a phase that does not apply. For example, a reused connection has no DNS, connect, or TLS time. TLS time is part of the connect time.",
  },
  {
    q: "Why do the transferred and content sizes differ?",
    a: "Transferred is the number of bytes on the network, with headers and compression. Content is the size of the decoded body. A response from the cache can show 0 B transferred.",
  },
];

const readFileText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the file."));
    reader.readAsText(file);
  });

const formatDuration = (ms: number) => {
  if (ms < 1) return ms > 0 ? "<1 ms" : "0 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
};

const sizeLabel = (bytes: number) => (bytes < 0 ? "?" : formatBytes(bytes));

const statusLabel = (row: HarRow) => (row.statusClass === "failed" ? "Failed" : String(row.status));

const summaryText = (summary: HarSummary) => {
  const parts = [
    `${summary.count} ${summary.count === 1 ? "request" : "requests"}`,
    `${formatBytes(summary.transferred)} transferred`,
    `${formatDuration(summary.span)} span`,
    `${summary.errors} ${summary.errors === 1 ? "error" : "errors"}`,
  ];
  if (summary.pages.length === 1) {
    const [page] = summary.pages;
    parts.push(`Page: ${page.title}${page.onLoad !== null ? ` (load ${formatDuration(page.onLoad)})` : ""}`);
  } else if (summary.pages.length > 1) {
    parts.push(`${summary.pages.length} pages`);
  }
  return parts.join(" · ");
};

/** A name and value list, used for headers, cookies, query parameters, and form fields. */
function NameValueTable({ title, items: raw, empty }: { title: string; items: unknown; empty: string }) {
  const items = Array.isArray(raw) ? (raw as unknown[]).filter((item): item is HarNameValue => typeof item === "object" && item !== null) : [];
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold text-muted-foreground">
        {title} <span className="font-normal">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full table-fixed text-xs" aria-label={title}>
          <tbody>
            {items.map((item, i) => (
              <tr key={`${item.name}-${i}`} className="border-b border-border/40 align-top">
                <th scope="row" className="w-2/5 break-words py-1 pr-3 text-left font-mono font-medium">{String(item.name ?? "")}</th>
                <td className="break-all py-1 font-mono">{String(item.value ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function CodeBlock({ text, label }: { text: string; label: string }) {
  const cut = text.length > BODY_PREVIEW_CHARS;
  return (
    <div className="space-y-1">
      <pre aria-label={label} className="max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">
        {cut ? text.slice(0, BODY_PREVIEW_CHARS) : text}
      </pre>
      {cut && <p className="text-xs text-muted-foreground">The body is long. The first 200,000 characters show. Copy it to get all of it.</p>}
    </div>
  );
}

interface RequestTableProps {
  rows: HarRow[];
  summary: HarSummary;
  selected: number | null;
  onSelect: (index: number) => void;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}

const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: "method", label: "Method", className: "w-16" },
  { key: "status", label: "Status", className: "w-16" },
  { key: "url", label: "URL", className: "" },
  { key: "type", label: "Type", className: "w-28" },
  { key: "size", label: "Size", className: "w-32 text-right" },
  { key: "time", label: "Time", className: "w-20 text-right" },
  { key: "start", label: "Waterfall", className: "w-28" },
];

/** The request table. Only the rows in view render, so archives with thousands of entries stay fast. */
function RequestTable({ rows, summary, selected, onSelect, sortKey, sortDirection, onSort }: RequestTableProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(800);

  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setViewport(el.clientHeight || 800));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  const span = summary.span || 1;

  // Arrow keys move the selection and keep the selected row in view
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const at = rows.findIndex((row) => row.index === selected);
    const next = event.key === "ArrowDown" ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1);
    const row = rows[next];
    if (!row) return;
    onSelect(row.index);
    const el = scroller.current;
    if (!el) return;
    const top = next * ROW_HEIGHT;
    const headerHeight = ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight - headerHeight) el.scrollTop = top + ROW_HEIGHT * 2 - el.clientHeight;
  };

  if (rows.length === 0) return <PaneEmpty title="No requests match" hint="Change the filters to see more requests." />;

  return (
    <div
      ref={scroller}
      className="h-full overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onKeyDown={onKeyDown}
      tabIndex={0}
      aria-label="Requests. Use the arrow keys to select a request."
    >
      <table className="w-full table-fixed text-xs" aria-label="Requests" aria-rowcount={rows.length + 1}>
        <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]">
          <tr style={{ height: ROW_HEIGHT }}>
            {COLUMNS.map((column) => {
              const active = sortKey === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-2 font-medium ${column.className}`}
                  aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(column.key)}>
                    {column.label}
                    {active && (sortDirection === "asc" ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {first > 0 && <tr aria-hidden="true" style={{ height: first * ROW_HEIGHT }} />}
          {rows.slice(first, last).map((row, i) => {
            const isSelected = row.index === selected;
            const offset = Number.isNaN(row.start) ? 0 : ((row.start - summary.firstStart) / span) * 100;
            const width = Math.max((row.time / span) * 100, 0.5);
            return (
              <tr
                key={row.index}
                aria-rowindex={first + i + 2}
                aria-selected={isSelected}
                onClick={() => onSelect(row.index)}
                className={`cursor-pointer border-b border-border/30 ${isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"}`}
                style={{ height: ROW_HEIGHT }}
              >
                <td className="truncate px-2 font-mono">{row.method}</td>
                <td className={`truncate px-2 font-mono ${STATUS_COLORS[row.statusClass]}`} title={row.statusText || String(row.entry.response?._error ?? "")}>
                  {statusLabel(row)}
                </td>
                <td className="truncate px-2" title={row.url}>
                  <span className="text-muted-foreground">{row.host}</span>
                  <span>{row.path}</span>
                </td>
                <td className="truncate px-2 text-muted-foreground" title={row.mimeType || RESOURCE_TYPE_LABELS[row.type]}>
                  {row.mimeType || RESOURCE_TYPE_LABELS[row.type]}
                </td>
                <td className="truncate px-2 text-right tabular-nums" title={`Transferred ${sizeLabel(row.transferSize)}. Content ${sizeLabel(row.contentSize)}.`}>
                  {sizeLabel(row.transferSize)}
                  <span className="text-muted-foreground"> / {sizeLabel(row.contentSize)}</span>
                </td>
                <td className="truncate px-2 text-right tabular-nums">{formatDuration(row.time)}</td>
                <td className="px-2" aria-label={`Starts at ${formatDuration(Number.isNaN(row.start) ? 0 : row.start - summary.firstStart)}`}>
                  <div className="relative h-2 rounded-sm bg-muted">
                    <div
                      className={`absolute inset-y-0 rounded-sm ${row.statusClass === "failed" || row.status >= 400 ? "bg-destructive/70" : "bg-primary/70"}`}
                      style={{ left: `${Math.min(offset, 99.5)}%`, width: `${Math.min(width, 100 - Math.min(offset, 99.5))}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
          {last < rows.length && <tr aria-hidden="true" style={{ height: (rows.length - last) * ROW_HEIGHT }} />}
        </tbody>
      </table>
    </div>
  );
}

function TimingsView({ row }: { row: HarRow }) {
  const phases = timingBreakdown(row.entry.timings);
  // HAR counts TLS inside connect, so the bar leaves it out of the total
  const total = phases.reduce((sum, p) => (p.key === "ssl" || p.ms === null ? sum : sum + p.ms), 0) || 1;
  let offset = 0;
  return (
    <table className="w-full text-xs" aria-label="Timings">
      <tbody>
        {phases.map((phase) => {
          const left = offset;
          if (phase.ms !== null && phase.key !== "ssl") offset += phase.ms;
          return (
            <tr key={phase.key} className="border-b border-border/40">
              <th scope="row" className="w-28 py-1 pr-3 text-left font-medium">{phase.label}</th>
              <td className="w-20 py-1 pr-3 text-right tabular-nums">{phase.ms === null ? "n/a" : formatDuration(phase.ms)}</td>
              <td className="py-1">
                {phase.ms !== null && phase.ms > 0 && (
                  <div className="relative h-2 rounded-sm bg-muted">
                    <div
                      className="absolute inset-y-0 rounded-sm bg-primary/70"
                      style={{ left: `${(phase.key === "ssl" ? left - phase.ms : left) / total * 100}%`, width: `${Math.max((phase.ms / total) * 100, 0.5)}%` }}
                    />
                  </div>
                )}
              </td>
            </tr>
          );
        })}
        <tr>
          <th scope="row" className="py-1 pr-3 text-left font-semibold">Total</th>
          <td className="py-1 pr-3 text-right font-semibold tabular-nums">{formatDuration(row.time)}</td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}

function EntryDetail({ row, tab }: { row: HarRow; tab: DetailTab }) {
  // A HAR entry can leave out parts, so read each part with a fallback
  const request = row.entry.request ?? {};
  const response = row.entry.response ?? {};
  let body: ReactNode;
  if (tab === "headers") {
    body = (
      <>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">URL</dt>
          <dd className="break-all font-mono">{row.url}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd className={`font-mono ${STATUS_COLORS[row.statusClass]}`}>
            {row.statusClass === "failed" ? `Failed${response._error ? `: ${response._error}` : ""}` : `${row.status} ${row.statusText}`}
          </dd>
          {request.httpVersion && (
            <>
              <dt className="text-muted-foreground">Protocol</dt>
              <dd className="font-mono">{request.httpVersion}</dd>
            </>
          )}
          {typeof row.entry.serverIPAddress === "string" && row.entry.serverIPAddress && (
            <>
              <dt className="text-muted-foreground">Remote address</dt>
              <dd className="font-mono">{row.entry.serverIPAddress}</dd>
            </>
          )}
        </dl>
        <NameValueTable title="Request headers" items={request.headers ?? []} empty="The request has no headers." />
        <NameValueTable title="Response headers" items={response.headers ?? []} empty="The response has no headers." />
      </>
    );
  } else if (tab === "query") {
    body = <NameValueTable title="Query parameters" items={queryParams(row.entry)} empty="The URL has no query parameters." />;
  } else if (tab === "cookies") {
    body = (
      <>
        <NameValueTable title="Request cookies" items={request.cookies ?? []} empty="The request sent no cookies." />
        <NameValueTable title="Response cookies" items={response.cookies ?? []} empty="The response set no cookies." />
      </>
    );
  } else if (tab === "request") {
    const post = requestBody(row.entry);
    body =
      post.kind === "none" ? (
        <p className="text-xs text-muted-foreground">The request has no body.</p>
      ) : post.kind === "form" ? (
        <NameValueTable title={`Form data${post.mimeType ? ` (${post.mimeType})` : ""}`} items={post.params} empty="The form has no fields." />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{post.mimeType || "No MIME type"}{post.json ? " · JSON, formatted" : ""}</p>
          <CodeBlock text={post.text} label="Request body" />
        </>
      );
  } else if (tab === "response") {
    const content = responseBody(row.entry);
    body =
      content.kind === "none" ? (
        <p className="text-xs text-muted-foreground">The HAR has no response body for this request. Some browsers leave out bodies when they export.</p>
      ) : content.kind === "image" ? (
        <>
          <p className="text-xs text-muted-foreground">{content.mimeType} · {formatBytes(content.size)}</p>
          <img src={content.dataUri} alt={`Response image from ${row.url}`} className="max-h-80 max-w-full rounded-md border bg-[repeating-conic-gradient(hsl(var(--muted))_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]" />
        </>
      ) : content.kind === "binary" ? (
        <p className="text-xs text-muted-foreground">The body is binary data ({content.mimeType || "unknown type"}, {formatBytes(content.size)}). Copy response gives the Base64 text.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{content.mimeType || "No MIME type"}{content.json ? " · JSON, formatted" : ""}</p>
          <CodeBlock text={content.text} label="Response body" />
        </>
      );
  } else {
    body = <TimingsView row={row} />;
  }
  return <div className="space-y-4 p-4">{body}</div>;
}

export function HarViewer() {
  const [input, setInput] = useState("");
  const [file, setFile] = useState<OpenedFile | null>(null);
  const [filterText, setFilterText] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState<StatusClass | "">("");
  const [type, setType] = useState<ResourceType | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("start");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<DetailTab>("headers");
  const [removeBodies, setRemoveBodies] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingInput = useDebouncedValue(input, 250);
  const pendingFilter = useDebouncedValue(filterText);
  const source = file ? file.text : pendingInput;

  // Parse once per input. Filters and sorting work on the parsed rows.
  const result = useMemo<{ parsed: ParsedHar } | { error: string } | null>(() => {
    if (!source.trim()) return null;
    try {
      return { parsed: parseHar(source) };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [source]);
  const parsed = result && "parsed" in result ? result.parsed : null;
  const error = result && "error" in result ? result.error : "";

  useEffect(() => setSelected(null), [parsed]);

  const methods = useMemo(() => (parsed ? methodsOf(parsed.rows) : []), [parsed]);
  // Sort all rows first, then filter. The order stays the same when a filter is set or cleared.
  const sorted = useMemo(() => (parsed ? sortRows(parsed.rows, sortKey, sortDirection) : []), [parsed, sortKey, sortDirection]);
  const visible = useMemo(() => filterRows(sorted, { text: pendingFilter, method, status, type }), [sorted, pendingFilter, method, status, type]);
  const selectedRow = parsed && selected !== null ? parsed.rows.find((row) => row.index === selected) ?? null : null;

  const curl = useMemo(() => (selectedRow ? toCurl(selectedRow.entry) : ""), [selectedRow]);
  const bodyText = useMemo(() => (selectedRow ? responseBodyText(selectedRow.entry) : ""), [selectedRow]);

  const openFile = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      setFile({ name: picked.name, text: await readFileText(picked), size: picked.size });
      setInput("");
    } catch {
      toast.error("Could not read the file. Choose it again.");
    }
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    setDragging(false);
    void openFile(event.dataTransfer.files[0]);
  };

  const clear = () => {
    setFile(null);
    setInput("");
  };

  const sort = (key: SortKey) => {
    if (key === sortKey) setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDirection(key === "size" || key === "time" ? "desc" : "asc");
    }
  };

  const saveSanitized = async () => {
    if (!parsed) return;
    const base = file?.name.replace(/\.(har|json)$/i, "") || "archive";
    const fileName = `${base}.sanitized.har`;
    try {
      const { har, redacted } = sanitizeHar(parsed.har, { removeResponseBodies: removeBodies });
      if (await saveFile(new Blob([JSON.stringify(har, null, 2)], { type: "application/json" }), fileName)) {
        toast.success(`Saved ${fileName}. Replaced ${redacted} sensitive ${redacted === 1 ? "value" : "values"}.`);
      }
    } catch (err) {
      toast.error((err as Error).message || "Unable to save the file.");
    }
  };

  const notice = error ? (
    <div className="workspace-notice" data-tone="error" role="alert">{error}</div>
  ) : parsed ? (
    <div className="workspace-notice" role="status">{summaryText(parsed.summary)}</div>
  ) : undefined;

  const filters = parsed ? (
    <>
      <label htmlFor="har-filter" className="sr-only">Filter requests</label>
      <Input
        id="har-filter"
        className="h-7 w-64 text-xs"
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        placeholder="Filter by URL, status, or MIME type"
        autoComplete="off"
        spellCheck={false}
      />
      <label className="indent-control">
        Method
        <select aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">All</option>
          {methods.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <label className="indent-control">
        Status
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusClass | "")}>
          <option value="">All</option>
          {STATUS_CLASSES.map((s) => <option key={s} value={s}>{s === "failed" ? "Failed" : s}</option>)}
        </select>
      </label>
      <label className="indent-control">
        Type
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as ResourceType | "")}>
          <option value="">All</option>
          {TYPES.map((t) => <option key={t} value={t}>{RESOURCE_TYPE_LABELS[t]}</option>)}
        </select>
      </label>
    </>
  ) : undefined;

  return (
    <ToolWorkspace
      id="har-viewer"
      toolbar={
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".har,.json,application/json"
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
          <label className="option-switch indent-control" htmlFor="har-remove-bodies">
            Remove response bodies
            <Switch id="har-remove-bodies" checked={removeBodies} onCheckedChange={setRemoveBodies} />
          </label>
          <button type="button" className="toolbar-text-button" onClick={() => void saveSanitized()} disabled={!parsed}>
            <Download size={14} aria-hidden="true" />
            Save sanitized HAR
          </button>
        </>
      }
      secondaryToolbar={filters}
      notice={notice}
      first={
        <EditorPane
          title={parsed ? "Requests" : "HAR"}
          htmlFor={parsed || file ? undefined : "har-input"}
          scroll={false}
          actions={
            (file || input) && (
              <button type="button" className="toolbar-text-button" onClick={clear}>
                Clear
              </button>
            )
          }
        >
          <div
            className={`flex h-full min-h-0 flex-col ${dragging ? "bg-accent" : ""}`}
            data-dragging={dragging || undefined}
            onDragOver={onDragOver}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {file && (
              <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
                <FileJson className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
              </div>
            )}
            {parsed ? (
              <div className="min-h-0 flex-1">
                <RequestTable
                  rows={visible}
                  summary={parsed.summary}
                  selected={selected}
                  onSelect={setSelected}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={sort}
                />
              </div>
            ) : file ? (
              <PaneEmpty title="The file is not a valid HAR file" hint="Open another file, or select Clear." />
            ) : (
              <CodeTextarea
                id="har-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste HAR JSON, or drop a .har file exported from the browser Network panel"
              />
            )}
          </div>
        </EditorPane>
      }
      second={
        <EditorPane
          title="Details"
          actions={
            <>
              <CopyButton value={curl} label="Copy as cURL" />
              <CopyButton value={selectedRow?.url ?? ""} label="Copy URL" />
              <CopyButton value={bodyText} label="Copy response" ariaLabel="Copy response body" />
            </>
          }
        >
          {selectedRow ? (
            <div className="flex flex-col">
              <div className="border-b px-4 py-2">
                <Tabs value={tab} onValueChange={(v) => setTab(v as DetailTab)}>
                  <TabsList aria-label="Request details">
                    <TabsTrigger value="headers">Headers</TabsTrigger>
                    <TabsTrigger value="query">Query</TabsTrigger>
                    <TabsTrigger value="cookies">Cookies</TabsTrigger>
                    <TabsTrigger value="request">Request</TabsTrigger>
                    <TabsTrigger value="response">Response</TabsTrigger>
                    <TabsTrigger value="timings">Timings</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <EntryDetail row={selectedRow} tab={tab} />
            </div>
          ) : (
            <PaneEmpty
              title={parsed ? "Select a request" : "Request details appear here"}
              hint={parsed ? "Select a row to see its headers, body, and timings." : "Open a .har file or paste HAR JSON."}
            />
          )}
        </EditorPane>
      }
      status={parsed ? <span>Showing {visible.length} of {parsed.rows.length} requests</span> : error ? <span className="text-destructive">Invalid input</span> : <span>Ready</span>}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
