import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./CopyButton";
import { saveFile } from "@/lib/desktop";
import {
  elapsedAt,
  emptyStopwatch,
  formatElapsed,
  stopwatchAction,
  type StopwatchState,
} from "@/utils/stopwatch";
// Only the time display ticks, so the laps table does not render again on every frame.
function ElapsedTime({ state }: { state: StopwatchState }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [now, setNow] = useState(Date.now);
  const [visible, setVisible] = useState(true);
  const running = state.startedAt !== null;
  useEffect(() => {
    // The panel of a background tool tab is hidden, so stop ticking until it shows again.
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!running || !visible) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30);
    return () => window.clearInterval(timer);
  }, [running, visible]);
  return (
    <p
      ref={ref}
      className="font-mono text-4xl sm:text-6xl tabular-nums"
      aria-label="Elapsed time"
    >
      {formatElapsed(elapsedAt(state, Math.max(now, state.startedAt ?? 0)))}
    </p>
  );
}
const LapTable = memo(function LapTable({ laps }: { laps: number[] }) {
  return (
    <table className="w-full text-sm text-left">
      <thead>
        <tr>
          <th className="p-2">Lap</th>
          <th>Split</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {laps.map((total, i) => (
          <tr key={i} className="border-t">
            <td className="p-2">{i + 1}</td>
            <td className="font-mono">
              {formatElapsed(total - (laps[i - 1] ?? 0))}
            </td>
            <td className="font-mono">{formatElapsed(total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});
export function Stopwatch() {
  const [state, setState] = useState(emptyStopwatch);
  const [error, setError] = useState("");
  const running = state.startedAt !== null;
  const act = (action: "start" | "pause" | "lap" | "reset") => {
    const time = Date.now();
    setState((s) => stopwatchAction(s, action, time));
  };
  const csv = useMemo(
    () =>
      [
        "Lap,Split,Total",
        ...state.laps.map(
          (total, i) =>
            `${i + 1},${formatElapsed(total - (state.laps[i - 1] ?? 0))},${formatElapsed(total)}`,
        ),
      ].join("\n"),
    [state.laps],
  );
  return (
    <section className="space-y-6" aria-label="Stopwatch">
      <div className="rounded-lg border p-6 space-y-6">
        <ElapsedTime state={state} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => act(running ? "pause" : "start")}>
            {running ? "Pause" : state.elapsed ? "Resume" : "Start"}
          </Button>
          <Button
            variant="outline"
            disabled={!running}
            onClick={() => act("lap")}
          >
            Lap
          </Button>
          <Button
            variant="outline"
            disabled={!running && !state.elapsed}
            onClick={() => act("reset")}
          >
            Reset
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Continues across tool tabs and includes time spent asleep. Closing
          this tool clears the stopwatch.
        </p>
      </div>
      {state.laps.length > 0 ? (
        <div className="space-y-3">
          <div className="flex gap-3">
            <CopyButton value={csv} label="Copy laps" />
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await saveFile(
                    new Blob([csv], { type: "text/csv" }),
                    "stopwatch-laps.csv",
                  );
                } catch {
                  setError("Could not save laps. Try copying them instead.");
                }
              }}
            >
              Export laps
            </Button>
          </div>
          <LapTable laps={state.laps} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Start the stopwatch, then record a lap to compare split times.
        </p>
      )}
      {error && (
        <p role="alert" className="workspace-notice" data-tone="error">
          {error}
        </p>
      )}
    </section>
  );
}
