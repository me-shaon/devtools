import { useDarkClass } from "@/hooks/useDarkClass";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Download, FileUp, Mail, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { saveFile } from "@/lib/desktop";
import { formatBytes } from "@/utils/hash";
import { buildPreviewDocument, previewSandbox } from "@/utils/html-preview";
import {
  formatAddress,
  hasRemoteContent,
  MAX_EMAIL_BYTES,
  safeFileName,
  type EmailAddress,
  type EmailAttachment,
  type EmailReadResult,
} from "@/utils/email-reader";
import { readEmail } from "@/utils/email-runner";

interface OpenedFile {
  name: string;
  bytes: Uint8Array;
}

type BodyTab = "preview" | "text" | "headers";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Is my email uploaded?",
    a: "No. The tool reads the file on this device. Nothing is sent over the network, and the HTML preview blocks every network request.",
  },
  {
    q: "Which files can I open?",
    a: "Standard .eml files (RFC 5322 with MIME) and Outlook .msg files. The tool tells them apart by their content, so a renamed file still opens. You can also paste the raw source of a message.",
  },
  {
    q: "Why are images from the web missing?",
    a: "Remote images are often tracking pixels that report when you open a message. The preview never loads them. Images attached to the message appear inline.",
  },
  {
    q: "Why does a .msg file show no headers?",
    a: "Outlook stores the sender, recipients, and times as properties. It keeps the full transport headers only for messages that arrived over the internet.",
  },
  {
    q: "Are attachments safe to open?",
    a: "Saving an attachment writes it to disk exactly as stored. Scan files from an unknown sender before you open them.",
  },
];

const readFileBytes = (file: File): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the file."));
    reader.readAsArrayBuffer(file);
  });

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long" }).format(date);

function AddressRow({ label, list }: { label: string; list: EmailAddress[] }) {
  if (!list.length) return null;
  return (
    <tr className="border-b border-border/40 align-top">
      <th scope="row" className="w-24 py-1 pr-3 text-left font-medium text-muted-foreground">{label}</th>
      <td className="break-words py-1">
        {list.map((a, i) => (
          <span key={`${a.address}-${i}`} className="mr-2 inline-block" title={formatAddress(a)}>
            {a.name && a.address ? <>{a.name} <span className="text-muted-foreground">&lt;{a.address}&gt;</span></> : a.name || a.address}
          </span>
        ))}
      </td>
    </tr>
  );
}

function TextRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <tr className="border-b border-border/40 align-top">
      <th scope="row" className="w-24 py-1 pr-3 text-left font-medium text-muted-foreground">{label}</th>
      <td className="break-all py-1">{value}</td>
    </tr>
  );
}

