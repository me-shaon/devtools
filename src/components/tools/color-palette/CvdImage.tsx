import { useEffect, useRef, useState, type DragEvent } from "react";
import { FileUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { CVD_TYPES, cvdLabel, simulateCvdPixels, type CvdType } from "@/utils/color";
import { loadImageFile, validateImageFile } from "./image-file";

/** Pixels per chunk. The transform yields to the browser between chunks. */
const CHUNK_PIXELS = 200_000;
const SEVERITY_DEBOUNCE_MS = 150;

interface DisplayedImage {
  url: string;
  name: string;
}

/** Preview caption; the picker always names the type, and severity is stated separately. */
function previewLabel(type: CvdType, severityPercent: number) {
  if (severityPercent === 0) return "No simulation";
  return `${cvdLabel(type, severityPercent / 100)} (${severityPercent}%)`;
}

/** Local, bounded color-vision simulation of a user-selected image. */
export function CvdImage({ severity }: { severity: number }) {
  const [source, setSource] = useState<DisplayedImage | null>(null);
  const [basePixels, setBasePixels] = useState<ImageData | null>(null);
  const [type, setType] = useState<CvdType>("deutan");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadTokenRef = useRef(0);
  const debouncedSeverity = useDebouncedValue(severity, SEVERITY_DEBOUNCE_MS);

  // Release the previous object URL when the image is replaced, cleared, or unmounted.
  useEffect(() => {
    if (!source) return;
    return () => URL.revokeObjectURL(source.url);
  }, [source]);

  const open = async (file: File | undefined | null) => {
    if (!file) return;
    const validation = validateImageFile(file);
    if (validation) {
      setError(validation);
      return;
    }
    const token = ++loadTokenRef.current;
    try {
      const loaded = await loadImageFile(file);
      if (token !== loadTokenRef.current) {
        URL.revokeObjectURL(loaded.url);
        return;
      }
      setError("");
      setBusy(true);
      setBasePixels(loaded.pixels);
      setSource({ url: loaded.url, name: loaded.name });
    } catch (failure) {
      if (token === loadTokenRef.current) {
        setError(failure instanceof Error ? failure.message : "Cannot read this image.");
      }
    }
  };

  // Transform a copy of the pixels in chunks, so a large image does not freeze the UI.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!basePixels || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      setError("This system cannot draw the image.");
      return;
    }
    let cancelled = false;
    const data = new Uint8ClampedArray(basePixels.data);
    const total = data.length / 4;
    canvas.width = basePixels.width;
    canvas.height = basePixels.height;
    setBusy(true);
    let start = 0;
    const step = () => {
      if (cancelled) return;
      const end = Math.min(total, start + CHUNK_PIXELS);
      simulateCvdPixels(data, type, debouncedSeverity / 100, start, end);
      start = end;
      if (start < total) {
        setTimeout(step, 0);
        return;
      }
      ctx.putImageData(new ImageData(data, basePixels.width, basePixels.height), 0, 0);
      setBusy(false);
    };
    step();
    return () => {
      cancelled = true;
    };
  }, [basePixels, type, debouncedSeverity]);

  const clear = () => {
    loadTokenRef.current++;
    setSource(null);
    setBasePixels(null);
    setBusy(false);
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
    void open(event.dataTransfer.files[0]);
  };

  const preview = previewLabel(type, debouncedSeverity);

  return (
    <div
      className={`space-y-3 rounded-md border border-dashed p-3 ${dragging ? "bg-accent" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      data-testid="cvd-image"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            void open(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button type="button" className="toolbar-text-button" onClick={() => fileInputRef.current?.click()}>
          <FileUp size={14} aria-hidden="true" />
          Open image
        </button>
        <Label htmlFor="cvd-image-type" className="text-xs">
          Simulate
        </Label>
        <select
          id="cvd-image-type"
          value={type}
          onChange={(event) => setType(event.target.value as CvdType)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {CVD_TYPES.map((item) => (
            <option key={item} value={item}>
              {cvdLabel(item, 1)}
            </option>
          ))}
        </select>
        {source && (
          <button type="button" className="toolbar-text-button" onClick={clear}>
            Clear
          </button>
        )}
        {busy && <span className="text-xs text-muted-foreground">Simulating…</span>}
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {source ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <figure className="space-y-1">
            <img src={source.url} alt={`Original ${source.name}`} className="max-h-80 w-full rounded object-contain" />
            <figcaption className="text-xs text-muted-foreground">Normal vision</figcaption>
          </figure>
          <figure className="space-y-1">
            <canvas
              ref={canvasRef}
              className="max-h-80 w-full rounded object-contain"
              aria-label={`${source.name} as seen with ${preview}`}
            />
            <figcaption className="text-xs text-muted-foreground">{preview}</figcaption>
          </figure>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Drop a screenshot, chart, or design here to see it with a color vision deficiency. The image stays on this
          device; images up to 20 MB and 40 megapixels are supported.
        </p>
      )}
    </div>
  );
}
