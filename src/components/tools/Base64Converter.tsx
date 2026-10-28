import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemo, useRef, useState } from "react";
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
import { bytesToHex } from "@noble/hashes/utils.js";
import { base32ToBytes, bytesToBase32 } from "@/utils/base32";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToDataUri,
  extensionForMime,
  parseDataUri,
  sniffMimeType,
} from "@/utils/base64";

type Mode = "encode" | "decode";
type Format = "base64" | "base32";

interface EncodedFile {
  name: string;
  size: number;
  mimeType: string;
  bytes: Uint8Array;
}

interface Decoded {
  text: string;
  /** Hex of the bytes when they are not UTF-8 text. */
  hex: string;
  bytes: number;
  binary: boolean;
  error: string;
}

// Larger binary data is too long to read as hex. Save it as a file instead.
const MAX_HEX_BYTES = 64 * 1024;

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
    q: "What is Base32 for?",
    a: "Two-factor (TOTP) secrets use Base32, and so do some IDs. A decoded TOTP secret is binary, so the tool shows it as hex. The decoder ignores case, spaces, and missing padding.",
  },
  {
    q: "What does Hex alphabet do?",
    a: "It switches to base32hex from RFC 4648, which uses 0-9 and A-V and keeps the sort order of the data. The two alphabets share characters, so set it the same way to decode.",
  },
  {
    q: "Is my file uploaded?",
    a: "No. Files are read and converted on your device.",
  },
];

