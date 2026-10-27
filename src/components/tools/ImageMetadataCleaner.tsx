import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { zipSync } from "fflate";
import { ChevronDown, ChevronRight, FileUp, ImageIcon, LoaderCircle, ShieldOff, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { saveFile } from "@/lib/desktop";
import { formatBytes } from "@/utils/hash";
import {
  FINDING_KIND_LABELS,
  FINDING_KIND_ORDER,
  FORMAT_LABELS,
  FORMAT_MIME,
  cleanFileName,
  cleanImage,
  detectImageFormat,
  inspectImage,
  remainingMetadata,
  scanForMetadataMarkers,
  type CleanOptions,
  type CleanResult,
  type MetadataFinding,
} from "@/utils/image-metadata";
import {
  DEFAULT_OUTPUT_FORMAT,
  DEFAULT_QUALITY,
  OUTPUT_FORMATS,
  outputMime,
  reencodeImage,
  usesQuality,
  type OutputFormat,
} from "@/utils/image-reencode";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which metadata does the tool find?",
    a: "It reads EXIF (camera, dates, GPS position, software), XMP (including the IPTC digital source type that marks AI images), C2PA Content Credentials, IPTC captions and credits, JPEG comments, and PNG text chunks. PNG text chunks often hold Stable Diffusion, ComfyUI, or NovelAI prompts and workflows.",
  },
  {
    q: "What is the difference between Preserve original quality and re-encoding?",
    a: "With Preserve original quality on, the tool removes the metadata blocks and copies the compressed image data unchanged. The pixels and the format stay the same. When it is off, the tool decodes the image and encodes new pixels in the format you choose. The new file has no metadata, and the image is turned upright. The new file no longer matches the original byte for byte, so exact-hash lookups do not find it.",
  },
  {
    q: "Does cleaning remove AI watermarks?",
    a: "No. Some AI tools hide an invisible watermark in the pixels, for example Google SynthID or Meta Stable Signature. Metadata removal does not touch the pixels, and re-encoding does not reliably remove these watermarks or defeat reverse image search. The image looks the same after cleaning.",
  },
  {
    q: "Why can a cleaned image show rotated?",
    a: "Phones often store the photo sideways and add an EXIF orientation tag. If you remove that tag, some apps show the photo sideways. Turn on Keep orientation to keep only that tag, or turn off Preserve original quality so that the tool writes upright pixels.",
  },
  {
    q: "Can I share AI images without a label after cleaning?",
    a: "Removing metadata does not change where an image came from. Many platforms have their own AI-disclosure rules, and you must follow them. Images stay on your device during cleaning. Nothing is uploaded.",
  },
];

const ACCEPT = "image/jpeg,image/png,image/webp";

interface Item {
  id: string;
  name: string;
  size: number;
  blob: Blob;
  bytes: Uint8Array;
  previewUrl: string;
}

interface Output {
  bytes: Uint8Array;
  name: string;
  mime: string;
  formatLabel: string;
  /** Labels of metadata still in the output. Empty means none left. */
  remaining: string[];
}

const isVisible = (element: HTMLElement | null) => Boolean(element?.isConnected && !element.closest("[hidden]"));

const readBytes = (file: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsArrayBuffer(file);
  });

const objectUrl = (blob: Blob) => {
  try {
    return typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : "";
  } catch {
    return "";
  }
};

const revoke = (url: string) => {
  try {
    if (url) URL.revokeObjectURL(url);
  } catch {
    /* Nothing to release. */
  }
};

const imageFiles = (items?: DataTransferItemList | null, files?: FileList | null): File[] => {
  const out: File[] = [];
  for (const item of Array.from(items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) out.push(file);
    }
  }
  if (out.length) return out;
  return Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
};

