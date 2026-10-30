import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CronCalculator } from "@/components/tools/CronCalculator";

const type = (value: string) => {
  fireEvent.change(screen.getByLabelText("Cron expression"), { target: { value } });
  act(() => {
    vi.advanceTimersByTime(300);
  });
};

const runTimes = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("time")).map((node) => node.getAttribute("dateTime"));

describe("CronCalculator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-05T19:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("makes the typed expression the first text field so pasted text lands in it", () => {
    const { container } = render(<CronCalculator />);
    expect(container.querySelector('input[type="text"]')).toBe(screen.getByLabelText("Cron expression"));
    expect(screen.getByText("What cron format does this tool use?")).toBeInTheDocument();
  });

  it("explains a typed expression and lists the next runs", () => {
    const { container } = render(<CronCalculator />);
    type("CRON_TZ=UTC 0 */6 * * 1-5");

    expect(screen.getByText("At 00:00, 06:00, 12:00 and 18:00, on Monday through Friday")).toBeInTheDocument();
    expect(screen.getByText("every 6 hours")).toBeInTheDocument();
    expect(runTimes(container)).toEqual([
      "2024-01-08T00:00:00.000Z",
      "2024-01-08T06:00:00.000Z",
      "2024-01-08T12:00:00.000Z",
      "2024-01-08T18:00:00.000Z",
      "2024-01-09T00:00:00.000Z",
    ]);
  });

  it("points at the bad field", () => {
    render(<CronCalculator />);
    type("0 24 * * *");

    expect(screen.getByRole("alert")).toHaveTextContent("Hour: 24 is out of range. Use 0 to 23.");
    expect(screen.getByLabelText("Hour field")).toHaveAttribute("aria-invalid", "true");
  });

  it("edits the same expression from the field breakdown", () => {
    render(<CronCalculator />);
    type("0 */6 * * 1-5");
    fireEvent.change(screen.getByLabelText("Hour field"), { target: { value: "*/4" } });

    expect(screen.getByLabelText("Cron expression")).toHaveValue("0 */4 * * 1-5");
  });

  it("shows the command from a pasted crontab line", () => {
    render(<CronCalculator />);
    type("0 2 * * * /usr/bin/backup.sh");

    expect(screen.getByText("/usr/bin/backup.sh")).toBeInTheDocument();
    expect(screen.getByText("At 02:00, every day")).toBeInTheDocument();
  });

  it("says when a schedule never runs", () => {
    render(<CronCalculator />);
    type("0 0 30 2 *");

    expect(screen.getByText(/never runs/)).toBeInTheDocument();
  });
});

describe("CronCalculator visual builder", () => {
  it("builds one field without replacing the other fields", async () => {
    render(<CronCalculator />);
    fireEvent.click(screen.getByText("Visual builder"));
    const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    change("Minute builder mode", "interval");
    change("Minute start", "0");
    change("Minute interval", "15");
    fireEvent.click(screen.getByText("Apply minute"));
    expect(screen.getByLabelText("Cron expression")).toHaveValue("0/15 9 * * MON-FRI");
    await waitFor(() => expect(screen.getByLabelText("Minute field")).toHaveValue("0/15"));
  });
});
