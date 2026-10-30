import { parseColor, formatColor, rgbToHex } from "./color";
export interface GradientStop {
  id: number;
  color: string;
  position: number;
}
export function gradientCss(
  type: "linear" | "radial",
  angle: number,
  stops: GradientStop[],
): string {
  if (!Number.isFinite(angle)) throw new Error("Enter a valid angle.");
  if (stops.length < 2 || stops.length > 16)
    throw new Error("Use between 2 and 16 color stops.");
  const parts = [...stops]
    .sort((a, b) => a.position - b.position)
    .map((stop) => {
      const color = parseColor(stop.color);
      if (!color) throw new Error(`Invalid color: ${stop.color || "empty"}`);
      if (
        !Number.isFinite(stop.position) ||
        stop.position < 0 ||
        stop.position > 100
      )
        throw new Error("Stop positions must be between 0 and 100%.");
      return `${formatColor(color)[0].value} ${stop.position}%`;
    });
  return `${type}-gradient(${type === "linear" ? `${((angle % 360) + 360) % 360}deg` : "circle at center"}, ${parts.join(", ")})`;
}

/**
 * The gradient's color at a position, mixed in sRGB between the two stops that bracket it.
 * Seeds a stop added by clicking the preview bar. Outside the covered range it returns the
 * nearest stop's color, and unparseable or empty stops fall back to a neutral gray.
 */
export function colorAtPosition(stops: GradientStop[], position: number): string {
  const points = stops
    .map((stop) => ({ position: stop.position, rgb: parseColor(stop.color)?.rgb ?? null }))
    .filter((point): point is { position: number; rgb: { r: number; g: number; b: number } } =>
      point.rgb !== null && Number.isFinite(point.position),
    )
    .sort((a, b) => a.position - b.position);
  if (points.length === 0) return "#808080";
  const first = points[0];
  const last = points[points.length - 1];
  if (position <= first.position) return rgbToHex(first.rgb.r, first.rgb.g, first.rgb.b);
  if (position >= last.position) return rgbToHex(last.rgb.r, last.rgb.g, last.rgb.b);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (position >= a.position && position <= b.position) {
      const t = b.position === a.position ? 0 : (position - a.position) / (b.position - a.position);
      const channel = (x: number, y: number) => Math.round(x + (y - x) * t);
      return rgbToHex(channel(a.rgb.r, b.rgb.r), channel(a.rgb.g, b.rgb.g), channel(a.rgb.b, b.rgb.b));
    }
  }
  return rgbToHex(last.rgb.r, last.rgb.g, last.rgb.b);
}
