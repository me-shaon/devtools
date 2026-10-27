import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useState } from "react";
import { Terminal } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import {
  CODE_TARGETS,
  describeBody,
  generateCode,
  parseCurl,
  type CodeTarget,
  type CurlRequest,
} from "@/utils/curl-to-code";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which curl commands can I paste?",
    a: "Paste a command from a terminal, from API docs, or from a browser's Copy as cURL menu. Both the bash and the Windows cmd formats work. Backslash and caret line continuations are joined.",
  },
  {
    q: "Which flags are converted?",
    a: "The URL, -X, -H, -d and its variants, --json, -F, -u, -b, -A, -e, -G, -L, -k, --compressed, -I, -m, and --http2. Output flags such as -s, -v, -i, and -o are ignored. The notice lists every flag that was not converted.",
  },
  {
    q: "What happens with @file arguments?",
    a: "For -d @file, the body gets a placeholder, because the tool cannot read your files. For -F name=@file, the code opens the file where the language makes that simple, and uses a placeholder in browser JavaScript.",
  },
  {
    q: "Are tokens and passwords hidden?",
    a: "No. The code keeps every header and password as written, so it works when you run it. To mask secrets before you share the code, use the Secret & PII Redactor tool.",
  },
];

const PLACEHOLDER = `curl -X POST https://api.example.com/v1/items \\
  -H 'Authorization: Bearer <token>' \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Widget","price":9.99}'`;

const SECRET_HEADER = /authorization|cookie|token|api[-_]?key|secret|session|password/i;
const SECRET_QUERY = /[?&][^=&]*(token|key|secret|signature|sig|password)[^=&]*=/i;

const hasSecrets = (req: CurlRequest) =>
  Boolean(req.auth) || req.headers.some(([name]) => SECRET_HEADER.test(name)) || SECRET_QUERY.test(req.url);

const shortUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
};

export function CurlToCode() {
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<CodeTarget>("javascript");
  const [rustAsync, setRustAsync] = useState(false);
  const command = useDebouncedValue(input);

  const parsed = useMemo(() => {
    if (!command.trim()) return null;
    try {
      return { request: parseCurl(command), error: "" };
    } catch (error) {
      return { request: null, error: error instanceof Error ? error.message : "Could not read the command." };
    }
  }, [command]);

  const current = input.trim() ? parsed : null;
  const request = current?.request ?? null;
  const code = useMemo(() => (request ? generateCode(request, target, { rustAsync }) : ""), [request, target, rustAsync]);
  const targetLabel = CODE_TARGETS.find((t) => t.value === target)?.label ?? "Code";

  const notes = request
    ? [
        ...request.notes,
        ...(request.ignoredFlags.length ? [`Ignored flags: ${request.ignoredFlags.join(", ")}`] : []),
        ...(request.unknownFlags.length ? [`Unknown flags, not converted: ${request.unknownFlags.join(", ")}`] : []),
      ]
    : [];

  const status = () => {
    if (current?.error) return <span className="text-destructive">Invalid command</span>;
    if (!request) return <span>Ready</span>;
    const headerCount = request.headers.length + (request.auth ? 1 : 0);
    return (
      <>
        <span>{request.method}</span>
        <span className="min-w-0 truncate" title={request.url}>{shortUrl(request.url)}</span>
        <span>{headerCount} {headerCount === 1 ? "header" : "headers"}</span>
        <span>{describeBody(request.body)}</span>
      </>
    );
  };

  return (
    <ToolWorkspace
      id="curl-to-code"
      toolbar={
        <>
          <Tabs value={target} onValueChange={(v) => setTarget(v as CodeTarget)}>
            <TabsList aria-label="Language">
              {CODE_TARGETS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {target === "rust" && (
            <label className="option-switch indent-control" htmlFor="curl-to-code-rust-async">
              Async (Tokio)
              <Switch id="curl-to-code-rust-async" checked={rustAsync} onCheckedChange={setRustAsync} />
            </label>
          )}
        </>
      }
      notice={
        current?.error ? (
          <div className="workspace-notice" data-tone="error" role="alert">{current.error}</div>
        ) : request && (notes.length > 0 || hasSecrets(request)) ? (
          <>
            {notes.map((note) => (
              <div key={note} className="workspace-notice">{note}</div>
            ))}
            {hasSecrets(request) && (
              <div className="workspace-notice text-muted-foreground">
                The code keeps tokens and passwords as written. To mask them before you share it, use the Secret &amp; PII Redactor tool.
              </div>
            )}
          </>
        ) : undefined
      }
      first={
        <EditorPane
          title="cURL command"
          htmlFor="curl-to-code-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea
            id="curl-to-code-input"
            wrap="off"
            placeholder={PLACEHOLDER}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane
          title={targetLabel}
          htmlFor={code ? "curl-to-code-output" : undefined}
          scroll={false}
          actions={<CopyButton value={code} label={`Copy ${targetLabel}`} />}
        >
          {code ? (
            <CodeTextarea id="curl-to-code-output" wrap="off" value={code} readOnly />
          ) : (
            <PaneEmpty
              icon={<Terminal size={20} aria-hidden="true" />}
              title={`${targetLabel} code appears here`}
              hint="Paste a curl command on the left, for example from a browser's Copy as cURL menu."
            />
          )}
        </EditorPane>
      }
      status={status()}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
