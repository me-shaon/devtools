import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { saveFile } from "@/lib/desktop";
import { formatBytes } from "@/utils/hash";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToDataUri,
  extensionForMime,
  parseDataUri,
  sniffMimeType,
} from "@/utils/base64";

type Mode = "encode" | "decode";

interface EncodedFile {
  name: string;
  size: number;
  mimeType: string;
  bytes: Uint8Array;
}

interface Decoded {
  text: string;
  bytes: number;
  binary: boolean;
  error: string;
}

const readFileBytes = (file: File): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the file."));
    reader.readAsArrayBuffer(file);
  });


const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Is Base64 encryption?",
    a: "No. Base64 is only an encoding format that turns binary data into plain text characters, and anyone can decode it back without a secret key.",
  },
  {
    q: "When should I use Base64?",
    a: "Use it when a system expects text but you need to safely transport bytes, such as embedding binary data in JSON, HTML, or data URLs. It is a transport format, not a security feature.",
  },
  {
    q: "Why is the Base64 output longer than the original text?",
    a: "Base64 expands data because it represents every 3 bytes of input as 4 text characters. That usually adds about 33% overhead.",
  },
  {
    q: "Can I Base64-encode Unicode text?",
    a: "Yes. This tool encodes text as UTF-8 first, so characters outside plain ASCII are preserved when you decode them later.",
  },
  {
    q: "What is URL-safe Base64?",
    a: "It replaces + with - and / with _, and it drops the = padding. Use it in URLs, file names, and JWTs. The decoder accepts both forms.",
  },
  {
    q: "Is my file uploaded?",
    a: "No. Files are read and converted on your device.",
  },
];

