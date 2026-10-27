import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DateDifference } from "@/components/tools/DateDifference";

afterEach(() => vi.useRealTimers());
it("Now updates only the chosen date and time using local calendar values", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 26, 1, 30));
  const { container } = render(<DateDifference />);
  const dates = container.querySelectorAll('input[type="date"]');
  const times = container.querySelectorAll('input[type="time"]');
  expect(dates[0]).toHaveValue("2026-10-25");
  fireEvent.click(screen.getAllByRole("button", { name: "Now" })[0]);
  expect(dates[0]).toHaveValue("2026-10-26");
  expect(times[0]).toHaveValue("01:30");
  expect(times[1]).toHaveValue("00:00");
  fireEvent.click(screen.getAllByRole("button", { name: "Now" })[1]);
  expect(times[1]).toHaveValue("01:30");
});
