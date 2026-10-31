import { memo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  colorAtPosition,
  gradientCss,
  type GradientStop,
} from "@/utils/gradient";
import { makeColor, parseColor, toHexWithAlpha } from "@/utils/color";
import { CopyButton } from "./CopyButton";
import { GradientBar } from "./GradientBar";

type Preset = {
  name: string;
  type: "linear" | "radial";
  angle: number;
  stops: { color: string; position: number }[];
};

const PRESET_DEFS: Preset[] = [
  {
    name: "Sunset",
    type: "linear",
    angle: 45,
    stops: [
      { color: "#f12711", position: 0 },
      { color: "#f5af19", position: 100 },
    ],
  },
  {
    name: "Ocean",
    type: "linear",
    angle: 120,
    stops: [
      { color: "#00c6ff", position: 0 },
      { color: "#0072ff", position: 100 },
    ],
  },
  {
    name: "Navy",
    type: "linear",
    angle: 135,
    stops: [
      { color: "#4b6cb7", position: 0 },
      { color: "#182848", position: 100 },
    ],
  },
  {
    name: "Candy",
    type: "linear",
    angle: 90,
    stops: [
      { color: "#fc466b", position: 0 },
      { color: "#3f5efb", position: 100 },
    ],
  },
  {
    name: "Mint",
    type: "radial",
    angle: 0,
    stops: [
      { color: "#a8ff78", position: 0 },
      { color: "#78ffd6", position: 100 },
    ],
  },
  {
    name: "Fire",
    type: "linear",
    angle: 90,
    stops: [
      { color: "#f83600", position: 0 },
      { color: "#f9d423", position: 50 },
      { color: "#f83600", position: 100 },
    ],
  },
];

// Render each preset once as CSS so the swatch and the applied gradient stay in sync.
const PRESETS = PRESET_DEFS.map((preset) => ({
  ...preset,
  css: gradientCss(
    preset.type,
    preset.angle,
    preset.stops.map((stop, i) => ({ id: i, ...stop })),
  ),
}));

/** The most stops a gradient can have, from the Add stop button or the preview bar. */
const MAX_STOPS = 16;

// Memoized because Color Palette keeps it mounted and renders it again on each color edit.
export const GradientBuilder = memo(function GradientBuilder() {
  const [type, setType] = useState<"linear" | "radial">("linear");
  const [angle, setAngle] = useState(90);
  const [stops, setStops] = useState<GradientStop[]>([
    { id: 0, color: "#2563eb", position: 0 },
    { id: 1, color: "#9333ea", position: 100 },
  ]);
  const [selectedId, setSelectedId] = useState<number | null>(1);
  const nextId = useRef(2);

  const update = (id: number, patch: Partial<GradientStop>) =>
    setStops((s) =>
      s.map((stop) => (stop.id === id ? { ...stop, ...patch } : stop)),
    );
  const addStop = (position: number): number | null => {
    if (stops.length >= MAX_STOPS) return null;
    const id = nextId.current++;
    setStops((s) => [...s, { id, color: colorAtPosition(s, position), position }]);
    setSelectedId(id);
    return id;
  };
  const removeStop = (id: number) => {
    setStops((s) => s.filter((stop) => stop.id !== id));
    setSelectedId((sel) => (sel === id ? null : sel));
  };
  // The native picker can only express opaque colors, so carry the stop's existing alpha across.
  // A fully transparent stop becomes opaque, or the picked color would stay invisible.
  const pickColor = (stop: GradientStop, hex: string) => {
    const picked = parseColor(hex);
    if (!picked) return;
    const alpha = parseColor(stop.color)?.alpha || 1;
    update(stop.id, { color: toHexWithAlpha(makeColor(picked.rgb, alpha)) });
  };
  const applyPreset = (preset: Preset) => {
    const withIds = preset.stops.map((stop) => ({
      id: nextId.current++,
      ...stop,
    }));
    setType(preset.type);
    setAngle(preset.angle);
    setStops(withIds);
    setSelectedId(withIds[0].id);
  };

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
      <div className="flex flex-wrap gap-2" role="group" aria-label="Gradient presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            aria-label={`Apply ${preset.name} gradient`}
            className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm hover:bg-accent"
            onClick={() => applyPreset(preset)}
          >
            <span
              className="h-5 w-8 rounded border"
              style={{ backgroundImage: preset.css }}
              aria-hidden="true"
            />
            {preset.name}
          </button>
        ))}
      </div>
      <GradientBar
        stops={stops}
        css={css}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onAdd={addStop}
        onMove={(id, position) => update(id, { position })}
        onRemove={removeStop}
      />
      <p className="text-sm text-muted-foreground">
        Click the preview to add a stop, and drag a handle to move it. A
        focused handle moves with the arrow keys, and Delete removes it. Stops
        are sorted by position in the CSS output.
      </p>
      {stops.map((stop, i) => (
        <div key={stop.id} className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            aria-label={`Pick color for stop ${i + 1}`}
            className="h-9 w-9 cursor-pointer rounded border bg-transparent p-1"
            value={parseColor(stop.color)?.hex ?? "#000000"}
            onChange={(e) => pickColor(stop, e.target.value)}
            onFocus={() => setSelectedId(stop.id)}
          />
          <label className="min-w-40 flex-1">
            Color {i + 1}
            <Input
              className="font-mono"
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
          <Button
            variant="outline"
            aria-label={`Remove stop ${i + 1}`}
            disabled={stops.length <= 2}
            onClick={() => removeStop(stop.id)}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={stops.length >= MAX_STOPS}
        onClick={() => addStop(50)}
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