export function Base64Converter() {
  const [mode, setMode] = useState<Mode>("encode");
  const [textToEncode, setTextToEncode] = useState("");
  const [urlSafe, setUrlSafe] = useState(false);
  const [asDataUri, setAsDataUri] = useState(false);
  const [encodedFile, setEncodedFile] = useState<EncodedFile | null>(null);
  const [base64ToDecode, setBase64ToDecode] = useState("");
  const [saveName, setSaveName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingText = useDebouncedValue(textToEncode);
  const pendingBase64 = useDebouncedValue(base64ToDecode);

  const encodedOutput = useMemo(() => {
    if (encodedFile) {
      // Data URIs always use standard Base64 so that browsers can read them.
      return asDataUri
        ? bytesToDataUri(encodedFile.bytes, encodedFile.mimeType)
        : bytesToBase64(encodedFile.bytes, { urlSafe });
    }
    return pendingText ? bytesToBase64(new TextEncoder().encode(pendingText), { urlSafe }) : "";
  }, [encodedFile, asDataUri, urlSafe, pendingText]);

  const imagePreview = useMemo(() => {
    if (!encodedFile || !encodedFile.mimeType.startsWith("image/")) return "";
    return bytesToDataUri(encodedFile.bytes, encodedFile.mimeType);
  }, [encodedFile]);

  const decoded = useMemo<Decoded | null>(() => {
    if (!pendingBase64.trim()) return null;
    try {
      const parsed = parseDataUri(pendingBase64);
      const bytes = base64ToBytes(parsed ? parsed.base64 : pendingBase64);
      try {
        return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), bytes: bytes.length, binary: false, error: "" };
      } catch {
        return { text: "", bytes: bytes.length, binary: true, error: "" };
      }
    } catch (err) {
      return { text: "", bytes: 0, binary: false, error: (err as Error).message || "Invalid Base64 format" };
    }
  }, [pendingBase64]);

  const handleEncodeFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bytes = await readFileBytes(file);
      setEncodedFile({
        name: file.name,
        size: file.size,
        mimeType: file.type || sniffMimeType(bytes) || "application/octet-stream",
        bytes,
      });
    } catch {
      toast.error("Could not read the file. Choose it again.");
    }
  };

  const saveDecodedFile = async () => {
    try {
      const parsed = parseDataUri(base64ToDecode);
      const bytes = base64ToBytes(parsed ? parsed.base64 : base64ToDecode);
      const mimeType = parsed?.mimeType ?? sniffMimeType(bytes) ?? "application/octet-stream";
      const fileName = saveName.trim() || `decoded.${extensionForMime(mimeType)}`;
      const blob = new Blob([bytes as BlobPart], { type: mimeType });
      if (await saveFile(blob, fileName)) {
        toast.success(`Saved ${fileName}.`);
      }
    } catch (err) {
      toast.error((err as Error).message || "Unable to save the file.");
    }
  };

  // Move the result into the other direction's input
  const swap = () => {
    if (mode === "encode") {
      setBase64ToDecode(encodedOutput);
      setMode("decode");
    } else {
      setEncodedFile(null);
      setTextToEncode(decoded?.text ?? "");
      setMode("encode");
    }
  };

  const encoding = mode === "encode";
  const decodedText = decoded?.text ?? "";
  const canSwap = encoding ? Boolean(encodedOutput) : Boolean(decodedText);

  const encodeStatus = () => {
    if (!encodedOutput) return <span>Ready</span>;
    const inBytes = encodedFile ? encodedFile.size : new TextEncoder().encode(pendingText).length;
    return <span>{formatBytes(inBytes)} in · {formatBytes(encodedOutput.length)} out</span>;
  };

  const decodeStatus = () => {
    if (!decoded) return <span>Ready</span>;
    if (decoded.error) return <span className="text-destructive">Invalid input</span>;
    return (
      <span>
        {formatBytes(pendingBase64.trim().length)} in · {formatBytes(decoded.bytes)} out{decoded.binary ? " (binary)" : ""}
      </span>
    );
  };

  return (
    <ToolWorkspace
      id="base64"
      toolbar={
        <>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList aria-label="Direction">
              <TabsTrigger value="encode">Encode</TabsTrigger>
              <TabsTrigger value="decode">Decode</TabsTrigger>
            </TabsList>
          </Tabs>
          {encoding && (
            <label className="option-switch indent-control" htmlFor="b64-urlsafe">
              URL-safe
              <Switch id="b64-urlsafe" checked={urlSafe} onCheckedChange={setUrlSafe} disabled={Boolean(encodedFile) && asDataUri} />
            </label>
          )}
          {encoding && encodedFile && (
            <label className="option-switch" htmlFor="b64-datauri">
              Data URI
              <Switch id="b64-datauri" checked={asDataUri} onCheckedChange={setAsDataUri} />
            </label>
          )}
          <button type="button" className="toolbar-text-button" onClick={swap} disabled={!canSwap}>
            Swap
          </button>
        </>
      }
      secondaryToolbar={
        encoding ? undefined : (
          <>
            <Label htmlFor="b64-save-name" className="text-xs">File name</Label>
            <Input
              id="b64-save-name"
              className="h-7 w-48 text-xs"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="decoded.bin (optional)"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="native-button text-xs" onClick={() => void saveDecodedFile()} disabled={!base64ToDecode.trim()}>
              <Download size={14} aria-hidden="true" />
              Save as file
            </button>
          </>
        )
      }
      notice={
        !encoding && decoded?.error ? (
          <div className="workspace-notice" data-tone="error" role="alert">{decoded.error}</div>
        ) : undefined
      }
      first={
        encoding ? (
          <EditorPane
            title={encodedFile ? "File" : "Text"}
            htmlFor={encodedFile ? undefined : "b64-encode-input"}
            scroll={Boolean(encodedFile)}
            actions={
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    void handleEncodeFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button type="button" className="toolbar-text-button" onClick={() => fileInputRef.current?.click()}>
                  <FileUp size={14} aria-hidden="true" />
                  Open file
                </button>
                {(encodedFile || textToEncode) && (
                  <button
                    type="button"
                    className="toolbar-text-button"
                    onClick={() => (encodedFile ? setEncodedFile(null) : setTextToEncode(""))}
                  >
                    Clear
                  </button>
                )}
              </>
            }
          >
            {encodedFile ? (
              <div className="space-y-3 p-4">
                <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm">
                  <FileUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{encodedFile.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(encodedFile.size)}</span>
                </div>
                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="Preview of the selected file"
                    className="max-h-48 rounded-md border bg-muted object-contain"
                  />
                )}
                <p className="text-xs text-muted-foreground">The file is read on this device. It is not uploaded.</p>
              </div>
            ) : (
              <CodeTextarea
                id="b64-encode-input"
                value={textToEncode}
                onChange={(e) => setTextToEncode(e.target.value)}
                placeholder="Enter text to encode to Base64..."
              />
            )}
          </EditorPane>
        ) : (
          <EditorPane title="Base64" htmlFor="b64-decode-input" scroll={false}
            actions={base64ToDecode ? <button type="button" className="toolbar-text-button" onClick={() => setBase64ToDecode("")}>Clear</button> : undefined}>
            <CodeTextarea
              id="b64-decode-input"
              value={base64ToDecode}
              onChange={(e) => setBase64ToDecode(e.target.value)}
              placeholder="Enter Base64 string or data URI to decode..."
            />
          </EditorPane>
        )
      }
      second={
        encoding ? (
          <EditorPane title="Base64" htmlFor={encodedOutput ? "b64-encode-output" : undefined} scroll={false}
            actions={<CopyButton value={encodedOutput} label="Copy Base64" />}>
            {encodedOutput ? (
              <CodeTextarea id="b64-encode-output" value={encodedOutput} readOnly />
            ) : (
              <PaneEmpty title="Base64 appears here" hint="Type text or open a file." />
            )}
          </EditorPane>
        ) : (
          <EditorPane title="Text" htmlFor={decodedText ? "b64-decode-output" : undefined} scroll={false}
            actions={<CopyButton value={decodedText} label="Copy text" />}>
            {decodedText ? (
              <CodeTextarea id="b64-decode-output" value={decodedText} readOnly />
            ) : decoded?.binary ? (
              <PaneEmpty title="Binary data" hint="The data is not UTF-8 text. Use Save as file." />
            ) : (
              <PaneEmpty title="Decoded text appears here" hint="Paste Base64 or a data URI." />
            )}
          </EditorPane>
        )
      }
      status={encoding ? encodeStatus() : decodeStatus()}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
