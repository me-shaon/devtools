import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, Moon, RotateCw, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { buildPreviewDocument, previewSandbox } from "@/utils/html-preview";

type Canvas = "light" | "dark";

/** A frame size in CSS pixels. A null side fills the pane. */
interface FrameSize {
  width: number | null;
  height: number | null;
}

interface Device {
  id: string;
  label: string;
  width: number;
  height: number;
}

/** CSS viewport sizes in portrait. */
const DEVICE_GROUPS: { label: string; devices: Device[] }[] = [
  {
    label: "Mobile",
    devices: [
      { id: "iphone-se", label: "iPhone SE", width: 375, height: 667 },
      { id: "iphone-16", label: "iPhone 16", width: 393, height: 852 },
      { id: "iphone-16-pro-max", label: "iPhone 16 Pro Max", width: 440, height: 956 },
      { id: "pixel-9", label: "Pixel 9", width: 412, height: 923 },
      { id: "galaxy-s24", label: "Galaxy S24", width: 360, height: 780 },
    ],
  },
  {
    label: "Tablet",
    devices: [
      { id: "ipad-mini", label: "iPad Mini", width: 768, height: 1024 },
      { id: "ipad-air", label: "iPad Air", width: 820, height: 1180 },
      { id: "ipad-pro-13", label: "iPad Pro 13", width: 1032, height: 1376 },
    ],
  },
  {
    label: "Desktop",
    devices: [
      { id: "laptop", label: "Laptop", width: 1280, height: 800 },
      { id: "desktop", label: "Desktop", width: 1440, height: 900 },
      { id: "full-hd", label: "Full HD", width: 1920, height: 1080 },
    ],
  },
];

const DEVICES = DEVICE_GROUPS.flatMap((group) => group.devices);

const ZOOMS = [50, 75, 100, 125, 150, 200];

/** The size limits for the width and height fields and the frame handle. */
const MIN_SIZE = 200;
const MAX_SIZE = 3840;

const clampSize = (value: number) => Math.round(Math.max(MIN_SIZE, Math.min(value, MAX_SIZE)));

/** The device that has this size in either orientation, if any. */
const matchDevice = ({ width, height }: FrameSize) =>
  DEVICES.find((d) => (d.width === width && d.height === height) || (d.width === height && d.height === width));

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Why do remote images, fonts, and stylesheets not show?",
    a: "The preview blocks all network requests with a Content-Security-Policy, so the tool stays offline. Inline styles, `<style>` elements, and `data:` images work.",
  },
  {
    q: "Is it safe to turn on scripts?",
    a: "Scripts run in a sandboxed frame with its own origin. They cannot read the app, its storage, or your files, and they cannot open windows or submit forms. They can still use the CPU, so stop a script that hangs by turning scripts off.",
  },
  {
    q: "Why do links not open?",
    a: "Links would load remote pages. The preview removes link targets and blocks new windows, so a click does nothing.",
  },
  {
    q: "How do I test a size that is not in the device list?",
    a: "Type a width and a height above the preview, or drag the handle on the right edge of the frame. With the handle focused, the arrow keys change the width by 10 px, or by 50 px with Shift. Clear a field to make that side fill the pane.",
  },
  {
    q: "Why does a desktop size look small?",
    a: "Fit to pane scales the frame down until it fits, so the page keeps its real CSS width. Pick 100% to see it at full size and scroll the pane.",
  },
  {
    q: "Does the preview match a real browser?",
    a: "It uses the same engine that runs this app. Fonts that are not installed on this device fall back to system fonts.",
  },
];

const PLACEHOLDER = '<style>\n  h1 { font-family: system-ui; color: teal; }\n</style>\n<h1>Hello</h1>\n<p>Edit the HTML to update the preview.</p>';

interface DeviceBarProps {
  size: FrameSize;
  zoom: number | null;
  onSize: (size: FrameSize) => void;
  onZoom: (zoom: number | null) => void;
}

