import { memo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { gradientCss, type GradientStop } from "@/utils/gradient";
import { CopyButton } from "./CopyButton";
// Memoized because Color Palette keeps it mounted and renders it again on each color edit.
export const GradientBuilder = memo(function GradientBuilder() {
  const [type, setType] = useState<"linear" | "radial">("linear");
  const [angle, setAngle] = useState(90);
  const [stops, setStops] = useState<GradientStop[]>([
    { id: 0, color: "#2563eb", position: 0 },
    { id: 1, color: "#9333ea", position: 100 },
  ]);
  const nextId = useRef(2);
  const update = (id: number, patch: Partial<GradientStop>) =>
    setStops((s) =>
      s.map((stop) => (stop.id === id ? { ...stop, ...patch } : stop)),
    );
  let css = "",
    error = "";
  try {
    css = gradientCss(type, angle, stops);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <section className="space-y-4" aria-label="Gradient builder">
      <div className="flex flex-wrap gap-3 items-center">
        <label>
          Type{" "}
          <select
            className="rounded-md border bg-background px-2 pr-7 py-1 text-sm"
            aria-label="Gradient type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
          </select>
        </label>
        {type === "linear" && (
          <label className="flex items-center gap-2">
            Angle
            <Input
              className="w-24"
              type="number"
              aria-label="Gradient angle"
              value={Number.isNaN(angle) ? "" : angle}
              onChange={(e) => setAngle(e.target.valueAsNumber)}
            />
          </label>
        )}
      </div>
      <div
        className="rounded-lg border overflow-hidden"
        style={{
          backgroundImage: "repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%)",
          backgroundSize: "16px 16px",
        }}
      >
        <div
          className="h-48"
          aria-label="Gradient preview"
          style={{ backgroundImage: css || undefined }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Edit a position or drag its slider. Stops are sorted by position in the
        CSS output.
      </p>
      {stops.map((stop, i) => (
        <div key={stop.id} className="flex flex-wrap items-center gap-3">
          <label className="min-w-40 flex-1">
            Color {i + 1}
            <Input
              aria-label={`Stop ${i + 1} color`}
              value={stop.color}
              onChange={(e) => update(stop.id, { color: e.target.value })}
            />
          </label>
          <label>
            Position %
            <Input
              className="w-24"
              type="number"
              min={0}
              max={100}
              aria-label={`Stop ${i + 1} position`}
              value={Number.isNaN(stop.position) ? "" : stop.position}
              onChange={(e) =>
                update(stop.id, { position: e.target.valueAsNumber })
              }
            />
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            aria-label={`Move stop ${i + 1}`}
            value={Number.isFinite(stop.position) ? stop.position : 0}
            onChange={(e) =>
              update(stop.id, { position: Number(e.target.value) })
            }
          />
          <Button
            variant="outline"
            aria-label={`Remove stop ${i + 1}`}
            disabled={stops.length <= 2}
            onClick={() => setStops((s) => s.filter((x) => x.id !== stop.id))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={stops.length >= 16}
        onClick={() =>
          setStops((s) => [
            ...s,
            { id: nextId.current++, color: "#ffffff", position: 50 },
          ])
        }
      >
        Add stop
      </Button>
      {error ? (
        <p role="alert" className="workspace-notice" data-tone="error">
          {error}
        </p>
      ) : (
        <div className="rounded-md border p-3 space-y-2">
          <CopyButton value={`background: ${css};`} label="Copy CSS" />
          <pre className="text-sm font-mono whitespace-pre-wrap break-all">
            background: {css};
          </pre>
        </div>
      )}
    </section>
  );
});
