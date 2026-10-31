import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { GradientStop } from "@/utils/gradient";

const clamp = (value: number) => (Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0);

type GradientBarProps = {
  stops: GradientStop[];
  css: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /**
   * Adds a stop at the position and returns its id, so the same pointer can start dragging it.
   * Returns null when no stop can be added.
   */
  onAdd: (position: number) => number | null;
  onMove: (id: number, position: number) => void;
  /** Removes a stop. Called only when more than two stops remain. */
  onRemove: (id: number) => void;
};

/**
 * The gradient preview doubles as the stop editor: click the track to add a stop, drag a handle
 * to reposition it. A focused handle moves with the arrow keys and is removed with Delete.
 */
export function GradientBar({ stops, css, selectedId, onSelect, onAdd, onMove, onRemove }: GradientBarProps) {
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

  const handleKeyDown = (stop: GradientStop, event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const position = clamp(stop.position);
    const next: Record<string, number> = {
      ArrowLeft: position - step,
      ArrowDown: position - step,
      ArrowRight: position + step,
      ArrowUp: position + step,
      Home: 0,
      End: 100,
    };
    if (event.key in next) {
      onMove(stop.id, clamp(next[event.key]));
    } else if ((event.key === "Delete" || event.key === "Backspace") && stops.length > 2) {
      onRemove(stop.id);
    } else {
      return;
    }
    event.preventDefault();
  };

  return (
    <div
      className="rounded-lg border"
      style={{
        backgroundImage: "repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%)",
        backgroundSize: "16px 16px",
      }}
    >
      {/* The track rounds its own corners instead of clipping, so handles at 0% and 100% stay whole */}
      <div
        ref={trackRef}
        role="group"
        aria-label="Gradient preview. Click to add a color stop, or drag a handle to move it."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative h-40 cursor-copy touch-none rounded-[inherit]"
        style={{ backgroundImage: css || undefined }}
      >
        {stops.map((stop, index) => (
          <div
            key={stop.id}
            role="slider"
            tabIndex={0}
            data-stop-handle={stop.id}
            aria-label={`Stop ${index + 1} handle`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clamp(stop.position))}
            aria-valuetext={`${Math.round(clamp(stop.position))}%`}
            onFocus={() => onSelect(stop.id)}
            onKeyDown={(event) => handleKeyDown(stop, event)}
            className={
              "absolute bottom-2 h-6 w-3 -translate-x-1/2 cursor-grab rounded border shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
              (stop.id === selectedId ? "border-white ring-2 ring-primary" : "border-black/40")
            }
            style={{ left: `${clamp(stop.position)}%`, background: stop.color }}
          />
        ))}
      </div>
    </div>
  );
}
