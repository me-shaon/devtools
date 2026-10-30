import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MAX_RESIZE_SIDE, RESIZE_METHODS, RESIZE_PRESETS, type ResizeSettings } from "@/utils/image";
import type { ResizeMethod } from "@/utils/image-process";

interface ImageResizeControlsProps {
  id: string;
  value: ResizeSettings;
  onChange: (value: ResizeSettings) => void;
  /** The size of the single image. Without it, only the percent presets show (bulk mode). */
  source?: { width: number; height: number } | null;
}

const CUSTOM = "custom";

/** Resize settings for the Image Converter: method, preset, size, and the pixel options. */
export function ImageResizeControls({ id, value, onChange, source }: ImageResizeControlsProps) {
  const set = (patch: Partial<ResizeSettings>) => onChange({ ...value, ...patch });
  const custom = Boolean(source) && value.width !== null && value.height !== null;
  const shownWidth = custom ? value.width! : source ? Math.round((source.width * value.percent) / 100) : 0;
  const shownHeight = custom ? value.height! : source ? Math.round((source.height * value.percent) / 100) : 0;

  const setSide = (side: "width" | "height", text: string) => {
    // An empty field is a half-typed value. Keep the last size until a number arrives.
    if (!source || text.trim() === "") return;
    const size = Math.min(MAX_RESIZE_SIDE, Math.max(1, Math.round(Number(text) || 1)));
    const ratio = source.width / source.height;
    if (side === "width") {
      set({ width: size, height: value.keepAspect ? Math.max(1, Math.round(size / ratio)) : shownHeight });
    } else {
      set({ height: size, width: value.keepAspect ? Math.max(1, Math.round(size * ratio)) : shownWidth });
    }
  };

  const checkbox = (key: "premultiply" | "linearRgb" | "keepAspect", label: string) => (
    <label className="flex items-center justify-between gap-2 text-sm">
      {label}
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={value[key]}
        onChange={(e) =>
          key === "keepAspect" && e.target.checked && source && custom
            ? set({ keepAspect: true, height: Math.max(1, Math.round((value.width! * source.height) / source.width)) })
            : set({ [key]: e.target.checked })
        }
      />
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor={`${id}-resize`}>Resize</Label>
        <Switch id={`${id}-resize`} checked={value.enabled} onCheckedChange={(enabled) => set({ enabled })} />
      </div>
      {value.enabled ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={value.method} onValueChange={(method) => set({ method: method as ResizeMethod })}>
              <SelectTrigger aria-label="Resize method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESIZE_METHODS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Preset</Label>
            <Select
              value={custom ? CUSTOM : String(value.percent)}
              onValueChange={(preset) => {
                if (preset !== CUSTOM) set({ percent: Number(preset), width: null, height: null });
              }}
            >
              <SelectTrigger aria-label="Resize preset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESIZE_PRESETS.map((percent) => (
                  <SelectItem key={percent} value={String(percent)}>
                    {percent}%
                  </SelectItem>
                ))}
                {custom ? <SelectItem value={CUSTOM}>Custom size</SelectItem> : null}
              </SelectContent>
            </Select>
          </div>
          {source ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-width`}>Width</Label>
                <Input
                  id={`${id}-width`}
                  type="number"
                  min={1}
                  max={MAX_RESIZE_SIDE}
                  value={shownWidth}
                  onChange={(e) => setSide("width", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-height`}>Height</Label>
                <Input
                  id={`${id}-height`}
                  type="number"
                  min={1}
                  max={MAX_RESIZE_SIDE}
                  value={shownHeight}
                  onChange={(e) => setSide("height", e.target.value)}
                />
              </div>
            </div>
          ) : null}
          {source ? checkbox("keepAspect", "Maintain aspect ratio") : null}
          {checkbox("premultiply", "Premultiply alpha channel")}
          {checkbox("linearRgb", "Linear RGB")}
        </div>
      ) : null}
    </div>
  );
}
