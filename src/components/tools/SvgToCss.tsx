import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { formatBytes } from "@/utils/hash";
import { byteLength, convertSvg, type SvgResult } from "@/utils/svg-to-css";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which data URI should I use?",
    a: "Use the URL-encoded one in CSS. It is usually smaller than Base64, and it compresses better with gzip. Use Base64 where a tool only accepts Base64.",
  },
  {
    q: "How does the mask snippet tint an icon?",
    a: "The SVG becomes a mask, and `background-color: currentColor` fills it. The icon takes the text color, so you can change it with `color` or on hover.",
  },
  {
    q: "What does the tool remove?",
    a: "The XML prolog, comments, `<metadata>`, editor data from Inkscape, Sodipodi, Illustrator, and Sketch, and source indentation. It also removes `<script>` elements, `on*` attributes, and `javascript:` links.",
  },
  {
    q: "Why was a namespace added?",
    a: "SVG copied from HTML often has no `xmlns`. A browser shows an SVG image only when the root element has the SVG namespace, so the tool adds it.",
  },
];

const PLACEHOLDER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <path d="M12 2 2 22h20L12 2z" fill="#0ea5e9"/>\n</svg>';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

type Output = { key: string; label: string; value: string };

export function SvgToCss() {
  const [input, setInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const text = useDebouncedValue(input);

  const result = useMemo<SvgResult | null>(() => (text.trim() ? convertSvg(text) : null), [text]);
  const conversion = result && "svg" in result ? result : null;
  const error = result && "error" in result ? result.error : "";

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`The file is ${formatBytes(file.size)}. Open an SVG of 5 MB or less.`);
      return;
    }
    try {
      setInput(await file.text());
    } catch {
      toast.error("Could not read the file.");
    }
  };

  const outputs: Output[] = conversion
    ? [
        { key: "mini", label: "URL-encoded data URI", value: conversion.miniDataUri },
        { key: "base64", label: "Base64 data URI", value: conversion.base64DataUri },
        { key: "background", label: "CSS background", value: conversion.backgroundCss },
        { key: "mask", label: "CSS mask (tintable icon)", value: conversion.maskCss },
        { key: "img", label: "HTML img tag", value: conversion.imgTag },
        { key: "svg", label: "Optimized SVG", value: conversion.svg },
      ]
    : [];

  // Read-only result fields grow to show the whole value at any pane width
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
  }, [conversion]);

  const removed = conversion ? conversion.scripts + conversion.handlers : 0;
  const warning = conversion && removed > 0
    ? `The SVG contained ${[
        conversion.scripts ? `${conversion.scripts} ${conversion.scripts === 1 ? "script" : "scripts"}` : "",
        conversion.handlers ? `${conversion.handlers} event ${conversion.handlers === 1 ? "handler or javascript: link" : "handlers or javascript: links"}` : "",
      ]
        .filter(Boolean)
        .join(" and ")}. The outputs do not include them.`
    : "";

  const inputBytes = byteLength(text);

  return (
    <ToolWorkspace
      id="svg-to-css"
      notice={
        error ? (
          <div className="workspace-notice" data-tone="error" role="alert">{error}</div>
        ) : warning || conversion?.notes.length ? (
          <div className="workspace-notice" role="status">
            {[warning, ...(conversion?.notes ?? [])].filter(Boolean).join(" ")}
          </div>
        ) : undefined
      }
      first={
        <EditorPane
          title="SVG"
          htmlFor="svg-to-css-input"
          scroll={false}
          actions={
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".svg,image/svg+xml"
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
              {input && <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button>}
            </>
          }
        >
          <CodeTextarea id="svg-to-css-input" wrap="off" placeholder={PLACEHOLDER} value={input} onChange={(e) => setInput(e.target.value)} />
        </EditorPane>
      }
      second={
        <EditorPane title="Data URI and CSS">
          {conversion ? (
            <div className="result-list" ref={listRef}>
              <div className="flex items-center gap-4 border-b border-border px-4 py-3">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-border bg-muted p-2">
                  <img src={conversion.miniDataUri} alt="Preview of the SVG" className="max-h-full max-w-full" />
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Input</dt>
                  <dd>{formatBytes(inputBytes)}</dd>
                  <dt className="text-muted-foreground">Optimized</dt>
                  <dd>{formatBytes(byteLength(conversion.svg))}</dd>
                  <dt className="text-muted-foreground">Size</dt>
                  <dd>{conversion.width && conversion.height ? `${conversion.width} × ${conversion.height}` : "Not set"}</dd>
                </dl>
              </div>
              {outputs.map(({ key, label, value }) => (
                <div key={key} className="result-row">
                  <label className="result-row-label" htmlFor={`svg-to-css-${key}`}>
                    {label}
                    <span className="block text-2xs font-normal">{formatBytes(byteLength(value))}</span>
                  </label>
                  <textarea
                    id={`svg-to-css-${key}`}
                    className="result-row-value code-textarea"
                    value={value}
                    readOnly
                    rows={1}
                    ref={fitHeight}
                  />
                  <CopyButton value={value} iconOnly label={`Copy ${label}`} />
                </div>
              ))}
            </div>
          ) : (
            <PaneEmpty
              icon={error ? <ImageOff size={20} aria-hidden="true" /> : undefined}
              title={error ? "Fix the SVG to see the outputs" : "Data URIs and CSS appear here"}
              hint={error ? undefined : "Paste SVG markup or open an .svg file."}
            />
          )}
        </EditorPane>
      }
      status={
        error ? (
          <span className="text-destructive">Invalid SVG</span>
        ) : conversion ? (
          <>
            <span>{formatBytes(inputBytes)} in</span>
            <span>{formatBytes(byteLength(conversion.miniDataUri))} URL-encoded</span>
            <span>{formatBytes(byteLength(conversion.base64DataUri))} Base64</span>
          </>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
