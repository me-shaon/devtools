import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { zipSync } from "fflate";
import { ArrowLeft, ArrowRight, FileImage, FilePlus2, FileText, LoaderCircle, RotateCcw, RotateCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { EditorPane, PaneEmpty, PaneOpenFile, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { saveFile } from "@/lib/desktop";
import { formatBytes } from "@/utils/hash";
import {
  baseName,
  buildPdf,
  inspectPdf,
  isJpeg,
  isPdf,
  isPng,
  jpegOrientation,
  MAX_PDF_BYTES,
  numberedNames,
  parsePageRanges,
  rotate,
  type ImagePageSize,
  type PageRef,
  type PdfSource,
} from "@/utils/pdf-tools";
import { closeRender, openForRender, renderPage, type ImageFormat, type RenderDocument } from "@/utils/pdf-render";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Are my files uploaded?",
    a: "No. The tool reads, renders, and writes the files on this device. Nothing is sent over the network.",
  },
  {
    q: "How do I merge, split, or extract pages?",
    a: "Add one or more PDFs and images. The Pages pane shows every page of the new document in order. Drag pages or use the arrow buttons to reorder them, and rotate or delete pages. Select pages to save only those pages. Save PDF writes one file. Split pages writes one PDF for each page in a .zip file.",
  },
  {
    q: "How do I select a range of pages?",
    a: "Type pages in the Select field, such as `1-3, 5, 8-`, and press Enter. The numbers are positions in the Pages pane, not in the original files.",
  },
  {
    q: "Does the new PDF keep the metadata of the source files?",
    a: "No. The new file has no title, author, subject, keywords, or the name of the app that made the source. The pages keep their text, images, links, and form fields.",
  },
  {
    q: "Which images can I add?",
    a: "JPEG and PNG files go into the PDF as they are, with no loss of quality. WebP, GIF, AVIF, and BMP files are changed to PNG first. A JPEG photo that a phone saved sideways is turned upright.",
  },
  {
    q: "Why does a PDF not open?",
    a: "The tool cannot open a PDF that is protected with a password. Remove the password in a PDF reader, then add the file again.",
  },
];

const IMAGE_SIZES: { value: ImagePageSize; label: string }[] = [
  { value: "image", label: "Fit image" },
  { value: "a4", label: "A4" },
  { value: "letter", label: "Letter" },
];

const DPI_OPTIONS = [72, 150, 300];

const THUMB_SIDE = 240;

let nextId = 0;
const newId = (prefix: string) => `${prefix}${++nextId}`;

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

const toBytes = (blob: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the file."));
    reader.readAsArrayBuffer(blob);
  });

/** Draws an image on a canvas and encodes it. createImageBitmap applies the EXIF orientation. */
async function reencode(blob: Blob, type: "image/png" | "image/jpeg"): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This system cannot draw the image.");
    context.drawImage(bitmap, 0, 0);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
    if (!out) throw new Error("The image could not be converted.");
    return toBytes(out);
  } finally {
    bitmap.close();
  }
}

/** Reads a file as a PDF or an image source. */
async function readSource(file: File): Promise<PdfSource> {
  if (file.size > MAX_PDF_BYTES) throw new Error(`${file.name} is larger than 200 MB.`);
  const bytes = await toBytes(file);
  const id = newId("s");
  if (isPdf(bytes)) {
    return { id, name: file.name, kind: "pdf", bytes, mime: "application/pdf", ...(await inspectPdf(bytes)) };
  }
  let image: Uint8Array = bytes;
  let mime: "image/png" | "image/jpeg";
  if (isPng(bytes)) mime = "image/png";
  else if (isJpeg(bytes)) {
    mime = "image/jpeg";
    if (jpegOrientation(bytes) !== 1) image = await reencode(file, "image/jpeg");
  } else if (file.type.startsWith("image/")) {
    mime = "image/png";
    try {
      image = await reencode(file, "image/png");
    } catch {
      throw new Error(`${file.name} could not be read as an image.`);
    }
  } else {
    throw new Error(`${file.name} is not a PDF or an image.`);
  }
  return { id, name: file.name, kind: "image", bytes: image, mime, pageCount: 1, width: 0, height: 0, baseRotations: [0] };
}

