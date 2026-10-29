import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/tools/CopyButton";
import type { ColorStudio } from "@/hooks/useColorStudio";
import { formatColor, parseColor, toCssColor, type Color } from "@/utils/color";
import { AlphaControl, ChannelField } from "./ColorControls";
import { RecentColors } from "./RecentColors";
import { swatchStyle } from "./shared";

interface ColorWorkspaceProps {
  studio: ColorStudio;
  recents: Color[];
  onApplyRecent: (color: Color) => void;
}

/** Primary editor: the working color, its editable drafts, copyable formats, and history. */
export function ColorWorkspace({ studio, recents, onApplyRecent }: ColorWorkspaceProps) {
  const { color, drafts, invalid } = studio;
  const values = formatColor(color);
  const commit = studio.commit;

  const pick = (hex: string) => {
    // The native picker has no alpha channel. Keep a translucent color's alpha,
    // but not a fully transparent one, where the picked color would stay invisible.
    const alphaByte = Math.round(color.alpha * 255);
    const suffix = alphaByte > 0 && alphaByte < 255 ? alphaByte.toString(16).padStart(2, "0") : "";
    const next = parseColor(`${hex}${suffix}`);
    if (next) studio.applyColor(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Color</CardTitle>
        <CardDescription>Pick, type, or adjust the working color</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="color-convert-input">Color</Label>
          <div className="flex gap-2">
            <Input
              id="color-convert-input"
              placeholder="#3b82f6, rgb(59 130 246 / 50%), oklch(62% 0.19 260), tomato"
              value={drafts.hex}
              onChange={(event) => studio.setHexDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                }
              }}
              className="font-mono"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={invalid.hex}
              aria-describedby={invalid.hex ? "color-convert-error" : undefined}
            />
            <input
              type="color"
              aria-label="Pick a color"
              value={color.hex}
              onChange={(event) => pick(event.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
            />
          </div>
          {invalid.hex && (
            <p id="color-convert-error" className="text-xs text-destructive" role="alert">
              Not a valid CSS color.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(7rem,1fr)_minmax(0,2fr)]">
          <div
            className="h-32 w-full rounded-md border"
            style={swatchStyle(toCssColor(color))}
            role="img"
            aria-label="Color preview"
            data-testid="color-preview"
          />
          <div className="space-y-2">
          <AlphaControl
            value={drafts.alpha}
            invalid={invalid.alpha}
            onDraft={studio.setAlphaDraft}
            onSlider={studio.setAlphaPercent}
            onCommit={commit}
          />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">RGB</legend>
            <div className="grid grid-cols-3 gap-2">
              <ChannelField id="color-r" label="Red" value={drafts.rgb.r} invalid={invalid.rgb} onChange={(v) => studio.setRgbDraft("r", v)} onCommit={commit} />
              <ChannelField id="color-g" label="Green" value={drafts.rgb.g} invalid={invalid.rgb} onChange={(v) => studio.setRgbDraft("g", v)} onCommit={commit} />
              <ChannelField id="color-b" label="Blue" value={drafts.rgb.b} invalid={invalid.rgb} onChange={(v) => studio.setRgbDraft("b", v)} onCommit={commit} />
            </div>
            {invalid.rgb && (
              <p id="color-rgb-error" className="text-xs text-destructive" role="alert">
                Use whole numbers from 0 to 255.
              </p>
            )}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">HSL</legend>
            <div className="grid grid-cols-3 gap-2">
              <ChannelField id="color-h" label="Hue" value={drafts.hsl.h} invalid={invalid.hsl} onChange={(v) => studio.setHslDraft("h", v)} onCommit={commit} />
              <ChannelField id="color-s" label="Saturation" value={drafts.hsl.s} invalid={invalid.hsl} onChange={(v) => studio.setHslDraft("s", v)} onCommit={commit} />
              <ChannelField id="color-l" label="Lightness" value={drafts.hsl.l} invalid={invalid.hsl} onChange={(v) => studio.setHslDraft("l", v)} onCommit={commit} />
            </div>
            {invalid.hsl && (
              <p id="color-hsl-error" className="text-xs text-destructive" role="alert">
                Use hue 0 to 360 and saturation and lightness 0 to 100.
              </p>
            )}
          </fieldset>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {values.map((item) => (
            <div key={item.label} className="space-y-1">
              <span className="block text-xs text-muted-foreground">{item.label}</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted p-2 text-xs">{item.value}</code>
                <CopyButton value={item.value} label={`Copy ${item.label}`} iconOnly />
              </div>
            </div>
          ))}
        </div>

        <RecentColors colors={recents} onApply={onApplyRecent} />
      </CardContent>
    </Card>
  );
}
