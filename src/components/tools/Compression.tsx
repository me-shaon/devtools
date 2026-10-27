import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileArchive, FileUp } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { saveFile } from "@/lib/desktop";
import { bytesToBase64 } from "@/utils/base64";
import { formatBytes } from "@/utils/hash";
import {
  bytesToHex,
  compressBytes,
  decodeUtf8,
  decompress,
  FORMAT_EXTENSIONS,
  FORMAT_LABELS,
  gzipOriginalName,
  hexPreview,
  parseEncodedInput,
  ratioLabel,
  type CompressionFormat,
} from "@/utils/compression";

type Mode = "decompress" | "compress";
type Encoding = "base64" | "hex";

interface OpenedFile {
  name: string;
  bytes: Uint8Array;
}

interface Decompressed {
  input: Uint8Array;
  output: Uint8Array;
  format: CompressionFormat;
  text: string | null;
  notice: string;
}

const HEX_PREVIEW_BYTES = 4096;
const FORMATS: CompressionFormat[] = ["gzip", "deflate", "deflate-raw"];
const TAB_LABELS: Record<CompressionFormat, string> = { gzip: "GZIP", deflate: "zlib", "deflate-raw": "Raw deflate" };

const readFileBytes = (file: File): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the file."));
    reader.readAsArrayBuffer(file);
  });

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which input can I decompress?",
    a: "Paste Base64 (standard or URL-safe, with or without padding) or hex, or open a .gz file. The tool reads the magic bytes and shows the format it found: 1f 8b is GZIP and 78 xx is zlib. Data without a header is read as raw deflate.",
  },
  {
    q: "How do I read a Helm release?",
    a: "Helm stores each release as GZIP data in Base64. Paste the release field from the Secret. Kubernetes Secret data adds a second layer of Base64, and the tool removes both layers.",
  },
  {
    q: "What if the output is not text?",
    a: "The tool shows the first 4 KB as hex. Use Save file to get all the bytes.",
  },
  {
    q: "Why is the compressed output bigger than my text?",
    a: "GZIP adds an 18-byte header and trailer, and Base64 adds about 33%. Short text often grows. Compression pays off on longer text with repeated parts, such as JSON or logs.",
  },
  {
    q: "Is there a size limit?",
    a: "Decompression stops at 50 MB of output. A small, crafted file can expand to gigabytes, and the limit keeps the app responsive.",
  },
  {
    q: "Is my data uploaded?",
    a: "No. The tool uses the compression built into the app, on your device.",
  },
];

/** The name to save decompressed data under: the gzip header name, the file name without its extension, or a default. */
const decompressedName = (result: Decompressed, file: OpenedFile | null) => {
  const stored = result.format === "gzip" ? gzipOriginalName(result.input) : undefined;
  if (stored) return stored;
  const base = file?.name.replace(/\.(gz|gzip|tgz|z|zz|zlib|deflate)$/i, "");
  if (base && base !== file?.name) return base;
  return result.text === null ? "decompressed.bin" : "decompressed.txt";
};

