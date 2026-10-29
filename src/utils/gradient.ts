import { parseColor, formatColor } from "./color";
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
