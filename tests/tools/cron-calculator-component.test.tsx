import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CronCalculator } from "@/components/tools/CronCalculator";

describe("CronCalculator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T10:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders calculated next runs and the FAQ section", () => {
    const { container } = render(<CronCalculator />);

    expect(screen.getByText("Run every minute")).toBeInTheDocument();
    expect(screen.getByText("What cron format does this tool use?")).toBeInTheDocument();

    const times = Array.from(container.querySelectorAll("time")).map((node) =>
      node.getAttribute("dateTime")
    );

    expect(times).toEqual([
      "2024-01-01T10:31:00.000Z",
      "2024-01-01T10:32:00.000Z",
      "2024-01-01T10:33:00.000Z",
      "2024-01-01T10:34:00.000Z",
      "2024-01-01T10:35:00.000Z",
    ]);
  });
});
