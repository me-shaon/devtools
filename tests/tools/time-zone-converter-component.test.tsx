import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeZoneConverter } from "@/components/tools/TimeZoneConverter";
import { getLocalTimeZone } from "@/utils/timestamp";

const ZONES_KEY = "devtools-timestamp-zones";

const rowValue = (label: string) => screen.getByText(label).closest("div")?.querySelector("dd")?.textContent;

const setFrom = (zone: string) => fireEvent.change(screen.getByLabelText("From time zone"), { target: { value: zone } });
const setTime = (value: string) => fireEvent.change(screen.getByLabelText("Date and time"), { target: { value } });

describe("TimeZoneConverter", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the current time in the local zone", () => {
    render(<TimeZoneConverter />);
    expect(screen.getByLabelText("From time zone")).toHaveValue(getLocalTimeZone());
    expect(rowValue("UTC")).toBe("2024-01-15 12:00:00 +00:00");
  });

  it("converts a time in a named zone to UTC and saved zones", () => {
    localStorage.setItem(ZONES_KEY, JSON.stringify(["Asia/Tokyo"]));
    render(<TimeZoneConverter />);
    setFrom("america/new_york");
    setTime("2024-01-15T21:30:00");
    fireEvent.blur(screen.getByLabelText("From time zone"));

    expect(screen.getByLabelText("From time zone")).toHaveValue("America/New_York");
    expect(rowValue("UTC")).toBe("2024-01-16 02:30:00 +00:00");
    expect(rowValue("Asia/Tokyo")).toBe("2024-01-16 11:30:00 +09:00");
    expect(screen.getByText("UTC").closest("div")).toHaveTextContent("+1 day");
    expect(screen.getByText("Asia/Tokyo").closest("div")).toHaveTextContent("+1 day");
  });

  it("explains a time in a daylight saving gap", () => {
    render(<TimeZoneConverter />);
    setFrom("America/New_York");
    setTime("2024-03-10T02:30:00");
    expect(screen.getByRole("status")).toHaveTextContent("does not exist in America/New_York");
    expect(rowValue("UTC")).toBe("2024-03-10 07:30:00 +00:00");
  });

  it("switches between the two times in a daylight saving overlap", () => {
    render(<TimeZoneConverter />);
    setFrom("America/New_York");
    setTime("2024-11-03T01:30:00");
    expect(screen.getByRole("status")).toHaveTextContent("Showing the first one (UTC-04:00)");
    expect(rowValue("UTC")).toBe("2024-11-03 05:30:00 +00:00");

    fireEvent.click(screen.getByRole("button", { name: "Use the second time" }));
    expect(screen.getByRole("status")).toHaveTextContent("Showing the second one (UTC-05:00)");
    expect(rowValue("UTC")).toBe("2024-11-03 06:30:00 +00:00");
  });

  it("converts from another row and keeps the same moment", () => {
    render(<TimeZoneConverter />);
    setFrom("Asia/Kolkata");
    setTime("2024-01-15T09:00:00");
    fireEvent.click(screen.getByRole("button", { name: "Convert from UTC" }));

    expect(screen.getByLabelText("From time zone")).toHaveValue("UTC");
    expect(screen.getByLabelText("Date and time")).toHaveValue("2024-01-15T03:30");
    expect(rowValue("UTC")).toBe("2024-01-15 03:30:00 +00:00");
  });

  it("keeps the last valid zone while a typed zone is unknown", () => {
    render(<TimeZoneConverter />);
    setFrom("UTC");
    setTime("2024-01-15T12:00:00");
    setFrom("Mars/Base");
    expect(screen.getByRole("alert")).toHaveTextContent("Unknown time zone: Mars/Base. The conversion still uses UTC.");
    expect(rowValue("UTC")).toBe("2024-01-15 12:00:00 +00:00");
  });

  it("adds and removes zones in the list it shares with the Timestamp tool", () => {
    render(<TimeZoneConverter />);
    fireEvent.change(screen.getByLabelText("Add a time zone"), { target: { value: "europe/berlin" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(JSON.parse(localStorage.getItem(ZONES_KEY) ?? "[]")).toEqual(["Europe/Berlin"]);
    expect(rowValue("Europe/Berlin")).toBe("2024-01-15 13:00:00 +01:00");

    fireEvent.click(screen.getByRole("button", { name: "Remove Europe/Berlin" }));
    expect(JSON.parse(localStorage.getItem(ZONES_KEY) ?? "[]")).toEqual([]);

    fireEvent.change(screen.getByLabelText("Add a time zone"), { target: { value: "Nowhere/Land" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Unknown time zone: Nowhere/Land");
  });

  it("asks for a date and time when the input is empty", () => {
    render(<TimeZoneConverter />);
    setTime("");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a date and time.");
    expect(screen.queryByText("UTC")).not.toBeInTheDocument();
  });
});
