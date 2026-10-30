import { useRef, type PointerEvent } from "react";
import type { GradientStop } from "@/utils/gradient";

const clamp = (value: number) => (Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0);

type GradientBarProps = {
  stops: GradientStop[];
  css: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Adds a stop at the position and returns its id, so the same pointer can start dragging it. */
  onAdd: (position: number) => number;
  onMove: (id: number, position: number) => void;
};

/**
 * The gradient preview doubles as the stop editor: click the track to add a stop, drag a handle
 * to reposition it. The per-stop numeric fields stay the keyboard-accessible path for the same job.
 */
export function GradientBar({ stops, css, selectedId, onSelect, onAdd, onMove }: GradientBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingId = useRef<number | null>(null);

  const positionAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.round(clamp(((clientX - rect.left) / rect.width) * 100));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;
    // Pointer capture keeps the drag alive when the pointer leaves the track; not every
    // environment (older browsers, jsdom) implements it, so the drag still works without it.
    track.setPointerCapture?.(event.pointerId);
    const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-stop-handle]");
    if (handle) {
      const id = Number(handle.dataset.stopHandle);
      draggingId.current = id;
      onSelect(id);
    } else {
      draggingId.current = onAdd(positionAt(event.clientX));
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (draggingId.current !== null) onMove(draggingId.current, positionAt(event.clientX));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    draggingId.current = null;
    trackRef.current?.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        backgroundImage: "repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%)",
        backgroundSize: "16px 16px",
      }}
    >
      <div
        ref={trackRef}
        role="group"
        aria-label="Gradient preview. Click to add a color stop, or drag a handle to move it."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative h-40 cursor-copy touch-none"
        style={{ backgroundImage: css || undefined }}
      >
        {stops.map((stop, index) => (
          <button
            key={stop.id}
            type="button"
            data-stop-handle={stop.id}
            aria-label={`Stop ${index + 1} at ${Math.round(clamp(stop.position))} percent`}
            className={
              "absolute bottom-2 h-6 w-3 -translate-x-1/2 cursor-grab rounded border shadow " +
              (stop.id === selectedId ? "border-white ring-2 ring-primary" : "border-black/40")
            }
            style={{ left: `${clamp(stop.position)}%`, background: stop.color }}
          />
        ))}
      </div>
    </div>
  );
}