/** Device, size, rotation, and zoom controls for the preview frame. */
function DeviceBar({ size, zoom, onSize, onZoom }: DeviceBarProps) {
  const device = matchDevice(size);
  const responsive = size.width === null && size.height === null;
  const sizeField = (side: keyof FrameSize, label: string) => (
    <input
      type="number"
      aria-label={label}
      min={MIN_SIZE}
      max={MAX_SIZE}
      placeholder="Auto"
      value={size[side] ?? ""}
      onChange={(e) => onSize({ ...size, [side]: e.target.value === "" ? null : Math.min(Number(e.target.value), MAX_SIZE) })}
      onBlur={() => size[side] !== null && onSize({ ...size, [side]: clampSize(size[side]) })}
    />
  );

  return (
    <div className="html-preview-devicebar">
      <select
        aria-label="Device"
        value={device?.id ?? (responsive ? "responsive" : "custom")}
        onChange={(e) => {
          const next = DEVICES.find((d) => d.id === e.target.value);
          onSize(next ? { width: next.width, height: next.height } : { width: null, height: null });
        }}
      >
        <option value="responsive">Responsive</option>
        {!device && !responsive && <option value="custom">Custom</option>}
        {DEVICE_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.devices.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {sizeField("width", "Width")}
      <span aria-hidden="true">×</span>
      {sizeField("height", "Height")}
      <button
        type="button"
        className="toolbar-text-button"
        aria-label="Rotate"
        title="Swap width and height"
        disabled={size.width === null || size.height === null}
        onClick={() => onSize({ width: size.height, height: size.width })}
      >
        <RotateCw size={14} aria-hidden="true" />
      </button>
      <select aria-label="Zoom" value={zoom ?? "fit"} onChange={(e) => onZoom(e.target.value === "fit" ? null : Number(e.target.value))}>
        <option value="fit">Fit to pane</option>
        {ZOOMS.map((z) => (
          <option key={z} value={z}>{z}%</option>
        ))}
      </select>
    </div>
  );
}

export function HtmlPreview() {
  const [input, setInput] = useState("");
  const [scripts, setScripts] = useState(false);
  const [size, setSize] = useState<FrameSize>({ width: null, height: null });
  const [zoom, setZoom] = useState<number | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [canvas, setCanvas] = useState<Canvas>("light");
  const [fullScreen, setFullScreen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, width: 0 });
  const html = useDebouncedValue(input, 300);

  const srcDoc = useMemo(
    () => (html.trim() ? buildPreviewDocument(html, { scripts, dark: canvas === "dark" }) : ""),
    [html, scripts, canvas],
  );

  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setFullScreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullScreen]);

  // The stage is remounted when full screen opens or closes, so measure whichever one is shown
  const hasPreview = Boolean(srcDoc);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setStageSize({ width: stage.clientWidth, height: stage.clientHeight }));
    observer.observe(stage);
    return () => observer.disconnect();
  }, [hasPreview, fullScreen]);

  const { width, height } = size;
  // Fit to pane scales a fixed size down to the space beside the handle and inside the padding
  const fitScale = Math.min(
    1,
    width && stageSize.width ? (stageSize.width - 12 - 24) / width : 1,
    height && stageSize.height ? (stageSize.height - 24) / height : 1,
  );
  const scale = zoom ? zoom / 100 : Math.max(fitScale, 0.1);

  // The frame's CSS width, measured when it fills the pane
  const currentWidth = () => width ?? (frameRef.current?.getBoundingClientRect().width ?? MIN_SIZE) / scale;

  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, width: currentWidth() };
    setDragging(true);
  };

  const drag = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    // The frame is centered, so each edge moves by half of the change
    setSize({ width: clampSize(dragStart.current.width + ((e.clientX - dragStart.current.x) * 2) / scale), height });
  };

  const resizeWithKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 50 : 10;
    if (e.key === "ArrowLeft") setSize({ width: clampSize(currentWidth() - step), height });
    else if (e.key === "ArrowRight") setSize({ width: clampSize(currentWidth() + step), height });
    else return;
    e.preventDefault();
  };

  const stage = srcDoc ? (
    <div ref={stageRef} className="html-preview-stage" data-fixed-height={height ? true : undefined}>
      {/* The box takes the scaled size, and the frame inside keeps the CSS size */}
      <div
        ref={frameRef}
        className="html-preview-frame"
        style={{
          width: width ? `${width * scale}px` : undefined,
          height: height ? `${height * scale}px` : undefined,
          flex: width ? "none" : 1,
        }}
      >
        <iframe
          // A new frame applies the sandbox flags when scripts are turned on or off
          key={scripts ? "scripts" : "static"}
          title="HTML preview"
          sandbox={previewSandbox(scripts)}
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
          className="bg-background"
          style={{
            width: width ? `${width}px` : `${100 / scale}%`,
            height: height ? `${height}px` : `${100 / scale}%`,
            transform: scale === 1 ? undefined : `scale(${scale})`,
            pointerEvents: dragging ? "none" : undefined,
          }}
        />
      </div>
      <div
        className="html-preview-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Preview width"
        aria-valuenow={width ?? undefined}
        aria-valuemin={MIN_SIZE}
        aria-valuemax={MAX_SIZE}
        tabIndex={0}
        data-active={dragging || undefined}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => setSize({ width: null, height: null })}
        onKeyDown={resizeWithKeys}
        title="Drag to resize. Double-click to fill the pane."
      />
    </div>
  ) : (
    <PaneEmpty title="The preview appears here" hint="Type or paste HTML on the left." />
  );

  const sizeLabel = width || height ? `${width ?? "Auto"} × ${height ?? "Auto"}` : "Fills the pane";
  const deviceBar = <DeviceBar size={size} zoom={zoom} onSize={setSize} onZoom={setZoom} />;

  return (
    <ToolWorkspace
      id="html-preview"
      toolbar={
        <>
          <div className="layout-switch" role="group" aria-label="Preview background">
            <button type="button" aria-pressed={canvas === "light"} onClick={() => setCanvas("light")}>
              <Sun size={14} aria-hidden="true" />
              Light
            </button>
            <button type="button" aria-pressed={canvas === "dark"} onClick={() => setCanvas("dark")}>
              <Moon size={14} aria-hidden="true" />
              Dark
            </button>
          </div>
          <label className="option-switch indent-control" htmlFor="html-preview-scripts">
            Run scripts
            <Switch id="html-preview-scripts" checked={scripts} onCheckedChange={setScripts} aria-describedby="html-preview-isolation" />
          </label>
        </>
      }
      notice={
        <p className="workspace-notice text-muted-foreground" id="html-preview-isolation">
          {scripts
            ? "Scripts run in an isolated frame. They cannot reach the app or your files. "
            : "Scripts are off. "}
          Remote images and scripts do not load, so the preview stays offline.
        </p>
      }
      first={
        <EditorPane
          title="HTML"
          htmlFor="html-preview-input"
          scroll={false}
          actions={input ? <button type="button" className="toolbar-text-button" onClick={() => setInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea id="html-preview-input" wrap="off" placeholder={PLACEHOLDER} value={input} onChange={(e) => setInput(e.target.value)} />
        </EditorPane>
      }
      second={
        <EditorPane
          title="Preview"
          scroll={false}
          actions={
            <button type="button" className="toolbar-text-button" onClick={() => setFullScreen(true)} disabled={!srcDoc}>
              <Maximize2 size={13} aria-hidden="true" />
              Full screen
            </button>
          }
        >
          {srcDoc && !fullScreen && deviceBar}
          {fullScreen ? <PaneEmpty title="The preview is in full screen" hint="Press Esc to return." /> : stage}
          {fullScreen &&
            createPortal(
              <div className="html-preview-full" role="dialog" aria-modal="true" aria-label="HTML preview, full screen">
                <div className="editor-toolbar">
                  <div className="toolbar-actions ml-auto">{deviceBar}</div>
                  <button type="button" className="toolbar-text-button" onClick={() => setFullScreen(false)} autoFocus>
                    <Minimize2 size={13} aria-hidden="true" />
                    Exit full screen
                  </button>
                </div>
                {stage}
              </div>,
              document.body,
            )}
        </EditorPane>
      }
      status={
        <>
          <span>{sizeLabel}</span>
          <span>{Math.round(scale * 100)}%</span>
          <span>{scripts ? "Scripts on" : "Scripts off"}</span>
          <span>Network blocked</span>
        </>
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
