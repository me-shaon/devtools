import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  WCAG_TARGETS,
  analyzeContrast,
  parseColor,
  suggestContrastColor,
  toCssColor,
  type Color,
  type ContrastTarget,
} from "@/utils/color";
import { formatRatio, swatchStyle } from "./shared";

interface ContrastPanelProps {
  fg: string;
  bg: string;
  setFg: (value: string) => void;
  setBg: (value: string) => void;
  workingColor: Color;
  /** Records an applied suggestion in the recent-colors history. */
  onApplySuggested?: (color: Color) => void;
}

const targetLabel = (target: ContrastTarget) =>
  WCAG_TARGETS.find((entry) => entry.id === target)?.label ?? "the selected target";

/** WCAG contrast for a user-controlled pair, with actionable suggestions when it fails. */
export function ContrastPanel({
  fg,
  bg,
  setFg,
  setBg,
  workingColor,
  onApplySuggested,
}: ContrastPanelProps) {
  const [target, setTarget] = useState<ContrastTarget>("aa-normal");
  const fgInput = parseColor(fg);
  const bgInput = parseColor(bg);
  const analysis = fgInput && bgInput ? analyzeContrast(fgInput, bgInput) : null;
  const suggestion =
    analysis && fgInput && bgInput ? suggestContrastColor(fgInput, bgInput, target) : null;
  const workingCss = toCssColor(workingColor);

  const swap = () => {
    setFg(bg);
    setBg(fg);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contrast</CardTitle>
        <CardDescription>Check text and background colors against WCAG 2.x</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contrast-fg">Foreground</Label>
            <Input
              id="contrast-fg"
              value={fg}
              onChange={(event) => setFg(event.target.value)}
              className="font-mono"
              aria-invalid={fg.trim() !== "" && !fgInput}
              aria-describedby={fg.trim() && !fgInput ? "contrast-fg-error" : undefined}
            />
            {fg.trim() && !fgInput && (
              <p id="contrast-fg-error" className="text-xs text-destructive" role="alert">
                Invalid color.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="contrast-bg">Background</Label>
            <Input
              id="contrast-bg"
              value={bg}
              onChange={(event) => setBg(event.target.value)}
              className="font-mono"
              aria-invalid={bg.trim() !== "" && !bgInput}
              aria-describedby={bg.trim() && !bgInput ? "contrast-bg-error" : undefined}
            />
            {bg.trim() && !bgInput && (
              <p id="contrast-bg-error" className="text-xs text-destructive" role="alert">
                Invalid color.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={swap}>
            Swap
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setFg(workingCss)}>
            Use working color as foreground
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setBg(workingCss)}>
            Use working color as background
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="contrast-target">WCAG target</Label>
          <select
            id="contrast-target"
            value={target}
            onChange={(event) => setTarget(event.target.value as ContrastTarget)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {WCAG_TARGETS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label.replace(" text", "")}
              </option>
            ))}
          </select>
        </div>

        {analysis && (
          <div className="space-y-4">
            <div
              className="rounded-md border p-4"
              style={{ backgroundColor: analysis.background.hex, color: analysis.foreground.hex }}
              data-testid="contrast-preview"
            >
              <p className="text-2xl font-bold">Large sample text</p>
              <p className="text-sm">Normal sample text for reading.</p>
            </div>
            {analysis.transparencyDisclosed && (
              <p className="text-xs text-muted-foreground" role="status">
                The check blends the foreground over the background and treats the background as opaque.
              </p>
            )}
            <div className="text-3xl font-semibold" data-testid="contrast-ratio">
              {formatRatio(analysis.ratio)}
            </div>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {analysis.checks.map((check) => (
                <li key={check.target} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span>{targetLabel(check.target)}</span>
                  <span className={check.pass ? "font-medium text-success" : "font-medium text-destructive"}>
                    {check.pass ? "Pass" : "Fail"}
                  </span>
                </li>
              ))}
            </ul>

            {suggestion?.status === "pass" && (
              <p className="text-sm text-success" role="status">
                This pair meets {targetLabel(target)}.
              </p>
            )}
            {suggestion?.status === "suggested" && (
              <div className="space-y-2 rounded-md border p-3" data-testid="contrast-suggestion">
                <p className="text-sm">
                  Suggested {suggestion.side} reaches {formatRatio(suggestion.ratio)} for {targetLabel(target)}.
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className="h-6 w-10 shrink-0 rounded border"
                    style={swatchStyle(toCssColor(suggestion.color))}
                    aria-hidden="true"
                  />
                  <code className="text-xs">{toCssColor(suggestion.color)}</code>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const value = toCssColor(suggestion.color);
                      if (suggestion.side === "foreground") setFg(value);
                      else setBg(value);
                      onApplySuggested?.(suggestion.color);
                    }}
                  >
                    Apply suggested {suggestion.side}
                  </Button>
                </div>
              </div>
            )}
            {suggestion?.status === "impossible" && (
              <p className="text-sm text-destructive" role="status">
                No foreground or background lightness change can meet {targetLabel(target)} for this pair.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
