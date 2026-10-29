import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getContrastRatio, makeColor, toCssColor, type Color } from "@/utils/color";
import { CvdImage } from "./CvdImage";
import { CompareList } from "./CompareList";
import { formatRatio, swatchStyle } from "./shared";
import { VISIONS, simulate, visionLabel } from "./vision";

const WHITE = makeColor({ r: 255, g: 255, b: 255 });
const BLACK = makeColor({ r: 0, g: 0, b: 0 });

interface VisionPanelProps {
  color: Color;
  compareText: string;
  setCompareText: (value: string) => void;
}

/** Color-vision-deficiency simulation of the working color, a compare list, and an image. */
export function VisionPanel({ color, compareText, setCompareText }: VisionPanelProps) {
  const [severityPercent, setSeverityPercent] = useState(100);
  const severity = severityPercent / 100;
  // Pick the surface once from the original color, so a lower ratio in another row is caused by
  // the simulation rather than by swapping the background.
  const textSurface = getContrastRatio(WHITE, color) >= getContrastRatio(BLACK, color) ? WHITE : BLACK;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vision</CardTitle>
        <CardDescription>See colors as people with a color vision deficiency see them</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="cvd-severity">
            Severity: {severityPercent}%{severityPercent === 0 ? " (No simulation)" : severityPercent === 100 ? " (full)" : ""}
          </Label>
          <input
            id="cvd-severity"
            type="range"
            min={0}
            max={100}
            step={10}
            value={severityPercent}
            onChange={(event) => setSeverityPercent(parseInt(event.target.value, 10))}
            className="w-full accent-primary"
          />
          <p className="text-xs text-muted-foreground">
            0% applies no simulation. 100% shows the full forms (protanopia, deuteranopia, tritanopia, achromatopsia).
            Lower values show the milder anomaly forms.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Simulated colors">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Vision</th>
                <th className="py-2 pr-3 font-medium">Color (workspace)</th>
                <th className="py-2 pr-3 font-medium">Sample text</th>
                <th className="py-2 font-medium">Contrast</th>
              </tr>
            </thead>
            <tbody>
              {VISIONS.map((vision) => {
                const label = visionLabel(vision, severity);
                const sim = simulate(color, vision, severity);
                const ratio = getContrastRatio(sim, textSurface);
                const unchanged =
                  vision !== "normal" && severity > 0 && sim.hex === color.hex && sim.alpha === color.alpha;
                return (
                  <tr key={vision} className="border-t" data-testid={`cvd-row-${vision}`}>
                    <th scope="row" className="py-2 pr-3 text-left font-medium">
                      {label}
                    </th>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-6 w-10 shrink-0 rounded border"
                          style={swatchStyle(toCssColor(sim))}
                          aria-hidden="true"
                        />
                        <code className="text-xs">{sim.hex}</code>
                        {unchanged && <span className="text-xs text-muted-foreground">(unchanged)</span>}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <div
                        className="rounded border px-2 py-1"
                        style={{ backgroundColor: textSurface.hex, color: sim.hex }}
                      >
                        Sample text
                      </div>
                    </td>
                    <td className="py-2 whitespace-nowrap" data-testid={`cvd-contrast-${vision}`}>
                      <span className="font-mono">{formatRatio(ratio)}</span>{" "}
                      <span className={ratio >= 4.5 ? "text-success" : "text-destructive"}>
                        {ratio >= 4.5 ? "AA" : "Fails AA"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Sample text is the simulated color on black or white, whichever gives the original color more contrast, so
          each ratio shows how the simulation alone changes whether that text stays legible.
        </p>

        <CompareList compareText={compareText} setCompareText={setCompareText} severity={severity} />
        <CvdImage severity={severityPercent} />
      </CardContent>
    </Card>
  );
}