function AttachmentList({ attachments, onSave }: { attachments: EmailAttachment[]; onSave: (a: EmailAttachment) => void }) {
  return (
    <section className="space-y-1 px-4 pb-4">
      <h3 className="text-xs font-semibold text-muted-foreground">
        Attachments <span className="font-normal">({attachments.length})</span>
      </h3>
      <ul className="divide-y divide-border/40 text-xs" aria-label="Attachments">
        {attachments.map((a, i) => (
          <li key={`${a.name}-${i}`} className="flex items-center gap-2 py-1.5">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {/* The list shows the name that Save writes, so direction characters cannot hide the real extension */}
            <span className="min-w-0 flex-1 truncate" title={safeFileName(a.name)}>{safeFileName(a.name)}</span>
            <span className="shrink-0 text-muted-foreground">{a.mimeType}</span>
            <span className="w-16 shrink-0 text-right text-muted-foreground">{formatBytes(a.size)}</span>
            <button type="button" className="toolbar-text-button" onClick={() => onSave(a)} aria-label={`Save ${safeFileName(a.name)}`}>
              <Download size={14} aria-hidden="true" />
              Save
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EmailReader() {
  const [input, setInput] = useState("");
  const [file, setFile] = useState<OpenedFile | null>(null);
  const [fileError, setFileError] = useState("");
  const [tab, setTab] = useState<BodyTab>("preview");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingInput = useDebouncedValue(input, 250);
  // After Clear, the debounced value still holds the old text for a moment, so an empty input wins
  const source = input.trim() ? pendingInput : "";

  const [result, setResult] = useState<EmailReadResult | null>(null);
  const [reading, setReading] = useState(false);
  const dark = useDarkClass();

  // A large file takes a while, so the message is read in a worker. A newer file replaces an older read.
  useEffect(() => {
    const bytes = file ? file.bytes : source.trim() ? new TextEncoder().encode(source) : null;
    if (!bytes) {
      setResult(null);
      setReading(false);
      return;
    }
    let current = true;
    setReading(true);
    void readEmail(bytes).then((next) => {
      if (!current || !next) return;
      setResult(next);
      setReading(false);
    });
    return () => {
      current = false;
    };
  }, [file, source]);
  // The project does not use strict mode, so narrow the union by its fields
  const email = result && "email" in result ? result.email : null;
  const error = fileError || (result && "error" in result ? result.error : "");

  const html = result && "html" in result ? result.html : "";
  const srcDoc = useMemo(() => (html.trim() ? buildPreviewDocument(html, { scripts: false, dark }) : ""), [html, dark]);
  const remote = useMemo(() => hasRemoteContent(html), [html]);
  const listed = useMemo(() => (email ? email.attachments.filter((a) => !a.inline) : []), [email]);

  // The preview needs HTML. A message with only text opens on the Text tab.
  const activeTab: BodyTab = tab === "preview" && email && !srcDoc ? "text" : tab;

  const openFile = async (picked: File | undefined) => {
    if (!picked) return;
    if (picked.size > MAX_EMAIL_BYTES) {
      setFileError("The file is larger than 100 MB.");
      return;
    }
    try {
      setFile({ name: picked.name, bytes: await readFileBytes(picked) });
      setFileError("");
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
    setFileError("");
    setInput("");
  };

  const saveAttachment = async (attachment: EmailAttachment) => {
    const name = safeFileName(attachment.name);
    try {
      if (await saveFile(new Blob([attachment.bytes as BlobPart], { type: attachment.mimeType }), name)) toast.success(`Saved ${name}.`);
    } catch (err) {
      toast.error((err as Error).message || "Unable to save the file.");
    }
  };

  const headersText = email ? email.headers.map((h) => `${h.name}: ${h.value}`).join("\n") : "";

  const notice = error ? (
    <div className="workspace-notice" data-tone="error" role="alert">{error}</div>
  ) : email ? (
    <div className="workspace-notice" role="status">
      {[
        email.format === "msg" ? "Outlook message (.msg)" : "Email message (.eml)",
        `${listed.length} ${listed.length === 1 ? "attachment" : "attachments"}`,
        remote ? "Remote images blocked" : "",
        ...email.warnings,
      ].filter(Boolean).join(" · ")}
    </div>
  ) : undefined;

  let body;
  if (!email) {
    body = <PaneEmpty icon={<Mail className="h-6 w-6" aria-hidden="true" />} title="The message appears here" hint="Open a .eml or .msg file, or paste the source of an email." />;
  } else if (activeTab === "preview") {
    body = (
      <iframe
        title="Email preview"
        sandbox={previewSandbox(false)}
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        className="absolute inset-0 h-full w-full bg-background"
      />
    );
  } else if (activeTab === "text") {
    body = email.text ? (
      <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs">{email.text}</pre>
    ) : (
      <PaneEmpty title="No plain text body" hint="This message only has an HTML body. Open the Preview tab." />
    );
  } else {
    body = email.headers.length ? (
      <table className="w-full table-fixed p-4 text-xs" aria-label="Headers">
        <tbody>
          {email.headers.map((h, i) => (
            <tr key={`${h.name}-${i}`} className="border-b border-border/40 align-top">
              <th scope="row" className="w-1/4 break-words px-4 py-1 text-left font-mono font-medium">{h.name}</th>
              <td className="break-all py-1 pr-4 font-mono">{h.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <PaneEmpty title="No transport headers" hint="Outlook did not store the internet headers for this message." />
    );
  }

  return (
    <ToolWorkspace
      id="email-reader"
      toolbar={
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook"
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
        </>
      }
      notice={notice}
      first={
        <EditorPane
          title={email ? "Message" : "Email"}
          htmlFor={email || file ? undefined : "email-input"}
          actions={
            (file || input) && (
              <button type="button" className="toolbar-text-button" onClick={clear}>
                Clear
              </button>
            )
          }
        >
          <div
            className={`flex min-h-full flex-col ${dragging ? "bg-accent" : ""}`}
            data-dragging={dragging || undefined}
            onDragOver={onDragOver}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {email ? (
              <>
                {file && (
                  <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
                    <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{file.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatBytes(file.bytes.length)}</span>
                  </div>
                )}
                <div className="space-y-3 p-4">
                  <h2 className="break-words text-base font-semibold">{email.subject || "(no subject)"}</h2>
                  <table className="w-full table-fixed text-xs" aria-label="Message details">
                    <tbody>
                      <AddressRow label="From" list={email.from} />
                      <AddressRow label="To" list={email.to} />
                      <AddressRow label="Cc" list={email.cc} />
                      <AddressRow label="Bcc" list={email.bcc} />
                      <AddressRow label="Reply-To" list={email.replyTo} />
                      <TextRow label="Date" value={email.date ? formatDate(email.date) : ""} />
                      <TextRow label="Message-ID" value={email.messageId} />
                    </tbody>
                  </table>
                </div>
                {listed.length > 0 && <AttachmentList attachments={listed} onSave={(a) => void saveAttachment(a)} />}
              </>
            ) : file ? (
              <PaneEmpty title="The file could not be read" hint="Open another file, or select Clear." />
            ) : (
              <CodeTextarea
                id="email-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste the source of an email, or drop a .eml or .msg file"
              />
            )}
          </div>
        </EditorPane>
      }
      second={
        <EditorPane
          title="Body"
          scroll={activeTab !== "preview"}
          actions={
            <>
              <CopyButton value={email?.text ?? ""} label="Copy text" ariaLabel="Copy plain text body" />
              <CopyButton value={headersText} label="Copy headers" />
            </>
          }
        >
          <div className="flex h-full min-h-0 flex-col">
            {email && (
              <div className="border-b px-4 py-2">
                <Tabs value={activeTab} onValueChange={(v) => setTab(v as BodyTab)}>
                  <TabsList aria-label="Message body">
                    <TabsTrigger value="preview" disabled={!srcDoc}>Preview</TabsTrigger>
                    <TabsTrigger value="text">Text</TabsTrigger>
                    <TabsTrigger value="headers">Headers</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}
            <div className="relative min-h-0 flex-1 overflow-auto">{body}</div>
          </div>
        </EditorPane>
      }
      status={
        reading ? (
          <span>Reading the message…</span>
        ) : email ? (
          <span>{email.subject || "(no subject)"}</span>
        ) : error ? (
          <span className="text-destructive">Invalid input</span>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
