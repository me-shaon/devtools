import { useEffect, useRef, useState, type DragEvent } from "react";
import { ExternalLink, FileUp, ImageUp, ScanLine } from "lucide-react";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { formatBytes } from "@/utils/hash";
import {
  decodeQrPixels,
  firstImageFile,
  parseQrPayload,
  readImagePixels,
  type QrDecodeResult,
  type QrPayload,
} from "@/utils/qr-reader";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "How do I add an image?",
    a: "Click Open image, drop an image file on the Image pane, or paste a screenshot with Cmd+V or Ctrl+V while this tool is open.",
  },
  {
    q: "Why is no QR code found?",
    a: "The code can be too small, blurred, cut off, or too low in contrast. Crop the image close to the code and keep the white border around it. The reader also tries light codes on dark backgrounds.",
  },
  {
    q: "Which payload types does the tool recognize?",
    a: "It labels web links, Wi-Fi settings, email (mailto), phone (tel), and SMS payloads. For Wi-Fi codes it shows the network name, security type, and password. Other content shows as plain text.",
  },
  {
    q: "Can it read more than one code in an image?",
    a: "No. The tool reads one code. Crop the image to the code that you need.",
  },
  {
    q: "Is my image uploaded?",
    a: "No. The image is read and decoded on your device. Nothing leaves the app.",
  },
];

interface Source {
  name: string;
  size: number;
  previewUrl: string;
}

interface Decoded {
  width: number;
  height: number;
  result: QrDecodeResult | null;
  payload: QrPayload | null;
}

const isVisible = (element: HTMLElement | null) => Boolean(element?.isConnected && !element.closest("[hidden]"));

export function QrReader() {
  const [source, setSource] = useState<Source | null>(null);
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const previewRef = useRef("");

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const handleImage = async (file: File | null | undefined) => {
    if (!file) return;
    const requestId = ++requestRef.current;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const previewUrl = URL.createObjectURL(file);
    previewRef.current = previewUrl;
    setSource({ name: file.name || "Pasted image", size: file.size, previewUrl });
    setDecoded(null);
    setReadError("");
    setReading(true);
    try {
      const pixels = await readImagePixels(file);
      if (requestRef.current !== requestId) return;
      const result = decodeQrPixels(pixels);
      setDecoded({ width: pixels.width, height: pixels.height, result, payload: result ? parseQrPayload(result.text) : null });
    } catch (error) {
      if (requestRef.current !== requestId) return;
      setReadError(error instanceof Error ? error.message : "Could not read this image.");
    } finally {
      if (requestRef.current === requestId) setReading(false);
    }
  };

  // Pasting an image anywhere decodes it while this tool is the visible one. Text pastes pass through.
  const handleImageRef = useRef(handleImage);
  handleImageRef.current = handleImage;
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!isVisible(dropRef.current)) return;
      const file = firstImageFile(event.clipboardData?.items, event.clipboardData?.files);
      if (!file) return;
      event.preventDefault();
      void handleImageRef.current(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const clear = () => {
    requestRef.current++;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = "";
    setSource(null);
    setDecoded(null);
    setReadError("");
    setReading(false);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = firstImageFile(event.dataTransfer.items, event.dataTransfer.files);
    if (file) void handleImage(file);
    else setReadError("Drop an image file, such as a PNG or JPEG.");
  };

  const result = decoded?.result ?? null;
  const payload = decoded?.payload ?? null;
  const text = result?.text ?? "";
  const notFound = Boolean(decoded && !result);
  const location = result?.location;
  const marker = decoded ? Math.max(decoded.width, decoded.height) / 120 : 0;

  const status = () => {
    if (reading) return <span>Reading image</span>;
    if (readError) return <span className="text-destructive">Unreadable image</span>;
    if (!decoded) return <span>Ready</span>;
    return (
      <>
        <span>{result ? `QR code found · ${payload?.label}` : "No QR code"}</span>
        <span>{decoded.width} × {decoded.height} px</span>
      </>
    );
  };

  return (
    <ToolWorkspace
      id="qr-reader"
      toolbar={
        <>
          <input
            ref={fileInputRef}
            id="qr-reader-file"
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void handleImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button type="button" className="toolbar-text-button" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={14} aria-hidden="true" />
            Open image
          </button>
          {source && (
            <button type="button" className="toolbar-text-button" onClick={clear}>
              Clear
            </button>
          )}
        </>
      }
      notice={
        readError ? (
          <div className="workspace-notice" data-tone="error" role="alert">{readError}</div>
        ) : notFound ? (
          <div className="workspace-notice" data-tone="error" role="alert">
            No QR code found in this image. Crop the image close to the code and try again.
          </div>
        ) : undefined
      }
      first={
        <EditorPane title="Image">
          <div
            ref={dropRef}
            className={`flex h-full min-h-full flex-col ${dragging ? "bg-accent" : ""}`}
            data-testid="qr-reader-drop"
            data-dragging={dragging || undefined}
            onDragOver={onDragOver}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {source ? (
              <div className="space-y-3 p-4">
                <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm">
                  <ImageUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{source.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(source.size)}</span>
                </div>
                <div className="relative inline-block max-w-full">
                  <img
                    src={source.previewUrl}
                    alt="Preview of the selected image"
                    className="block max-h-96 max-w-full rounded-md border bg-muted object-contain"
                  />
                  {decoded && location && (
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox={`0 0 ${decoded.width} ${decoded.height}`}
                      preserveAspectRatio="none"
                      aria-hidden="true"
                      data-testid="qr-reader-outline"
                    >
                      <polygon
                        className="fill-primary/15 stroke-primary"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                        points={[location.topLeft, location.topRight, location.bottomRight, location.bottomLeft]
                          .map((p) => `${p.x},${p.y}`)
                          .join(" ")}
                      />
                      {[location.topLeft, location.topRight, location.bottomRight, location.bottomLeft].map((p, i) => (
                        <circle key={i} className="fill-primary" cx={p.x} cy={p.y} r={marker} />
                      ))}
                    </svg>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">The image is decoded on this device. It is not uploaded.</p>
              </div>
            ) : (
              <PaneEmpty
                icon={<ScanLine size={22} aria-hidden="true" />}
                title="Drop an image with a QR code"
                hint="You can also paste a screenshot or click Open image."
              />
            )}
          </div>
        </EditorPane>
      }
      second={
        <EditorPane title="Decoded text" htmlFor={text ? "qr-reader-output" : undefined} scroll={false}
          actions={<CopyButton value={text} label="Copy text" />}>
          {result && payload ? (
            <>
              <div className="result-list">
                <div className="result-row">
                  <span className="result-row-label">Type</span>
                  <span className="result-row-value" data-testid="qr-reader-kind">{payload.label}</span>
                  {payload.href ? (
                    <a className="toolbar-text-button" href={payload.href} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} aria-hidden="true" />
                      {payload.kind === "email" ? "Write email" : "Open link"}
                    </a>
                  ) : (
                    <span />
                  )}
                </div>
                {payload.fields.map((field) => (
                  <div key={field.label} className="result-row">
                    <span className="result-row-label">{field.label}</span>
                    <span className="result-row-value">{field.value}</span>
                    <CopyButton value={field.value} iconOnly label={`Copy ${field.label.toLowerCase()}`} />
                  </div>
                ))}
              </div>
              <CodeTextarea id="qr-reader-output" value={text} readOnly />
            </>
          ) : (
            <PaneEmpty
              title={reading ? "Reading the image" : "Decoded text appears here"}
              hint={notFound ? "No QR code found in this image." : "Add an image that contains a QR code."}
            />
          )}
        </EditorPane>
      }
      status={status()}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