const thumbKey = (sourceId: string, index: number) => `${sourceId}:${index}`;

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function PdfTools() {
  const [sources, setSources] = useState<PdfSource[]>([]);
  const [pages, setPages] = useState<PageRef[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [imagePageSize, setImagePageSize] = useState<ImagePageSize>("image");
  const [imageFormat, setImageFormat] = useState<ImageFormat>("png");
  const [dpi, setDpi] = useState(150);
  const [rangeInput, setRangeInput] = useState("");
  const [rangeError, setRangeError] = useState("");
  const [busy, setBusy] = useState("");
  const [adding, setAdding] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragPage, setDragPage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renderDocs = useRef(new Map<string, RenderDocument>());
  const thumbsRef = useRef(thumbs);
  thumbsRef.current = thumbs;

  const sourceMap = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  const hasImages = sources.some((source) => source.kind === "image");
  const targets = selected.size ? pages.filter((page) => selected.has(page.id)) : pages;

  // Free thumbnails and PDF.js documents when the tool closes.
  useEffect(
    () => () => {
      Object.values(thumbsRef.current).forEach((url) => URL.revokeObjectURL(url));
      renderDocs.current.forEach((doc) => closeRender(doc));
    },
    [],
  );

  const renderThumbs = async (source: PdfSource) => {
    try {
      const doc = await openForRender(source.bytes);
      renderDocs.current.set(source.id, doc);
      for (let index = 0; index < source.pageCount; index++) {
        if (renderDocs.current.get(source.id) !== doc) return;
        const blob = await renderPage(doc, index, { dpi: 72, format: "png", maxSide: THUMB_SIDE });
        if (renderDocs.current.get(source.id) !== doc) return;
        setThumbs((current) => ({ ...current, [thumbKey(source.id, index)]: URL.createObjectURL(blob) }));
      }
    } catch {
      // A page without a thumbnail still shows its number and can be saved.
    }
  };

  const addFiles = async (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setAdding((count) => count + list.length);
    for (const file of list) {
      try {
        const source = await readSource(file);
        setSources((current) => [...current, source]);
        setPages((current) => [
          ...current,
          ...Array.from({ length: source.pageCount }, (_, index) => ({ id: newId("p"), sourceId: source.id, index, rotation: 0 })),
        ]);
        if (source.kind === "image") {
          setThumbs((current) => ({ ...current, [thumbKey(source.id, 0)]: URL.createObjectURL(new Blob([source.bytes as BlobPart], { type: source.mime })) }));
        } else {
          void renderThumbs(source);
        }
      } catch (err) {
        toast.error((err as Error).message || `${file.name} could not be read.`);
      } finally {
        setAdding((count) => count - 1);
      }
    }
  };

  const removeSource = (id: string) => {
    const doc = renderDocs.current.get(id);
    renderDocs.current.delete(id);
    if (doc) closeRender(doc);
    setThumbs((current) => {
      const next: Record<string, string> = {};
      for (const [key, url] of Object.entries(current)) {
        if (key.startsWith(`${id}:`)) URL.revokeObjectURL(url);
        else next[key] = url;
      }
      return next;
    });
    const removed = new Set(pages.filter((page) => page.sourceId === id).map((page) => page.id));
    setSelected((current) => new Set([...current].filter((pageId) => !removed.has(pageId))));
    setPages((current) => current.filter((page) => page.sourceId !== id));
    setSources((current) => current.filter((source) => source.id !== id));
  };

  const clearAll = () => {
    renderDocs.current.forEach((doc) => closeRender(doc));
    renderDocs.current.clear();
    Object.values(thumbs).forEach((url) => URL.revokeObjectURL(url));
    setThumbs({});
    setSelected(new Set());
    setPages([]);
    setSources([]);
    setRangeInput("");
    setRangeError("");
  };

  const updatePages = (ids: Set<string>, change: (page: PageRef) => PageRef | null) =>
    setPages((current) => current.flatMap((page) => (ids.has(page.id) ? (change(page) ?? []) : [page])));

  const rotatePages = (ids: Set<string>, by: number) => updatePages(ids, (page) => ({ ...page, rotation: rotate(page.rotation, by) }));

  const deletePages = (ids: Set<string>) => {
    updatePages(ids, () => null);
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))));
  };

  const movePage = (id: string, by: number) =>
    setPages((current) => {
      const from = current.findIndex((page) => page.id === id);
      return moveItem(current, from, from + by);
    });

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyRange = () => {
    const result = parsePageRanges(rangeInput, pages.length);
    if ("error" in result) {
      setRangeError(result.error);
      return;
    }
    setRangeError("");
    setSelected(new Set(result.pages.map((index) => pages[index].id)));
  };

  const onDropPage = (targetId: string) => {
    if (!dragPage || dragPage === targetId) return;
    setPages((current) => moveItem(current, current.findIndex((page) => page.id === dragPage), current.findIndex((page) => page.id === targetId)));
    setDragPage(null);
  };

  const onDropFiles = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    setDragging(false);
    void addFiles(event.dataTransfer.files);
  };

  const outputBase = () => {
    const used = new Set(targets.map((page) => page.sourceId));
    if (used.size > 1) return "merged";
    const source = sourceMap.get([...used][0] ?? "");
    return source ? baseName(source.name) : "document";
  };

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    try {
      await action();
    } catch (err) {
      toast.error((err as Error).message || "The file could not be saved.");
    } finally {
      setBusy("");
    }
  };

  const save = async (blob: Blob, name: string) => {
    if (await saveFile(blob, name)) toast.success(`Saved ${name}.`);
  };

  const savePdf = () =>
    run("Saving the PDF…", async () => {
      const bytes = await buildPdf(sourceMap, targets, { imagePageSize });
      const suffix = selected.size ? "-extract" : sources.length === 1 && sourceMap.get(targets[0]?.sourceId)?.kind === "pdf" ? "-edited" : "";
      await save(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${outputBase()}${suffix}.pdf`);
    });

  const splitPages = () =>
    run("Splitting the pages…", async () => {
      const base = outputBase();
      if (targets.length === 1) {
        const bytes = await buildPdf(sourceMap, targets, { imagePageSize });
        await save(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${base}-01.pdf`);
        return;
      }
      const names = numberedNames(base, targets.length, "pdf");
      const entries: Record<string, Uint8Array> = {};
      for (const [i, page] of targets.entries()) entries[names[i]] = await buildPdf(sourceMap, [page], { imagePageSize });
      await save(new Blob([zipSync(entries, { level: 0 }) as BlobPart], { type: "application/zip" }), `${base}-pages.zip`);
    });

  const saveImages = () =>
    run("Rendering the pages…", async () => {
      const base = outputBase();
      const extension = imageFormat === "jpeg" ? "jpg" : "png";
      const doc = await openForRender(await buildPdf(sourceMap, targets, { imagePageSize }));
      try {
        const names = numberedNames(base, targets.length, extension);
        const entries: Record<string, Uint8Array> = {};
        let single: Blob | null = null;
        for (let i = 0; i < targets.length; i++) {
          const blob = await renderPage(doc, i, { dpi, format: imageFormat, quality: 0.9 });
          if (targets.length === 1) single = blob;
          else entries[names[i]] = await toBytes(blob);
        }
        if (single) await save(single, `${base}.${extension}`);
        else await save(new Blob([zipSync(entries, { level: 0 }) as BlobPart], { type: "application/zip" }), `${base}-images.zip`);
      } finally {
        closeRender(doc);
      }
    });

  const scope = selected.size ? plural(selected.size, "page") : "all pages";
  const disabled = !pages.length || Boolean(busy);

  return (
    <ToolWorkspace
      id="pdf-tools"
      wrapToolbar
      toolbar={
        <>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf,image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button type="button" className="toolbar-text-button" onClick={() => fileInputRef.current?.click()} disabled={Boolean(busy)}>
            <FilePlus2 size={14} aria-hidden="true" />
            Add files
          </button>
          <button type="button" className="toolbar-text-button" onClick={() => void savePdf()} disabled={disabled}>
            Save PDF
          </button>
          <button type="button" className="toolbar-text-button" onClick={() => void splitPages()} disabled={disabled}>
            Split pages
          </button>
          <button type="button" className="toolbar-text-button" onClick={() => void saveImages()} disabled={disabled}>
            Save as images
          </button>
          <label className="indent-control">
            Format
            <select aria-label="Image format" value={imageFormat} onChange={(e) => setImageFormat(e.target.value as ImageFormat)}>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
            </select>
          </label>
          <label className="indent-control">
            Resolution
            <select aria-label="Resolution" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
              {DPI_OPTIONS.map((value) => (
                <option key={value} value={value}>{value} DPI</option>
              ))}
            </select>
          </label>
          {hasImages && (
            <label className="indent-control">
              Image pages
              <select aria-label="Image page size" value={imagePageSize} onChange={(e) => setImagePageSize(e.target.value as ImagePageSize)}>
                {IMAGE_SIZES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
        </>
      }
      notice={busy ? <div className="workspace-notice" role="status">{busy}</div> : undefined}
      first={
        <EditorPane
          title="Files"
          actions={
            sources.length > 0 && (
              <button type="button" className="toolbar-text-button" onClick={clearAll} disabled={Boolean(busy)}>
                Clear
              </button>
            )
          }
        >
          <div
            className={`flex min-h-full flex-col ${dragging ? "bg-accent" : ""}`}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDropFiles}
          >
            {sources.length ? (
              <ul aria-label="Files">
                {sources.map((source) => (
                  <li key={source.id} className="flex items-center gap-3 border-b border-border/50 py-2 pl-4 pr-2">
                    {source.kind === "pdf" ? <FileText size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" /> : <FileImage size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{source.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {source.kind === "pdf" ? plural(source.pageCount, "page") : "Image"} · {formatBytes(source.bytes.length)}
                      </span>
                    </span>
                    <button type="button" className="toolbar-text-button" aria-label={`Remove ${source.name}`} onClick={() => removeSource(source.id)} disabled={Boolean(busy)}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
                {adding > 0 && (
                  <li className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
                    <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                    Reading {plural(adding, "file")}…
                  </li>
                )}
              </ul>
            ) : adding > 0 ? (
              <PaneEmpty icon={<LoaderCircle size={20} className="animate-spin" aria-hidden="true" />} title={`Reading ${plural(adding, "file")}…`} />
            ) : (
              <PaneOpenFile
                icon={<FileText size={22} aria-hidden="true" />}
                title="Drop PDFs or images here or click to open"
                hint="Merge PDFs, split or extract pages, rotate and reorder them, turn images into a PDF, or save pages as images."
                onClick={() => fileInputRef.current?.click()}
              />
            )}
          </div>
        </EditorPane>
      }
      second={
        <EditorPane
          title="Pages"
          actions={
            pages.length > 0 &&
            (selected.size ? (
              <>
                <button type="button" className="toolbar-text-button" onClick={() => rotatePages(selected, 90)} disabled={Boolean(busy)}>
                  <RotateCw size={14} aria-hidden="true" />
                  Rotate
                </button>
                <button type="button" className="toolbar-text-button" onClick={() => deletePages(selected)} disabled={Boolean(busy)}>
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </button>
                <button type="button" className="toolbar-text-button" onClick={() => setSelected(new Set())}>
                  Clear selection
                </button>
              </>
            ) : (
              <button type="button" className="toolbar-text-button" onClick={() => setSelected(new Set(pages.map((page) => page.id)))}>
                Select all
              </button>
            ))
          }
        >
          {pages.length ? (
            <div className="flex flex-col">
              <form
                className="pane-options"
                onSubmit={(event) => {
                  event.preventDefault();
                  applyRange();
                }}
              >
                <label htmlFor="pdf-tools-range" className="shrink-0">Select</label>
                <input
                  id="pdf-tools-range"
                  type="text"
                  className="h-7 w-40 rounded-md border border-input bg-background px-2 font-mono text-xs"
                  placeholder="1-3, 5, 8-"
                  value={rangeInput}
                  onChange={(e) => {
                    setRangeInput(e.target.value);
                    setRangeError("");
                  }}
                  aria-invalid={Boolean(rangeError)}
                  aria-describedby={rangeError ? "pdf-tools-range-error" : undefined}
                />
                {rangeError && <span id="pdf-tools-range-error" className="text-destructive">{rangeError}</span>}
              </form>
              <ol className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 p-4" aria-label="Pages">
                {pages.map((page, position) => {
                  const source = sourceMap.get(page.sourceId);
                  const thumb = thumbs[thumbKey(page.sourceId, page.index)];
                  const isSelected = selected.has(page.id);
                  const label = `Page ${position + 1}`;
                  const origin = source ? `${source.name}${source.kind === "pdf" ? `, page ${page.index + 1}` : ""}` : "";
                  return (
                    <li
                      key={page.id}
                      draggable={!busy}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        setDragPage(page.id);
                      }}
                      onDragEnd={() => setDragPage(null)}
                      onDragOver={(event) => {
                        if (!dragPage) return;
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onDrop={(event) => {
                        if (!dragPage) return;
                        event.preventDefault();
                        event.stopPropagation();
                        onDropPage(page.id);
                      }}
                      className={`group flex flex-col rounded-md border bg-background ${isSelected ? "border-primary ring-2 ring-primary/40" : "border-border"} ${dragPage === page.id ? "opacity-50" : ""}`}
                      aria-label={`${label}: ${origin}`}
                    >
                      <button
                        type="button"
                        className="flex aspect-square items-center justify-center overflow-hidden rounded-t-md bg-muted p-2"
                        aria-pressed={isSelected}
                        aria-label={`Select ${label}`}
                        title={origin}
                        onClick={() => toggle(page.id)}
                      >
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            draggable={false}
                            className="max-h-full max-w-full bg-white shadow-sm transition-transform"
                            style={{ transform: `rotate(${page.rotation}deg)` }}
                          />
                        ) : (
                          <LoaderCircle size={18} className="animate-spin text-muted-foreground" aria-hidden="true" />
                        )}
                      </button>
                      <div className="flex items-center gap-0.5 border-t border-border/50 px-1 py-1 text-xs">
                        <span className="min-w-0 flex-1 truncate px-1 font-medium" title={origin}>{position + 1}</span>
                        <button type="button" className="toolbar-text-button px-1" aria-label={`Move ${label} earlier`} onClick={() => movePage(page.id, -1)} disabled={position === 0 || Boolean(busy)}>
                          <ArrowLeft size={13} aria-hidden="true" />
                        </button>
                        <button type="button" className="toolbar-text-button px-1" aria-label={`Move ${label} later`} onClick={() => movePage(page.id, 1)} disabled={position === pages.length - 1 || Boolean(busy)}>
                          <ArrowRight size={13} aria-hidden="true" />
                        </button>
                        <button type="button" className="toolbar-text-button px-1" aria-label={`Rotate ${label} left`} onClick={() => rotatePages(new Set([page.id]), -90)} disabled={Boolean(busy)}>
                          <RotateCcw size={13} aria-hidden="true" />
                        </button>
                        <button type="button" className="toolbar-text-button px-1" aria-label={`Rotate ${label} right`} onClick={() => rotatePages(new Set([page.id]), 90)} disabled={Boolean(busy)}>
                          <RotateCw size={13} aria-hidden="true" />
                        </button>
                        <button type="button" className="toolbar-text-button px-1" aria-label={`Delete ${label}`} onClick={() => deletePages(new Set([page.id]))} disabled={Boolean(busy)}>
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
            <PaneEmpty title="Pages appear here" hint="Every page of the new document, in order. Reorder, rotate, delete, or select pages here." />
          )}
        </EditorPane>
      }
      status={
        pages.length ? (
          <>
            <span>{plural(sources.length, "file")}</span>
            <span>{plural(pages.length, "page")}</span>
            <span>Actions use {scope}</span>
          </>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