export function Base64Converter() {
  const [mode, setMode] = useState<Mode>("encode");
  const [textToEncode, setTextToEncode] = useState("");
  const [format, setFormat] = useState<Format>("base64");
  const [urlSafe, setUrlSafe] = useState(false);
  const [hexAlphabet, setHexAlphabet] = useState(false);
  const [padding, setPadding] = useState(true);
  const [asDataUri, setAsDataUri] = useState(false);
  const [encodedFile, setEncodedFile] = useState<EncodedFile | null>(null);
  const [base64ToDecode, setBase64ToDecode] = useState("");
  const [saveName, setSaveName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingText = useDebouncedValue(textToEncode);
  const pendingBase64 = useDebouncedValue(base64ToDecode);

  const base32 = format === "base32";
  const formatName = base32 ? "Base32" : "Base64";
  const variant = hexAlphabet ? "base32hex" : "base32";

  const encodedOutput = useMemo(() => {
    const encode = (bytes: Uint8Array) =>
      format === "base32" ? bytesToBase32(bytes, { variant, padding }) : bytesToBase64(bytes, { urlSafe });
    if (encodedFile) {
      // Data URIs always use standard Base64 so that browsers can read them.
      return asDataUri && format === "base64"
        ? bytesToDataUri(encodedFile.bytes, encodedFile.mimeType)
        : encode(encodedFile.bytes);
    }
    return pendingText ? encode(new TextEncoder().encode(pendingText)) : "";
  }, [encodedFile, asDataUri, format, urlSafe, variant, padding, pendingText]);

  // Base64 input may be a data URI, which also gives the MIME type.
  const decodeInput = (input: string): { bytes: Uint8Array; mimeType: string | null } => {
    if (base32) return { bytes: base32ToBytes(input, { variant }), mimeType: null };
    const parsed = parseDataUri(input);
    return { bytes: base64ToBytes(parsed ? parsed.base64 : input), mimeType: parsed?.mimeType ?? null };
  };

  const imagePreview = useMemo(() => {
    if (!encodedFile || !encodedFile.mimeType.startsWith("image/")) return "";
    return bytesToDataUri(encodedFile.bytes, encodedFile.mimeType);
  }, [encodedFile]);

  const decoded = useMemo<Decoded | null>(() => {
    if (!pendingBase64.trim()) return null;
    try {
      const { bytes } = decodeInput(pendingBase64);
      try {
        return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), hex: "", bytes: bytes.length, binary: false, error: "" };
      } catch {
        const hex = bytes.length <= MAX_HEX_BYTES ? bytesToHex(bytes) : "";
        return { text: "", hex, bytes: bytes.length, binary: true, error: "" };
      }
    } catch (err) {
      return { text: "", hex: "", bytes: 0, binary: false, error: (err as Error).message || `Invalid ${formatName} format` };
    }
    // decodeInput depends only on the format and the alphabet.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBase64, base32, variant]);

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
      const { bytes, mimeType: dataUriType } = decodeInput(base64ToDecode);
      const mimeType = dataUriType ?? sniffMimeType(bytes) ?? "application/octet-stream";
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
          <Tabs value={format} onValueChange={(v) => setFormat(v as Format)}>
            <TabsList aria-label="Encoding">
              <TabsTrigger value="base64">Base64</TabsTrigger>
              <TabsTrigger value="base32">Base32</TabsTrigger>
            </TabsList>
          </Tabs>
          {encoding && !base32 && (
            <label className="option-switch indent-control" htmlFor="b64-urlsafe">
              URL-safe
              <Switch id="b64-urlsafe" checked={urlSafe} onCheckedChange={setUrlSafe} disabled={Boolean(encodedFile) && asDataUri} />
            </label>
          )}
          {base32 && (
            <label className="option-switch indent-control" htmlFor="b64-base32hex">
              Hex alphabet
              <Switch id="b64-base32hex" checked={hexAlphabet} onCheckedChange={setHexAlphabet} />
            </label>
          )}
          {encoding && base32 && (
            <label className="option-switch" htmlFor="b64-padding">
              Padding
              <Switch id="b64-padding" checked={padding} onCheckedChange={setPadding} />
            </label>
          )}
          {encoding && !base32 && encodedFile && (
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
                placeholder={`Enter text to encode to ${formatName}...`}
              />
            )}
          </EditorPane>
        ) : (
          <EditorPane title={formatName} htmlFor="b64-decode-input" scroll={false}
            actions={base64ToDecode ? <button type="button" className="toolbar-text-button" onClick={() => setBase64ToDecode("")}>Clear</button> : undefined}>
            <CodeTextarea
              id="b64-decode-input"
              value={base64ToDecode}
              onChange={(e) => setBase64ToDecode(e.target.value)}
              placeholder={base32 ? "Enter Base32 string to decode..." : "Enter Base64 string or data URI to decode..."}
            />
          </EditorPane>
        )
      }
      second={
        encoding ? (
          <EditorPane title={formatName} htmlFor={encodedOutput ? "b64-encode-output" : undefined} scroll={false}
            actions={<CopyButton value={encodedOutput} label={`Copy ${formatName}`} />}>
            {encodedOutput ? (
              <CodeTextarea id="b64-encode-output" value={encodedOutput} readOnly />
            ) : (
              <PaneEmpty title={`${formatName} appears here`} hint="Type text or open a file." />
            )}
          </EditorPane>
        ) : (
          <EditorPane title={decoded?.hex ? "Hex" : "Text"} htmlFor={decodedText || decoded?.hex ? "b64-decode-output" : undefined} scroll={false}
            actions={decoded?.hex
              ? <CopyButton value={decoded.hex} label="Copy hex" />
              : <CopyButton value={decodedText} label="Copy text" />}>
            {decodedText || decoded?.hex ? (
              <CodeTextarea id="b64-decode-output" value={decodedText || decoded?.hex} readOnly />
            ) : decoded?.binary ? (
              <PaneEmpty title="Binary data" hint="The data is not UTF-8 text. Use Save as file." />
            ) : (
              <PaneEmpty title="Decoded text appears here" hint={base32 ? "Paste Base32, such as a TOTP secret." : "Paste Base64 or a data URI."} />
            )}
          </EditorPane>
        )
      }
      status={encoding ? encodeStatus() : decodeStatus()}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
