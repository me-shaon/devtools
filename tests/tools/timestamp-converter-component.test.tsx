import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimestampConverter } from "@/components/tools/TimestampConverter";

const ZONES_KEY = "devtools-timestamp-zones";

const typeInput = (value: string) => {
  fireEvent.change(screen.getByLabelText("Timestamp or date"), { target: { value } });
  act(() => {
    vi.advanceTimersByTime(200);
  });
};

const rowValue = (label: string) => screen.getByText(label).closest("div")?.querySelector("dd")?.textContent;

describe("TimestampConverter", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the current time live when the input is empty", () => {
    render(<TimestampConverter />);
    expect(rowValue("Unix seconds")).toBe("1705320000");
    expect(rowValue("ISO 8601 (UTC)")).toBe("2024-01-15T12:00:00.000Z");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(rowValue("Unix seconds")).toBe("1705320001");
    expect(screen.getByText("Help & reference")).toBeInTheDocument();
  });

  it("uses a plain text input so pasted text can fill it", () => {
    render(<TimestampConverter />);
    expect(screen.getByLabelText("Timestamp or date")).toHaveAttribute("type", "text");
  });

  it("detects milliseconds and converts as you type", () => {
    render(<TimestampConverter />);
    typeInput("1705309200123");
    expect(screen.getByText("Read as Unix milliseconds.")).toBeInTheDocument();
    expect(rowValue("Unix seconds")).toBe("1705309200");
    expect(rowValue("Unix milliseconds")).toBe("1705309200123");
    expect(rowValue("ISO 8601 (UTC)")).toBe("2024-01-15T09:00:00.123Z");
    expect(rowValue("RFC 2822")).toBe("Mon, 15 Jan 2024 09:00:00 GMT");
    expect(rowValue("Relative")).toBe("2 hours ago");
  });

  it("converts a date string to epoch values", () => {
    render(<TimestampConverter />);
    typeInput("2024-01-16T12:00:00Z");
    expect(rowValue("Unix seconds")).toBe("1705406400");
    expect(rowValue("Relative")).toBe("tomorrow");
  });

  it("evaluates offsets from now", () => {
    render(<TimestampConverter />);
    typeInput("now - 1d");
    expect(rowValue("Unix seconds")).toBe(String(1705320000 - 86400));
  });

  it("reports input it cannot read", () => {
    render(<TimestampConverter />);
    typeInput("not a date");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a Unix timestamp");
    expect(screen.queryByText("Unix seconds")).not.toBeInTheDocument();
  });

  it("adds, saves, and removes time zones", () => {
    render(<TimestampConverter />);
    const zoneInput = screen.getByLabelText("Add a time zone");
    fireEvent.change(zoneInput, { target: { value: "Asia/Kolkata" } });
    fireEvent.keyDown(zoneInput, { key: "Enter" });
    expect(rowValue("Asia/Kolkata")).toContain("2024-01-15 17:30:00");
    expect(rowValue("Asia/Kolkata")).toContain("+05:30");
    expect(JSON.parse(localStorage.getItem(ZONES_KEY) ?? "[]")).toEqual(["Asia/Kolkata"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Asia/Kolkata" }));
    expect(screen.queryByText("Asia/Kolkata")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(ZONES_KEY) ?? "[]")).toEqual([]);
  });

  it("rejects an unknown time zone", () => {
    render(<TimestampConverter />);
    const zoneInput = screen.getByLabelText("Add a time zone");
    fireEvent.change(zoneInput, { target: { value: "Mars/Olympus" } });
    fireEvent.keyDown(zoneInput, { key: "Enter" });
    expect(screen.getByRole("alert")).toHaveTextContent("Unknown time zone");
  });

  it("loads saved time zones", () => {
    localStorage.setItem(ZONES_KEY, JSON.stringify(["America/New_York", "Bad/Zone"]));
    render(<TimestampConverter />);
    expect(rowValue("America/New_York")).toContain("2024-01-15 07:00:00");
    expect(screen.queryByText("Bad/Zone")).not.toBeInTheDocument();
  });
});