export function Compression() {
  const [mode, setMode] = useState<Mode>("decompress");
  const [encodedInput, setEncodedInput] = useState("");
  const [file, setFile] = useState<OpenedFile | null>(null);
  const [readFormat, setReadFormat] = useState<CompressionFormat | "auto">("auto");
  const [textToCompress, setTextToCompress] = useState("");
  const [writeFormat, setWriteFormat] = useState<CompressionFormat>("gzip");
  const [encoding, setEncoding] = useState<Encoding>("base64");
  const [decompressed, setDecompressed] = useState<Decompressed | null>(null);
  const [decompressError, setDecompressError] = useState("");
  const [compressed, setCompressed] = useState<Uint8Array | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingInput = useDebouncedValue(encodedInput);
  const pendingText = useDebouncedValue(textToCompress);

  useEffect(() => {
    let current = true;
    const run = async () => {
      if (!file && !pendingInput.trim()) {
        setDecompressed(null);
        setDecompressError("");
        return;
      }
      try {
        const parsed = file ? null : parseEncodedInput(pendingInput);
        const input = file ? file.bytes : parsed!.bytes;
        const result = await decompress(input, readFormat);
        if (!current) return;
        const label = FORMAT_LABELS[result.format];
        const source = file ? `in ${file.name}` : parsed!.nested ? "from Base64 twice, as in Kubernetes Secret data" : parsed!.encoding === "hex" ? "from hex input" : "from Base64 input";
        const verb = readFormat !== "auto" ? "Read as" : result.format === "deflate-raw" ? "No header found. Read as" : "Detected";
        const stored = result.format === "gzip" ? gzipOriginalName(input) : undefined;
        setDecompressed({
          input,
          output: result.bytes,
          format: result.format,
          text: decodeUtf8(result.bytes),
          notice: `${verb} ${label} ${source}.${stored ? ` Original name: ${stored}.` : ""}`,
        });
        setDecompressError("");
      } catch (err) {
        if (!current) return;
        setDecompressed(null);
        setDecompressError((err as Error).message);
      }
    };
    void run();
    return () => {
      current = false;
    };
  }, [file, pendingInput, readFormat]);

  useEffect(() => {
    let current = true;
    if (!pendingText) {
      setCompressed(null);
      return;
    }
    compressBytes(new TextEncoder().encode(pendingText), writeFormat).then(
      (bytes) => current && setCompressed(bytes),
      () => current && setCompressed(null),
    );
    return () => {
      current = false;
    };
  }, [pendingText, writeFormat]);

  const compressedOutput = useMemo(() => {
    if (!compressed) return "";
    return encoding === "hex" ? bytesToHex(compressed) : bytesToBase64(compressed);
  }, [compressed, encoding]);

  const openFile = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      setFile({ name: picked.name, bytes: await readFileBytes(picked) });
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

  const save = async (bytes: Uint8Array, fileName: string, type: string) => {
    try {
      if (await saveFile(new Blob([bytes as BlobPart], { type }), fileName)) toast.success(`Saved ${fileName}.`);
    } catch (err) {
      toast.error((err as Error).message || "Unable to save the file.");
    }
  };

  // Move the result into the other direction's input
  const swap = () => {
    if (mode === "compress") {
      setFile(null);
      setEncodedInput(compressedOutput);
      setMode("decompress");
    } else if (decompressed?.text != null) {
      setTextToCompress(decompressed.text);
      setWriteFormat(decompressed.format);
      setMode("compress");
    }
  };

  const decompressing = mode === "decompress";
  const canSwap = decompressing ? decompressed?.text != null : Boolean(compressedOutput);
  const binaryTruncated = decompressed?.text === null && decompressed.output.length > HEX_PREVIEW_BYTES;

  const status = () => {
    if (decompressing) {
      if (decompressError) return <span className="text-destructive">Invalid input</span>;
      if (!decompressed) return <span>Ready</span>;
      const { input, output } = decompressed;
      return (
        <span>
          {formatBytes(input.length)} compressed · {formatBytes(output.length)} original · {ratioLabel(input.length, output.length)}
        </span>
      );
    }
    if (!compressed) return <span>Ready</span>;
    const original = new TextEncoder().encode(pendingText).length;
    return (
      <span>
        {formatBytes(original)} original · {formatBytes(compressed.length)} compressed · {ratioLabel(compressed.length, original)}
      </span>
    );
  };

  const notice = () => {
    if (!decompressing) return undefined;
    if (decompressError) return <div className="workspace-notice" data-tone="error" role="alert">{decompressError}</div>;
    if (!decompressed) return undefined;
    const tail = binaryTruncated ? ` The output is not text. The first 4 KB show as hex. Save the file to get all ${formatBytes(decompressed.output.length)}.` : "";
    return <div className="workspace-notice" role="status">{decompressed.notice}{tail}</div>;
  };

  return (
    <ToolWorkspace
      id="compression"
      toolbar={
        <>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList aria-label="Direction">
              <TabsTrigger value="decompress">Decompress</TabsTrigger>
              <TabsTrigger value="compress">Compress</TabsTrigger>
            </TabsList>
          </Tabs>
          {decompressing ? (
            <Tabs value={readFormat} onValueChange={(v) => setReadFormat(v as CompressionFormat | "auto")} className="indent-control">
              <TabsList aria-label="Format">
                <TabsTrigger value="auto">Auto</TabsTrigger>
                {FORMATS.map((f) => <TabsTrigger key={f} value={f}>{TAB_LABELS[f]}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          ) : (
            <>
              <Tabs value={writeFormat} onValueChange={(v) => setWriteFormat(v as CompressionFormat)} className="indent-control">
                <TabsList aria-label="Format">
                  {FORMATS.map((f) => <TabsTrigger key={f} value={f}>{TAB_LABELS[f]}</TabsTrigger>)}
                </TabsList>
              </Tabs>
              <Tabs value={encoding} onValueChange={(v) => setEncoding(v as Encoding)}>
                <TabsList aria-label="Output encoding">
                  <TabsTrigger value="base64">Base64</TabsTrigger>
                  <TabsTrigger value="hex">Hex</TabsTrigger>
                </TabsList>
              </Tabs>
            </>
          )}
          <button type="button" className="toolbar-text-button" onClick={swap} disabled={!canSwap}>
            Swap
          </button>
        </>
      }
      notice={notice()}
      first={
        decompressing ? (
          <EditorPane
            title={file ? "File" : "Compressed"}
            htmlFor={file ? undefined : "compression-input"}
            scroll={Boolean(file)}
            actions={
              <>
                <input
                  ref={fileInputRef}
                  type="file"
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
                {(file || encodedInput) && (
                  <button type="button" className="toolbar-text-button" onClick={() => (file ? setFile(null) : setEncodedInput(""))}>
                    Clear
                  </button>
                )}
              </>
            }
          >
            <div
              className={`flex h-full min-h-full flex-col ${dragging ? "bg-accent" : ""}`}
              data-dragging={dragging || undefined}
              onDragOver={onDragOver}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              {file ? (
                <div className="space-y-3 p-4">
                  <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm">
                    <FileArchive className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{file.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatBytes(file.bytes.length)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">The file is read on this device. It is not uploaded.</p>
                </div>
              ) : (
                <CodeTextarea
                  id="compression-input"
                  value={encodedInput}
                  onChange={(e) => setEncodedInput(e.target.value)}
                  placeholder="Paste Base64 or hex (e.g., H4sIAAAA...), or drop a .gz file"
                />
              )}
            </div>
          </EditorPane>
        ) : (
          <EditorPane
            title="Text"
            htmlFor="compression-text"
            scroll={false}
            actions={textToCompress ? <button type="button" className="toolbar-text-button" onClick={() => setTextToCompress("")}>Clear</button> : undefined}
          >
            <CodeTextarea id="compression-text" value={textToCompress} onChange={(e) => setTextToCompress(e.target.value)} placeholder="Enter text to compress..." />
          </EditorPane>
        )
      }
      second={
        decompressing ? (
          <EditorPane
            title={decompressed?.text === null ? "Hex" : "Text"}
            htmlFor={decompressed ? "compression-output" : undefined}
            scroll={false}
            actions={
              <>
                <CopyButton
                  value={decompressed ? decompressed.text ?? (binaryTruncated ? "" : hexPreview(decompressed.output)) : ""}
                  label="Copy"
                  ariaLabel="Copy decompressed data"
                />
                <button
                  type="button"
                  className="toolbar-text-button"
                  disabled={!decompressed}
                  onClick={() => decompressed && void save(decompressed.output, decompressedName(decompressed, file), "application/octet-stream")}
                >
                  <Download size={14} aria-hidden="true" />
                  Save file
                </button>
              </>
            }
          >
            {decompressed ? (
              <CodeTextarea
                id="compression-output"
                value={decompressed.text ?? hexPreview(decompressed.output, HEX_PREVIEW_BYTES)}
                readOnly
              />
            ) : (
              <PaneEmpty title="Decompressed text appears here" hint="Paste GZIP, zlib, or deflate data, or open a .gz file." />
            )}
          </EditorPane>
        ) : (
          <EditorPane
            title={encoding === "hex" ? "Hex" : "Base64"}
            htmlFor={compressedOutput ? "compression-output" : undefined}
            scroll={false}
            actions={
              <>
                <CopyButton value={compressedOutput} label="Copy" ariaLabel="Copy compressed data" />
                <button
                  type="button"
                  className="toolbar-text-button"
                  disabled={!compressed}
                  onClick={() => compressed && void save(compressed, `compressed.${FORMAT_EXTENSIONS[writeFormat]}`, writeFormat === "gzip" ? "application/gzip" : "application/octet-stream")}
                >
                  <Download size={14} aria-hidden="true" />
                  Save file
                </button>
              </>
            }
          >
            {compressedOutput ? (
              <CodeTextarea id="compression-output" value={compressedOutput} readOnly />
            ) : (
              <PaneEmpty title="Compressed data appears here" hint="Type text to compress it." />
            )}
          </EditorPane>
        )
      }
      status={status()}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
