import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./CopyButton";
import { saveFile } from "@/lib/desktop";
import {
  cropFromPoints,
  drawEditedImage,
  type ImageEdits,
  type CropRect,
} from "@/utils/image-edit";
const FORMATS = [
  { type: "image/png", label: "PNG" },
  { type: "image/jpeg", label: "JPEG" },
  { type: "image/webp", label: "WebP" },
];
// WebKit, which the macOS app uses, cannot encode WebP. It returns PNG data instead.
const canEncode = (type: string) => {
  try {
    const url = document.createElement("canvas").toDataURL(type);
    return typeof url !== "string" || url.startsWith(`data:${type}`);
  } catch {
    return true;
  }
};
const initialEdits = (width: number, height: number): ImageEdits => ({
  crop: { x: 0, y: 0, width, height },
  width,
  height,
  rotation: 0,
  flipX: false,
  flipY: false,
});
export function ImageEditor() {
  const [source, setSource] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [edits, setEdits] = useState<ImageEdits | null>(null);
  const [locked, setLocked] = useState(true);
  const [percent, setPercent] = useState(100);
  // The size control the user set last. A crop change with the lock on keeps that value.
  const [sizeBy, setSizeBy] = useState<"percent" | "width" | "height">(
    "percent",
  );
  const [type, setType] = useState("image/png");
  const [formats] = useState(() => FORMATS.filter((f) => canEncode(f.type)));
  const [output, setOutput] = useState<{
    url: string;
    blob: Blob;
    width: number;
    height: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const anchor = useRef<{
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setImage(null);
    setEdits(null);
    setOutput(null);
    setError("");
    setBusy(true);
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.naturalWidth * img.naturalHeight > 32000000) {
        setError("Source images are limited to 32 megapixels.");
        setBusy(false);
        return;
      }
      setImage(img);
      setEdits(initialEdits(img.naturalWidth, img.naturalHeight));
      setPercent(100);
      setSizeBy("percent");
      setBusy(false);
    };
    img.onerror = () => {
      if (!cancelled) {
        setError("Could not read this image. Choose a PNG, JPG or WebP file.");
        setBusy(false);
      }
    };
    img.src = source.url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(source.url);
    };
  }, [source]);
  useEffect(() => {
    if (!image || !edits) return;
    let cancelled = false;
    let url: string | undefined;
    setOutput(null);
    setError("");
    setBusy(true);
    const timer = setTimeout(() => {
      try {
        const canvas = drawEditedImage(image, edits, type);
        canvas.toBlob(
          (blob) => {
            if (cancelled) return;
            setBusy(false);
            if (!blob) {
              setError("Could not export the image.");
              return;
            }
            if (blob.type !== type) {
              setError(
                "This browser cannot export the selected format. Choose PNG.",
              );
              return;
            }
            url = URL.createObjectURL(blob);
            setOutput({
              url,
              blob,
              width: canvas.width,
              height: canvas.height,
            });
          },
          type,
          0.92,
        );
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setBusy(false);
        }
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [image, edits, type]);
  const lockedSize = (crop: CropRect, e: ImageEdits) => {
    if (sizeBy === "width")
      return {
        width: e.width,
        height: Math.max(1, Math.round((e.width * crop.height) / crop.width)),
      };
    if (sizeBy === "height")
      return {
        width: Math.max(1, Math.round((e.height * crop.width) / crop.height)),
        height: e.height,
      };
    return {
      width: Math.round((crop.width * percent) / 100),
      height: Math.round((crop.height * percent) / 100),
    };
  };
  const setCrop = (crop: CropRect) => {
    if (!edits) return;
    if (!locked) return setEdits({ ...edits, crop });
    const size = lockedSize(crop, edits);
    if (sizeBy !== "percent" && crop.width > 0)
      setPercent(Math.round((size.width / crop.width) * 1000) / 10);
    setEdits({ ...edits, crop, ...size });
  };
  const point = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  const dimension = (key: "width" | "height", value: number) => {
    setSizeBy(key);
    // Show the scale that the typed size gives.
    if (edits && Number.isFinite(value) && edits.crop[key] > 0)
      setPercent(Math.round((value / edits.crop[key]) * 1000) / 10);
    setEdits((e) => {
      if (!e) return e;
      const other = key === "width" ? "height" : "width";
      return {
        ...e,
        [key]: value,
        ...(locked
          ? {
              [other]: Math.max(
                1,
                Math.round((value * e.crop[other]) / e.crop[key]),
              ),
            }
          : {}),
      };
    });
  };
  return (
    <section className="space-y-4" aria-label="Image editor">
      <label className="block text-sm font-medium">
        Open image
        <Input
          className="mt-2"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Image to edit"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (
              !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
              file.size > 32 * 1024 * 1024
            ) {
              setError("Choose a PNG, JPG or WebP file under 32 MiB.");
              return;
            }
            setSource({ url: URL.createObjectURL(file), name: file.name });
          }}
        />
      </label>
      {error && (
        <p role="alert" className="workspace-notice" data-tone="error">
          {error}
        </p>
      )}
      {image && edits && source && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Original · drag to crop</h3>
              <div
                className="relative w-fit max-w-full touch-none select-none"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  anchor.current = point(e);
                }}
                onPointerMove={(e) => {
                  if (anchor.current)
                    setCrop(
                      cropFromPoints(
                        anchor.current,
                        point(e),
                        image.naturalWidth,
                        image.naturalHeight,
                      ),
                    );
                }}
                onPointerUp={(e) => {
                  if (anchor.current)
                    setCrop(
                      cropFromPoints(
                        anchor.current,
                        point(e),
                        image.naturalWidth,
                        image.naturalHeight,
                      ),
                    );
                  anchor.current = null;
                }}
                onPointerCancel={() => {
                  anchor.current = null;
                }}
              >
                <img
                  src={source.url}
                  alt="Original image for cropping"
                  draggable={false}
                  className="max-h-96 max-w-full object-contain block"
                />
                <div
                  className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
                  style={{
                    left: `${(edits.crop.x / image.naturalWidth) * 100}%`,
                    top: `${(edits.crop.y / image.naturalHeight) * 100}%`,
                    width: `${(edits.crop.width / image.naturalWidth) * 100}%`,
                    height: `${(edits.crop.height / image.naturalHeight) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">
                Output {output && `· ${output.width} × ${output.height}`}
              </h3>
              {busy ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Updating preview…
                </p>
              ) : (
                output && (
                  <img
                    src={output.url}
                    alt="Edited image preview"
                    className="max-h-96 max-w-full object-contain rounded-md border"
                  />
                )
              )}
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Crop in original pixels
            </legend>
            <div className="flex flex-wrap gap-3">
              {(["x", "y", "width", "height"] as const).map((key) => (
                <label key={key} className="text-sm">
                  {key}
                  <Input
                    className="w-24"
                    type="number"
                    aria-label={`Crop ${key}`}
                    value={Number.isNaN(edits.crop[key]) ? "" : edits.crop[key]}
                    onChange={(e) =>
                      setCrop({ ...edits.crop, [key]: e.target.valueAsNumber })
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Resize before rotation
            </legend>
            <div className="flex flex-wrap gap-3 items-end">
              {(["width", "height"] as const).map((key) => (
                <label key={key} className="text-sm">
                  {key}
                  <Input
                    className="w-28"
                    type="number"
                    aria-label={`Output ${key}`}
                    value={Number.isNaN(edits[key]) ? "" : edits[key]}
                    onChange={(e) => dimension(key, e.target.valueAsNumber)}
                  />
                </label>
              ))}
              <label className="text-sm flex gap-2 items-center">
                <input
                  type="checkbox"
                  checked={locked}
                  onChange={(e) => setLocked(e.target.checked)}
                />
                Lock crop aspect ratio
              </label>
              <label className="text-sm">
                Scale crop %
                <Input
                  className="w-24"
                  type="number"
                  aria-label="Resize percent"
                  value={Number.isNaN(percent) ? "" : percent}
                  onChange={(e) => {
                    const p = e.target.valueAsNumber;
                    setPercent(p);
                    setSizeBy("percent");
                    setEdits({
                      ...edits,
                      width: Math.round((edits.crop.width * p) / 100),
                      height: Math.round((edits.crop.height * p) / 100),
                    });
                  }}
                />
              </label>
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setEdits({ ...edits, rotation: (edits.rotation + 270) % 360 })
              }
            >
              Rotate left
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setEdits({ ...edits, rotation: (edits.rotation + 90) % 360 })
              }
            >
              Rotate right
            </Button>
            <Button
              variant="outline"
              aria-pressed={edits.flipX}
              onClick={() => setEdits({ ...edits, flipX: !edits.flipX })}
            >
              Flip horizontal
            </Button>
            <Button
              variant="outline"
              aria-pressed={edits.flipY}
              onClick={() => setEdits({ ...edits, flipY: !edits.flipY })}
            >
              Flip vertical
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEdits(initialEdits(image.naturalWidth, image.naturalHeight));
                setPercent(100);
                setSizeBy("percent");
              }}
            >
              Reset edits
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Order: crop, resize, flip in source axes, then rotate. JPEG fills
            transparency with white.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <select
              className="rounded-md border bg-background py-2 pl-2 pr-7 text-sm"
              aria-label="Edited image format"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {formats.map((f) => (
                <option key={f.type} value={f.type}>
                  {f.label}
                </option>
              ))}
            </select>
            <Button
              disabled={!output || busy}
              onClick={async () => {
                if (!output) return;
                setError("");
                try {
                  await saveFile(
                    output.blob,
                    source.name.replace(/\.[^.]+$/, "") +
                      "-edited." +
                      type.split("/")[1],
                  );
                } catch {
                  setError("Could not save the image. Try again.");
                }
              }}
            >
              Save edited image
            </Button>
            <CopyButton
              value={output ? `${output.width} × ${output.height}` : ""}
              label="Copy dimensions"
            />
          </div>
        </>
      )}
      {!source && (
        <p className="text-sm text-muted-foreground">
          Resize, crop, rotate and flip an image locally. Use numeric crop
          controls or drag over the original preview.
        </p>
      )}
    </section>
  );
}
