import { toCssColor, type Color } from "@/utils/color";
import { swatchKey, swatchStyle } from "./shared";

interface RecentColorsProps {
  colors: Color[];
  onApply: (color: Color) => void;
}

/** One-click history of recently committed colors. Renders nothing before the first commit. */
export function RecentColors({ colors, onApply }: RecentColorsProps) {
  if (colors.length === 0) return null;

  return (
    <section className="space-y-2" aria-labelledby="recent-colors-label">
      <p id="recent-colors-label" className="text-xs font-medium text-muted-foreground">
        Recent colors
      </p>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => {
          const value = toCssColor(color);
          return (
            <button
              key={swatchKey(color)}
              type="button"
              onClick={() => onApply(color)}
              className="h-8 w-8 rounded-md border shadow-sm"
              style={swatchStyle(value)}
              aria-label={`Use recent color ${value}`}
              title={value}
            />
          );
        })}
      </div>
    </section>
  );
}
