import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, ArrowLeft, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { saveFile } from "@/lib/desktop";
import { formatBytes } from "@/utils/hash";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToDataUri,
  decodeText,
  encodeText,
  extensionForMime,
  parseDataUri,
  sniffMimeType,
} from "@/utils/base64";

interface EncodedFile {
  name: string;
  size: number;
  mimeType: string;
  bytes: Uint8Array;
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
  const [activeTab, setActiveTab] = useState<"encode" | "decode">("encode");
  const [textToEncode, setTextToEncode] = useState("");
  const [encodedOutput, setEncodedOutput] = useState("");
  const [urlSafe, setUrlSafe] = useState(false);
  const [asDataUri, setAsDataUri] = useState(false);
  const [encodedFile, setEncodedFile] = useState<EncodedFile | null>(null);
  const [base64ToDecode, setBase64ToDecode] = useState("");
  const [decodedOutput, setDecodedOutput] = useState("");
  const [saveName, setSaveName] = useState("");

  const fileOutput = useMemo(() => {
    if (!encodedFile) return "";
    // Data URIs always use standard Base64 so that browsers can read them.
    return asDataUri
      ? bytesToDataUri(encodedFile.bytes, encodedFile.mimeType)
      : bytesToBase64(encodedFile.bytes, { urlSafe });
  }, [encodedFile, asDataUri, urlSafe]);

  const imagePreview = useMemo(() => {
    if (!encodedFile || !encodedFile.mimeType.startsWith("image/")) return "";
    return bytesToDataUri(encodedFile.bytes, encodedFile.mimeType);
  }, [encodedFile]);

  // Re-encode the text output when the URL-safe option changes
  useEffect(() => {
    setEncodedOutput((current) => {
      if (!current || encodedFile) return current;
      try {
        return encodeText(textToEncode, { urlSafe });
      } catch {
        return current;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSafe]);

  const encodeToBase64 = () => {
    try {
      const encoded = encodeText(textToEncode, { urlSafe });
      setEncodedFile(null);
      setEncodedOutput(encoded);
      toast.success("Text encoded to Base64!");
    } catch (err) {
      toast.error((err as Error).message || "Error encoding text");
      setEncodedOutput("");
    }
  };

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
      toast.success("File encoded to Base64!");
    } catch {
      toast.error("Unable to read the file.");
    }
  };

  const clearEncodedFile = () => setEncodedFile(null);

  const decodeFromBase64 = () => {
    try {
      const parsed = parseDataUri(base64ToDecode);
      const decoded = decodeText(parsed ? parsed.base64 : base64ToDecode);
      setDecodedOutput(decoded);
      toast.success("Base64 decoded successfully!");
    } catch (err) {
      toast.error((err as Error).message || "Invalid Base64 format or corrupted data");
      setDecodedOutput("");
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
        toast.success("File saved!");
      }
    } catch (err) {
      toast.error((err as Error).message || "Unable to save the file.");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const shownEncoded = encodedFile ? fileOutput : encodedOutput;

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "encode" | "decode")} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="encode">Encode</TabsTrigger>
          <TabsTrigger value="decode">Decode</TabsTrigger>
        </TabsList>

        {/* Encode Tab */}
        <TabsContent value="encode" className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch id="b64-urlsafe" checked={urlSafe} onCheckedChange={setUrlSafe} />
            <Label htmlFor="b64-urlsafe">URL-safe (- and _, no padding)</Label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Text to Encode</label>
            <textarea
              value={textToEncode}
              onChange={(e) => setTextToEncode(e.target.value)}
              placeholder="Enter text to encode to Base64..."
              className="w-full h-32 p-3 rounded-md border bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex justify-center">
            <Button onClick={encodeToBase64} size="sm" className="gap-2">
              Encode to Base64
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="b64-file">Or encode a file</Label>
            <Input
              id="b64-file"
              type="file"
              onChange={(e) => {
                void handleEncodeFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {encodedFile && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md border bg-muted px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{encodedFile.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatBytes(encodedFile.size)}
                    </span>
                  </span>
                  <Button onClick={clearEncodedFile} variant="ghost" size="sm">
                    Clear
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <Switch id="b64-datauri" checked={asDataUri} onCheckedChange={setAsDataUri} />
                  <Label htmlFor="b64-datauri">Data URI</Label>
                </div>
                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="Preview of the selected file"
                    className="max-h-48 rounded-md border bg-muted object-contain"
                  />
                )}
              </div>
            )}
          </div>

          {shownEncoded && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Encoded Output</label>
                <Button onClick={() => copyToClipboard(shownEncoded)} variant="ghost" size="sm">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              </div>
              <textarea
                value={shownEncoded}
                readOnly
                className="w-full h-32 p-3 rounded-md border bg-muted text-foreground resize-none focus:outline-none"
              />
            </div>
          )}
        </TabsContent>

        {/* Decode Tab */}
        <TabsContent value="decode" className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Base64 to Decode</label>
            <textarea
              value={base64ToDecode}
              onChange={(e) => setBase64ToDecode(e.target.value)}
              placeholder="Enter Base64 string or data URI to decode..."
              className="w-full h-32 p-3 rounded-md border bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={decodeFromBase64} size="sm" className="gap-2">
              Decode from Base64
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="File name (optional)"
              aria-label="File name"
              className="w-48"
            />
            <Button onClick={() => void saveDecodedFile()} size="sm" variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Save as file
            </Button>
          </div>

          {decodedOutput && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Decoded Output</label>
                <Button onClick={() => copyToClipboard(decodedOutput)} variant="ghost" size="sm">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              </div>
              <textarea
                value={decodedOutput}
                readOnly
                className="w-full h-32 p-3 rounded-md border bg-muted text-foreground resize-none focus:outline-none"
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
