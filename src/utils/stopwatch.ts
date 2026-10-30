export interface StopwatchState {
  elapsed: number;
  startedAt: number | null;
  laps: number[];
}
export const emptyStopwatch = (): StopwatchState => ({
  elapsed: 0,
  startedAt: null,
  laps: [],
});
export const elapsedAt = (state: StopwatchState, now: number) =>
  state.elapsed +
  (state.startedAt === null ? 0 : Math.max(0, now - state.startedAt));
export function stopwatchAction(
  state: StopwatchState,
  action: "start" | "pause" | "lap" | "reset",
  now: number,
): StopwatchState {
  if (action === "reset") return emptyStopwatch();
  if (action === "start")
    return state.startedAt === null ? { ...state, startedAt: now } : state;
  const elapsed = elapsedAt(state, now);
  if (action === "pause") return { ...state, elapsed, startedAt: null };
  return state.startedAt === null
    ? state
    : { ...state, laps: [...state.laps, elapsed] };
}
export function formatElapsed(ms: number): string {
  const centiseconds = Math.floor(ms / 10);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}