const uniqueName = (name: string, used: Map<string, number>) => {
  const count = used.get(name) ?? 0;
  used.set(name, count + 1);
  if (!count) return name;
  const dot = name.lastIndexOf(".");
  return dot < 0 ? `${name}-${count + 1}` : `${name.slice(0, dot)}-${count + 1}${name.slice(dot)}`;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Four format cards with radio group keyboard behavior. */
function FormatPicker({ value, onChange, disabled }: { value: OutputFormat; onChange: (f: OutputFormat) => void; disabled: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = OUTPUT_FORMATS.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % OUTPUT_FORMATS.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + OUTPUT_FORMATS.length) % OUTPUT_FORMATS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(OUTPUT_FORMATS[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Output format" aria-disabled={disabled || undefined} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {OUTPUT_FORMATS.map((format, index) => {
        const checked = value === format.id;
        return (
          <button
            key={format.id}
            ref={(el) => (refs.current[index] = el)}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(format.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`flex min-w-28 flex-col items-start rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
            }`}
          >
            <span className="text-sm font-semibold">{format.title}</span>
            <span className={`text-2xs ${checked ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{format.caption}</span>
          </button>
        );
      })}
    </div>
  );
}

function FindingRow({ finding, id, removed }: { finding: MetadataFinding; id: string; removed: boolean }) {
  const [open, setOpen] = useState(false);
  const value = finding.raw ?? finding.detail;
  return (
    <div className="border-b border-border/50">
      <div className="result-row border-b-0">
        <span className="result-row-label">
          {finding.label}
          <span className="block text-2xs font-normal">{finding.source}</span>
        </span>
        <span className="result-row-value">
          {finding.detail}
          <span className={`ml-2 rounded px-1.5 py-0.5 font-sans text-2xs ${removed ? "bg-muted text-muted-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {removed ? "Removed" : "Kept"}
          </span>
        </span>
        <span className="flex items-center gap-1">
          {finding.raw && (
            <button
              type="button"
              className="toolbar-text-button"
              aria-expanded={open}
              aria-controls={`${id}-raw`}
              aria-label={`${open ? "Hide" : "Show"} full value of ${finding.label}`}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            </button>
          )}
          <CopyButton value={value} iconOnly label={`Copy ${finding.label}`} />
        </span>
      </div>
      {finding.raw && open && (
        <div id={`${id}-raw`} className="px-4 pb-3">
          <CodeTextarea
            readOnly
            value={finding.raw}
            aria-label={`Full value of ${finding.label}`}
            rows={Math.min(14, finding.raw.split("\n").length + 1)}
            className="h-auto max-h-80 rounded-md border bg-muted/40 text-xs"
          />
        </div>
      )}
    </div>
  );
}

export function ImageMetadataCleaner() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [preserve, setPreserve] = useState(false);
  const [keepColorProfile, setKeepColorProfile] = useState(true);
  const [keepOrientation, setKeepOrientation] = useState(true);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(DEFAULT_OUTPUT_FORMAT);
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [outputs, setOutputs] = useState<Record<string, Output>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  useEffect(() => () => itemsRef.current.forEach((item) => revoke(item.previewUrl)), []);

  const options: CleanOptions = useMemo(() => ({ keepColorProfile, keepOrientation }), [keepColorProfile, keepOrientation]);

  // Output settings changed, so earlier outputs no longer match.
  useEffect(() => setOutputs({}), [preserve, options, outputFormat, quality]);

  const analyses = useMemo(() => {
    const map = new Map<string, { result?: CleanResult; error?: string }>();
    for (const item of items) {
      try {
        map.set(item.id, { result: cleanImage(item.bytes, options) });
      } catch (e) {
        map.set(item.id, { error: e instanceof Error ? e.message : "Could not read this image." });
      }
    }
    return map;
  }, [items, options]);

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setError("");
    const added: Item[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      try {
        const bytes = await readBytes(file);
        const format = detectImageFormat(bytes);
        if (format !== "jpeg" && format !== "png" && format !== "webp") {
          rejected.push(file.name || "Pasted file");
          continue;
        }
        added.push({
          id: `img-${++idRef.current}`,
          name: file.name || `pasted-image.${format === "jpeg" ? "jpg" : format}`,
          size: bytes.length,
          blob: file,
          bytes,
          previewUrl: objectUrl(file),
        });
      } catch {
        setError(`Could not read ${file.name || "the pasted image"}. Open it again.`);
      }
    }
    setSkipped(rejected);
    if (added.length) {
      setItems((prev) => [...prev, ...added]);
      setSelectedId((current) => current ?? added[0].id);
    }
  };

  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!isVisible(dropRef.current)) return;
      const files = imageFiles(event.clipboardData?.items, event.clipboardData?.files);
      if (!files.length) return;
      event.preventDefault();
      void addFilesRef.current(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const removeItem = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item) revoke(item.previewUrl);
    const rest = items.filter((i) => i.id !== id);
    setItems(rest);
    if (selectedId === id) setSelectedId(rest[0]?.id ?? null);
  };

  const clearAll = () => {
    items.forEach((item) => revoke(item.previewUrl));
    setItems([]);
    setSelectedId(null);
    setOutputs({});
    setSkipped([]);
    setError("");
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
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length) void addFiles(files);
    else setError("Drop JPEG, PNG or WebP image files.");
  };

  /** Builds clean outputs for the given items. */
  const process = async (targets: Item[]) => {
    const results: Record<string, Output> = {};
    setProgress({ done: 0, total: targets.length });
    setError("");
    try {
      for (const [index, item] of targets.entries()) {
        const cached = outputs[item.id];
        if (cached) {
          results[item.id] = cached;
        } else if (preserve) {
          const analysis = analyses.get(item.id);
          if (!analysis?.result) throw new Error(`${item.name}: ${analysis?.error ?? "Could not read this image."}`);
          const { bytes, after } = analysis.result;
          results[item.id] = {
            bytes,
            name: cleanFileName(item.name, after.format),
            mime: FORMAT_MIME[after.format],
            formatLabel: FORMAT_LABELS[after.format],
            remaining: remainingMetadata(after).map((f) => f.label),
          };
        } else {
          let bytes: Uint8Array;
          try {
            bytes = await reencodeImage(item.blob, outputFormat, quality);
          } catch (e) {
            throw new Error(`${item.name}: ${e instanceof Error ? e.message : "Could not re-encode this image."}`);
          }
          const format = detectImageFormat(bytes);
          const remaining =
            format === "jpeg" || format === "png" || format === "webp" ? remainingMetadata(inspectImage(bytes)).map((f) => f.label) : scanForMetadataMarkers(bytes);
          results[item.id] = {
            bytes,
            name: cleanFileName(item.name, outputFormat),
            mime: outputMime(outputFormat),
            formatLabel: OUTPUT_FORMATS.find((f) => f.id === outputFormat)!.title,
            remaining,
          };
        }
        setProgress({ done: index + 1, total: targets.length });
        // Let the button label and the list repaint between images.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      setOutputs((prev) => ({ ...prev, ...results }));
      return results;
    } catch (e) {
      setOutputs((prev) => ({ ...prev, ...results }));
      setError(e instanceof Error ? e.message : "Could not clean the images.");
      return null;
    } finally {
      setProgress(null);
    }
  };

  const saveOne = async (output: Output) => {
    try {
      if (await saveFile(new Blob([output.bytes.slice()], { type: output.mime }), output.name)) toast.success(`Saved ${output.name}.`);
    } catch {
      setError("Could not save the clean copy. Try again.");
    }
  };

  const saveZip = async (list: Output[]) => {
    const used = new Map<string, number>();
    const entries = Object.fromEntries(list.map((output) => [uniqueName(output.name, used), output.bytes] as const));
    const zip = zipSync(entries, { level: 0 });
    try {
      if (await saveFile(new Blob([zip.slice()], { type: "application/zip" }), "clean-images.zip")) {
        toast.success(`Saved ${plural(list.length, "clean image")} as a ZIP file.`);
      }
    } catch {
      setError("Could not save the ZIP file. Try again.");
    }
  };

  const cleanAll = async () => {
    const results = await process(items);
    if (!results) return;
    const list = items.map((item) => results[item.id]);
    if (list.length === 1) await saveOne(list[0]);
    else await saveZip(list);
  };

  const selected = items.find((item) => item.id === selectedId) ?? null;

  const saveSelected = async () => {
    if (!selected) return;
    const results = await process([selected]);
    if (results) await saveOne(results[selected.id]);
  };

  const selectedAnalysis = selected ? analyses.get(selected.id) : undefined;
  const selectedResult = selectedAnalysis?.result;
  const selectedOutput = selected ? outputs[selected.id] : undefined;
  const busy = progress !== null;

  const counts = useMemo(() => {
    let ai = 0;
    let location = 0;
    for (const item of items) {
      const before = analyses.get(item.id)?.result?.before;
      if (before?.hasAi) ai++;
      if (before?.hasLocation) location++;
    }
    return { ai, location };
  }, [items, analyses]);

  const grouped = useMemo(() => {
    const findings = selectedResult?.before.findings ?? [];
    return FINDING_KIND_ORDER.map((kind) => ({ kind, findings: findings.filter((f) => f.kind === kind) })).filter((g) => g.findings.length);
  }, [selectedResult]);

  const isRemoved = (finding: MetadataFinding) => (preserve ? finding.removable : finding.label !== "JFIF header");
  const orientationWarning = preserve && !keepOrientation && (selectedResult?.before.orientation ?? 1) > 1;
  const mainLabel = busy
    ? `Cleaning ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
    : `Clean ${plural(items.length, "image")}`;

  const outputSummary = (item: Item, output: Output) => (
    <>
      {output.formatLabel} · {formatBytes(item.size)} → {formatBytes(output.bytes.length)} ·{" "}
      {output.remaining.length ? `Still has ${output.remaining.join(", ")}` : "No metadata left"}
    </>
  );

  return (
    <ToolWorkspace
      id="image-metadata"
      toolbar={
        <>
          <input
            ref={fileInputRef}
            id="image-metadata-file"
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <button type="button" className="toolbar-text-button" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={14} aria-hidden="true" />
            Open images
          </button>
          {items.length > 0 && (
            <button type="button" className="toolbar-text-button" onClick={clearAll} disabled={busy}>
              Clear
            </button>
          )}
          {preserve && (
            <>
              <label className="option-switch indent-control" htmlFor="image-metadata-keep-color">
                Keep color profile
                <Switch id="image-metadata-keep-color" checked={keepColorProfile} onCheckedChange={setKeepColorProfile} disabled={busy} />
              </label>
              <label className="option-switch" htmlFor="image-metadata-keep-orientation">
                Keep orientation
                <Switch id="image-metadata-keep-orientation" checked={keepOrientation} onCheckedChange={setKeepOrientation} disabled={busy} />
              </label>
            </>
          )}
          <Button size="sm" onClick={() => void cleanAll()} disabled={!items.length || busy} aria-busy={busy || undefined}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ShieldOff aria-hidden="true" />}
            {mainLabel}
          </Button>
          {items.length > 1 && selected && (
            <button type="button" className="toolbar-text-button" onClick={() => void saveSelected()} disabled={busy}>
              Save clean copy
            </button>
          )}
        </>
      }
      secondaryToolbar={
        <div className="flex w-full flex-wrap items-start gap-x-6 gap-y-3">
          <div className="max-w-xs space-y-1">
            <label className="option-switch" htmlFor="image-metadata-preserve">
              Preserve original quality
              <Switch id="image-metadata-preserve" checked={preserve} onCheckedChange={setPreserve} disabled={busy} aria-describedby="image-metadata-preserve-help" />
            </label>
            <p id="image-metadata-preserve-help" className="text-2xs text-muted-foreground">
              {preserve
                ? "Remove metadata only. Keeps the exact pixels and format with no recompression."
                : "Re-encoding writes new upright pixels with no metadata. The file no longer matches the original byte for byte, so exact-hash lookups fail. It does not reliably defeat reverse image search or remove pixel watermarks such as SynthID."}
            </p>
          </div>
          <FormatPicker value={outputFormat} onChange={setOutputFormat} disabled={preserve || busy} />
          {!preserve && usesQuality(outputFormat) && (
            <div className="flex items-center gap-2 self-center text-xs">
              <label htmlFor="image-metadata-quality">Quality</label>
              <input
                id="image-metadata-quality"
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                disabled={busy}
                className="w-32 accent-primary"
              />
              <span className="w-7 tabular-nums text-muted-foreground">{quality}</span>
            </div>
          )}
        </div>
      }
      notice={
        <>
          {error && (
            <div className="workspace-notice" data-tone="error" role="alert">
              {error}
            </div>
          )}
          {skipped.length > 0 && (
            <div className="workspace-notice" role="status">
              Only JPEG, PNG and WebP images are supported. Skipped: {skipped.join(", ")}.
            </div>
          )}
        </>
      }
      first={
        <EditorPane title="Images">
          <div
            ref={dropRef}
            className={`flex h-full min-h-full flex-col ${dragging ? "bg-accent" : ""}`}
            data-testid="image-metadata-drop"
            data-dragging={dragging || undefined}
            onDragOver={onDragOver}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {items.length ? (
              <ul className="flex flex-col" aria-label="Opened images">
                {items.map((item) => {
                  const analysis = analyses.get(item.id);
                  const before = analysis?.result?.before;
                  const output = outputs[item.id];
                  const active = item.id === selectedId;
                  return (
                    <li key={item.id} className={`flex items-center gap-2 border-b border-border/50 pr-2 ${active ? "bg-muted" : ""}`}>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left"
                        aria-pressed={active}
                        onClick={() => setSelectedId(item.id)}
                      >
                        {item.previewUrl ? (
                          <img src={item.previewUrl} alt="" className="h-10 w-10 shrink-0 rounded border bg-muted object-cover" />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border bg-muted">
                            <ImageIcon size={16} aria-hidden="true" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{item.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {before ? FORMAT_LABELS[before.format] : "Unreadable"} · {formatBytes(item.size)} ·{" "}
                            {before ? plural(before.findings.length, "item") : analysis?.error}
                          </span>
                          {output && <span className="block text-2xs text-muted-foreground">{outputSummary(item, output)}</span>}
                        </span>
                        {before?.hasAi && (
                          <span className="shrink-0 rounded bg-warning px-1.5 py-0.5 text-2xs font-semibold text-warning-foreground">AI</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="toolbar-text-button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => removeItem(item.id)}
                        disabled={busy}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <PaneEmpty
                icon={<ImageIcon size={22} aria-hidden="true" />}
                title="Drop JPEG, PNG or WebP images"
                hint="You can also paste an image or click Open images. Images stay on this device."
              />
            )}
          </div>
        </EditorPane>
      }
      second={
        <EditorPane title={selected ? `Metadata in ${selected.name}` : "Metadata"}>
          {selected && selectedResult ? (
            <div className="flex flex-col">
              <div className="space-y-1 border-b border-border/50 px-4 py-3 text-xs" data-testid="image-metadata-summary">
                {preserve ? (
                  <p>
                    {selectedResult.removedCount
                      ? `Removed ${plural(selectedResult.removedCount, "item")} · ${formatBytes(Math.max(0, selectedResult.savedBytes))} smaller`
                      : "No removable metadata"}
                  </p>
                ) : (
                  <p>Re-encoding writes a new {OUTPUT_FORMATS.find((f) => f.id === outputFormat)!.title} file without any of these items.</p>
                )}
                {selectedOutput && <p className="text-muted-foreground">Output: {outputSummary(selected, selectedOutput)}</p>}
              </div>
              {orientationWarning && (
                <div className="workspace-notice" role="status">
                  This image has EXIF orientation {selectedResult.before.orientation}. The clean copy may show rotated. Turn on Keep orientation to keep it.
                </div>
              )}
              {grouped.length ? (
                grouped.map((group) => (
                  <section key={group.kind} aria-labelledby={`image-metadata-group-${group.kind}`}>
                    <h3
                      id={`image-metadata-group-${group.kind}`}
                      className={`flex items-center gap-1.5 px-4 pb-1 pt-3 text-xs font-semibold ${group.kind === "ai" ? "text-warning" : "text-muted-foreground"}`}
                    >
                      {group.kind === "ai" && <Sparkles size={13} aria-hidden="true" />}
                      {FINDING_KIND_LABELS[group.kind]}
                    </h3>
                    <div className="result-list">
                      {group.findings.map((finding, index) => (
                        <FindingRow key={`${finding.label}-${index}`} id={`image-metadata-${group.kind}-${index}`} finding={finding} removed={isRemoved(finding)} />
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <p className="px-4 py-3 text-sm text-muted-foreground">This image has no metadata.</p>
              )}
              <p className="px-4 py-3 text-xs text-muted-foreground">
                Cleaning does not change how the image looks. It does not remove invisible watermarks in the pixels, such as Google SynthID or Meta Stable Signature. Platforms can have their own AI-disclosure rules.
              </p>
            </div>
          ) : selected && selectedAnalysis?.error ? (
            <PaneEmpty title="Could not read this image" hint={selectedAnalysis.error} />
          ) : (
            <PaneEmpty title="Metadata appears here" hint="Open an image to see its camera, location, AI and provenance data." />
          )}
        </EditorPane>
      }
      status={
        items.length ? (
          <span>
            {[plural(items.length, "image"), `${counts.ai} with AI metadata`, `${counts.location} with location`].join(" · ")}
          </span>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
