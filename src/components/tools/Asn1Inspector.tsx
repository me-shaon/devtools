import { useMemo, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  decodeAsnInput,
  parseAsn1,
  type AsnNode,
} from "@/utils/asn1-inspector";
import { blobSource } from "@/utils/byte-source";
import {
  CodeTextarea,
  EditorPane,
  PaneEmpty,
  ToolWorkspace,
} from "./ToolWorkspace";
import { CopyButton } from "./CopyButton";
function Tree({ nodes }: { nodes: AsnNode[] }) {
  return (
    <ul className="pl-4 space-y-2">
      {nodes.map((n) => (
        <li key={n.offset}>
          <details>
            <summary className="cursor-pointer text-sm">
              <span className="font-medium">{n.name}</span>{" "}
              <span className="text-muted-foreground">
                @{n.offset} · {n.length} bytes
              </span>
              {n.value && (
                <span className="font-mono break-all"> · {n.value}</span>
              )}
            </summary>
            <div className="border-l pl-3 py-2 space-y-2 text-sm">
              <p>
                {n.tagClass} · tag {n.tag} ·{" "}
                {n.constructed ? "constructed" : "primitive"} · header{" "}
                {n.header} bytes
              </p>
              <pre className="whitespace-pre-wrap break-all font-mono">
                {n.hex || "Empty value"}
              </pre>
              {n.children.length > 0 && <Tree nodes={n.children} />}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
export function Asn1Inspector() {
  const [input, setInput] = useState("");
  const [format, setFormat] = useState<"pem" | "hex" | "base64">("pem");
  const [file, setFile] = useState<{
    name: string;
    bytes: Uint8Array;
  } | null>(null);
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const text = useDebouncedValue(input);
  const result = useMemo(() => {
    try {
      return {
        nodes:
          file || text.trim()
            ? parseAsn1(file?.bytes ?? decodeAsnInput(text, format))
            : null,
        error: "",
      };
    } catch (e) {
      return { nodes: null, error: (e as Error).message };
    }
  }, [text, format, file]);
  return (
    <ToolWorkspace
      wrapToolbar
      id="asn1-inspector"
      toolbar={
        <>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 pr-7 text-sm text-foreground"
            aria-label="ASN.1 input format"
            value={format}
            onChange={(e) => setFormat(e.target.value as typeof format)}
          >
            <option value="pem">PEM</option>
            <option value="hex">Hex</option>
            <option value="base64">Base64</option>
          </select>
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-label="Open DER file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              // Clear the input so choosing the same file again fires a change.
              e.target.value = "";
              if (!f) return;
              const id = ++request.current;
              setFileError("");
              setBusy(true);
              setFile(null);
              try {
                if (f.size > 1000000)
                  throw new Error("Files are limited to 1 MB.");
                const bytes = await blobSource(f).read(0, f.size);
                if (id === request.current) setFile({ name: f.name, bytes });
              } catch (e) {
                if (id === request.current) setFileError((e as Error).message);
              } finally {
                if (id === request.current) setBusy(false);
              }
            }}
          />
          <button
            type="button"
            className="toolbar-text-button"
            onClick={() => fileInput.current?.click()}
          >
            <FileUp size={14} aria-hidden="true" />
            Open file
          </button>
          <button
            className="toolbar-text-button"
            onClick={() => {
              request.current++;
              setFile(null);
              setBusy(false);
              setFileError("");
              setFormat("hex");
              setInput("30 08 02 01 2a 0c 03 48 65 79");
            }}
          >
            Example
          </button>
        </>
      }
      notice={
        (result.error || fileError) && (
          <div role="alert" className="workspace-notice" data-tone="error">
            {result.error || fileError}
          </div>
        )
      }
      first={
        <EditorPane
          title="ASN.1 data"
          htmlFor="asn-input"
          actions={
            file && (
              <button
                className="toolbar-text-button"
                onClick={() => setFile(null)}
              >
                Clear file
              </button>
            )
          }
        >
          {file ? (
            <p className="p-4">
              {file.name} · {file.bytes.length} bytes
            </p>
          ) : (
            <CodeTextarea
              id="asn-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste a PEM block or choose Hex / Base64"
            />
          )}
        </EditorPane>
      }
      second={
        <EditorPane
          title="Structure"
          actions={
            <CopyButton
              value={result.nodes ? JSON.stringify(result.nodes, null, 2) : ""}
              label="Copy JSON"
            />
          }
        >
          {busy ? (
            <PaneEmpty title="Reading file" />
          ) : result.nodes ? (
            <div className="p-3">
              <Tree nodes={result.nodes} />
            </div>
          ) : (
            <PaneEmpty
              title="Inspect ASN.1 structure"
              hint="Definite-length DER/BER. This inspector does not validate certificate trust or enforce canonical DER."
            />
          )}
        </EditorPane>
      }
      status={
        <span>
          1 MB limit · 40 nesting levels · raw previews up to 256 bytes
        </span>
      }
    />
  );
}
