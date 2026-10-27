import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, ToolWorkspace } from "@/components/tools/ToolWorkspace";

import {
  HASH_TYPES,
  HMAC_TYPES,
  formatBytes,
  generateAllHashes,
  generateAllHmacs,
} from "@/utils/hash";

type Source = "text" | "file";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What is the difference between MD5, SHA-1, SHA-2, SHA-3, and Keccak?",
    a: "They are different hash algorithms with different output sizes and security properties. Keccak-256 is the variant that Ethereum uses. It differs from the final SHA-3-256 standard. For new integrity checks, prefer SHA-256, SHA-512, or SHA-3 and avoid MD5 or SHA-1 for security-sensitive uses.",
  },
  {
    q: "Can I use these hashes for password storage?",
    a: "No. Fast hashes like MD5 and SHA are easy for attackers to brute-force, so passwords should be stored with a slow password hash such as bcrypt, scrypt, or Argon2.",
  },
  {
    q: "Is hashing the same as encryption?",
    a: "No. Hashing is one-way, so you cannot recover the original input from the hash, while encryption is reversible with the right key.",
  },
  {
    q: "Why do two similar inputs produce completely different hashes?",
    a: "Good hash functions have an avalanche effect, meaning a tiny input change causes a very different output. That makes hashes useful for change detection and integrity checks.",
  },
  {
    q: "What is HMAC?",
    a: "HMAC mixes a secret key into the hash. Only a party that has the key can create or check the result. Use it to sign messages and webhooks.",
  },
  {
    q: "Is my file uploaded?",
    a: "No. The file is read and hashed on your device. Nothing leaves the app.",
  },
];

const readFileBytes = (file: File): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the file."));
    reader.readAsArrayBuffer(file);
  });

type Results = Record<string, string>;

export function HashGenerator() {
  const [source, setSource] = useState<Source>("text");
  const [input, setInput] = useState("");
  const deferredInput = useDeferredValue(input);
  const [file, setFile] = useState<File | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [hmacEnabled, setHmacEnabled] = useState(false);
  const [secretKey, setSecretKey] = useState("");
  const deferredKey = useDeferredValue(secretKey);
  const [hashes, setHashes] = useState<Results>({});
  const [hmacs, setHmacs] = useState<Results>({});
  const latestRequestRef = useRef(0);

  // Message bytes or text to hash
  const message: string | Uint8Array | null =
    source === "text" ? (deferredInput ? deferredInput : null) : fileBytes;

  useEffect(() => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    if (message === null) {
      setHashes({});
      setHmacs({});
      return;
    }

    const run = async () => {
      try {
        const [nextHashes, nextHmacs] = await Promise.all([
          generateAllHashes(message),
          hmacEnabled ? generateAllHmacs(message, deferredKey) : Promise.resolve({}),
        ]);
        if (latestRequestRef.current !== requestId) return;
        setHashes(nextHashes);
        setHmacs(nextHmacs);
      } catch (error) {
        console.error("Error generating hashes:", error);
      }
    };

    void run();
  }, [message, hmacEnabled, deferredKey]);

  const handleFile = async (selected: File | undefined) => {
    if (!selected) return;
    setFile(selected);
    setFileBytes(null);
    try {
      setFileBytes(await readFileBytes(selected));
    } catch {
      toast.error("Could not read the file. Choose it again.");
      setFile(null);
    }
  };

  const clearFile = () => {
    setFile(null);
    setFileBytes(null);
  };

  // Read-only result fields grow to show the whole hash at any pane width.
  const listRef = useRef<HTMLDivElement>(null);
  const fitHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => list.querySelectorAll("textarea").forEach(fitHeight));
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  const renderResult = (key: string, label: string, value: string, placeholder: string) => (
    <div key={key} className="result-row">
      <label className="result-row-label" htmlFor={`hash-out-${key}`}>{label}</label>
      <textarea
        id={`hash-out-${key}`}
        className="result-row-value code-textarea"
        value={value}
        readOnly
        rows={1}
        ref={fitHeight}
        placeholder={placeholder}
      />
      <CopyButton value={value} iconOnly label={`Copy ${label}`} />
    </div>
  );

  const byteCount = source === "text" ? new TextEncoder().encode(input).length : fileBytes?.length ?? 0;

  return (
    <ToolWorkspace
      id="hash-generator"
      toolbar={
        <>
          <Tabs value={source} onValueChange={(v) => setSource(v as Source)}>
            <TabsList aria-label="Input source">
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="file">File</TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="option-switch indent-control" htmlFor="hash-hmac">
            HMAC
            <Switch id="hash-hmac" checked={hmacEnabled} onCheckedChange={setHmacEnabled} />
          </label>
        </>
      }
      secondaryToolbar={
        hmacEnabled ? (
          <>
            <Label htmlFor="hash-secret" className="text-xs">Secret key</Label>
            <Input
              id="hash-secret"
              className="h-7 w-64 text-xs"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="Enter secret key..."
              autoComplete="off"
              spellCheck={false}
            />
          </>
        ) : undefined
      }
      first={
        source === "text" ? (
          <EditorPane title="Input" htmlFor="hash-input" scroll={false}
            actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}>
            <CodeTextarea
              id="hash-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter text to generate hashes..."
            />
          </EditorPane>
        ) : (
          <EditorPane title="File" htmlFor="hash-file">
            <div className="space-y-3 p-4">
              <Input
                id="hash-file"
                type="file"
                onChange={(e) => {
                  void handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {file && (
                <div className="flex items-center justify-between rounded-md border bg-muted px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate" data-testid="hash-file-name">{file.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                  </span>
                  <Button onClick={clearFile} variant="ghost" size="sm">
                    Clear
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">The file is read on this device. It is not uploaded.</p>
            </div>
          </EditorPane>
        )
      }
      second={
        <EditorPane title="Hashes">
          <div className="result-list" ref={listRef}>
            {HASH_TYPES.map(({ type, label }) =>
              renderResult(type, label, hashes[type] ?? "", `${label} hash will appear here...`)
            )}
            {hmacEnabled &&
              HMAC_TYPES.map(({ type, label }) =>
                renderResult(`hmac-${type}`, label, hmacs[type] ?? "", `${label} will appear here...`)
              )}
          </div>
        </EditorPane>
      }
      status={<span>{message === null ? "Ready" : `${formatBytes(byteCount)} hashed`}</span>}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
