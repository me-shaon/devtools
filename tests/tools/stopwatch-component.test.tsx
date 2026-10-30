import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Stopwatch } from "@/components/tools/Stopwatch";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Stopwatch", () => {
  it("starts, laps, pauses and resumes without losing elapsed time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { unmount } = render(<Stopwatch />);
    fireEvent.click(screen.getByText("Start"));
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.click(screen.getByText("Lap"));
    expect(screen.getByLabelText("Elapsed time")).toHaveTextContent("00:00:01.50");
    fireEvent.click(screen.getByText("Pause"));
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByLabelText("Elapsed time")).toHaveTextContent("00:00:01.50");
    fireEvent.click(screen.getByText("Resume"));
    act(() => vi.advanceTimersByTime(500));
    fireEvent.click(screen.getByText("Pause"));
    expect(screen.getByLabelText("Elapsed time")).toHaveTextContent("00:00:02.00");
    fireEvent.click(screen.getByText("Reset"));
    expect(screen.queryByText("Copy laps")).not.toBeInTheDocument();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops ticking while hidden and shows the full elapsed time when visible again", () => {
    let report: (visible: boolean) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          report = (visible) => callback([{ isIntersecting: visible }]);
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    render(<Stopwatch />);
    fireEvent.click(screen.getByText("Start"));
    act(() => report(false));
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(3000));
    act(() => report(true));
    expect(screen.getByLabelText("Elapsed time")).toHaveTextContent("00:00:03.00");
    expect(vi.getTimerCount()).toBe(1);
  });
});
