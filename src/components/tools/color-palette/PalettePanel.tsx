import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/tools/CopyButton";
import {
  PALETTE_MODES,
  buildPalette,
  formatColor,
  paletteToCss,
  paletteToJson,
  toCssColor,
  type Color,
  type PaletteMode,
} from "@/utils/color";
import { swatchStyle } from "./shared";

const MODE_LABELS: Record<PaletteMode, string> = {
  tints: "Tints and shades",
  complementary: "Complementary",
  analogous: "Analogous",
  triadic: "Triadic",
  "split-complementary": "Split complementary",
  monochromatic: "Monochromatic",
};

interface PalettePanelProps {
  color: Color;
  mode: PaletteMode;
  onModeChange: (mode: PaletteMode) => void;
  onApply: (color: Color) => void;
  onUseForComparison: (colors: Color[]) => void;
}

/** Palette modes derived from the working color, with copyable code exports. */
export function PalettePanel({ color, mode, onModeChange, onApply, onUseForComparison }: PalettePanelProps) {
  const palette = useMemo(() => buildPalette(color, mode), [color, mode]);
  const cssExport = paletteToCss(palette);
  const jsonExport = paletteToJson(palette);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Palette</CardTitle>
        <CardDescription>Shades and harmonies generated from the working color</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="palette-mode">Palette mode</Label>
          <select
            id="palette-mode"
            value={mode}
            onChange={(event) => onModeChange(event.target.value as PaletteMode)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {PALETTE_MODES.map((item) => (
              <option key={item} value={item}>
                {MODE_LABELS[item]}
              </option>
            ))}
          </select>
        </div>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={`${MODE_LABELS[mode]} palette`}>
          {palette.map((swatch) => {
            const value = toCssColor(swatch);
            const hex = formatColor(swatch)[0].value;
            return (
              <li key={`${value}`}>
                <button
                  type="button"
                  onClick={() => onApply(swatch)}
                  aria-label={`Use ${value}`}
                  className="w-full space-y-1 rounded-md text-left"
                >
                  <span className="block h-14 w-full rounded-md border" style={swatchStyle(value)} aria-hidden="true" />
                  <code className="block truncate text-xs">{hex}</code>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap gap-2">
          <CopyButton value={cssExport} label="Copy CSS variables" />
          <CopyButton value={jsonExport} label="Copy JSON" />
          <Button type="button" variant="outline" size="sm" onClick={() => onUseForComparison(palette)}>
            Use palette colors for comparison
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Exports list every swatch above in order; alpha values are preserved.
        </p>
      </CardContent>
    </Card>
  );
}
