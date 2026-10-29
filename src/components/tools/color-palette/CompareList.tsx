import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  CONFUSION_THRESHOLD,
  MAX_COMPARE_COLORS,
  findConfusablePairs,
  parseColorList,
  toCssColor,
} from "@/utils/color";
import { DEFAULT_COMPARE, swatchStyle } from "./shared";
import { VISIONS, simulate, visionLabel } from "./vision";

interface CompareListProps {
  compareText: string;
  setCompareText: (value: string) => void;
  severity: number;
}

/** Bounded color list for pairwise simulation and confusable-pair warnings. */
export function CompareList({ compareText, setCompareText, severity }: CompareListProps) {
  const debouncedCompare = useDebouncedValue(compareText, 200);
  const list = parseColorList(debouncedCompare);
  const listColors = list.colors.map((item) => item.color);
  const conflicts = VISIONS.map((vision) => ({
    vision,
    pairs: findConfusablePairs(listColors.map((color) => simulate(color, vision, severity))),
  })).filter((entry) => entry.pairs.length > 0);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="cvd-compare">Colors to compare</Label>
        <Textarea
          id="cvd-compare"
          value={compareText}
          onChange={(event) => setCompareText(event.target.value)}
          className="min-h-[60px] font-mono text-xs"
          spellCheck={false}
          placeholder={DEFAULT_COMPARE}
        />
        <p className="text-xs text-muted-foreground">
          Enter chart, status, or brand colors. Separate them with commas, spaces, or new lines. Up to{" "}
          {MAX_COMPARE_COLORS} colors are simulated.
        </p>
        {list.invalid.length > 0 && (
          <p className="text-xs text-destructive" role="alert">
            Not a valid CSS color: {list.invalid.join(", ")}
          </p>
        )}
        {list.truncated > 0 && (
          <p className="text-xs text-muted-foreground" role="status">
            Only the first {MAX_COMPARE_COLORS} colors are simulated; {list.truncated} more were ignored.
          </p>
        )}
      </div>
      {listColors.length > 0 && (
        <div className="space-y-2" data-testid="cvd-palette">
          {VISIONS.map((vision) => (
            <div key={vision} className="grid grid-cols-[8.5rem,1fr] items-center gap-2">
              <span className="text-xs">{visionLabel(vision, severity)}</span>
              <div className="flex flex-wrap gap-1">
                {listColors.map((item, index) => {
                  const simulated = simulate(item, vision, severity);
                  return (
                    <span
                      key={index}
                      className="h-7 w-10 rounded border"
                      style={swatchStyle(toCssColor(simulated))}
                      title={`${list.colors[index].input} looks like ${simulated.hex}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {listColors.length > 1 &&
        (conflicts.length > 0 ? (
          <div role="alert" aria-label="Hard to tell apart">
            <ul className="space-y-1 text-xs text-destructive">
              {conflicts.flatMap(({ vision, pairs }) =>
                pairs.map((pair) => (
                  <li key={`${vision}-${pair.a}-${pair.b}`}>
                    {visionLabel(vision, severity)}: {list.colors[pair.a].input} and {list.colors[pair.b].input} look
                    alike (ΔE {pair.distance.toFixed(1)})
                  </li>
                )),
              )}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-success" role="status">
            Every pair stays distinct for every vision type (ΔE {CONFUSION_THRESHOLD} or more).
          </p>
        ))}
    </div>
  );
}
