import { parseColor, formatColor, makeColor, toHexWithAlpha, type Color } from "./color";
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
 * Alpha is mixed too. Seeds a stop added by clicking the preview bar. Outside the covered range
 * it returns the nearest stop's color, and unparseable or empty stops fall back to a neutral gray.
 */
export function colorAtPosition(stops: GradientStop[], position: number): string {
  const points = stops
    .map((stop) => ({ position: stop.position, color: parseColor(stop.color) }))
    .filter((point): point is { position: number; color: Color } => point.color !== null && Number.isFinite(point.position))
    .sort((a, b) => a.position - b.position);
  if (points.length === 0) return "#808080";
  const first = points[0];
  const last = points[points.length - 1];
  if (position <= first.position) return toHexWithAlpha(first.color);
  if (position >= last.position) return toHexWithAlpha(last.color);
  const index = points.findIndex((point) => point.position >= position);
  const a = points[index - 1].color;
  const b = points[index].color;
  const span = points[index].position - points[index - 1].position;
  const t = span === 0 ? 0 : (position - points[index - 1].position) / span;
  const mix = (x: number, y: number) => x + (y - x) * t;
  return toHexWithAlpha(
    makeColor(
      { r: Math.round(mix(a.rgb.r, b.rgb.r)), g: Math.round(mix(a.rgb.g, b.rgb.g)), b: Math.round(mix(a.rgb.b, b.rgb.b)) },
      mix(a.alpha, b.alpha),
    ),
  );
}
