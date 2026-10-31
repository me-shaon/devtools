import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { PaletteSettings } from "@/utils/image";

interface ImagePaletteControlsProps {
  id: string;
  value: PaletteSettings;
  onChange: (value: PaletteSettings) => void;
}

/** Palette reduction settings for the Image Converter: color count and dithering. */
export function ImagePaletteControls({ id, value, onChange }: ImagePaletteControlsProps) {
  const set = (patch: Partial<PaletteSettings>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor={`${id}-palette`}>Reduce palette</Label>
        <Switch id={`${id}-palette`} checked={value.enabled} onCheckedChange={(enabled) => set({ enabled })} />
      </div>
      {value.enabled ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Colors</Label>
              <span className="text-sm text-muted-foreground">{value.colors}</span>
            </div>
            <Slider
              aria-label="Colors"
              value={[value.colors]}
              onValueChange={([colors]) => set({ colors })}
              min={2}
              max={256}
              step={1}
            />
          </div>
          <label className="flex items-center justify-between gap-2 text-sm">
            Dithering
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={value.dither}
              onChange={(e) => set({ dither: e.target.checked })}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Fewer colors give much smaller PNG files for logos, icons, and screenshots.
          </p>
        </div>
      ) : null}
    </div>
  );
}
