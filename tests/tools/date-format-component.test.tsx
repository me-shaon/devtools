import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateFormatTranslator } from "@/components/tools/DateFormatTranslator";

describe("DateFormatTranslator", () => {
  it("detects the source and shows every translation", async () => {
    render(<DateFormatTranslator />);
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "2006-01-02T15:04:05Z07:00" } });
    expect((await screen.findAllByDisplayValue("yyyy-MM-dd'T'HH:mm:ssXXX")).map((el) => el.id)).toEqual(["date-format-out-java", "date-format-out-datefns"]);
    expect(screen.getByLabelText(/^Go/, { selector: "textarea" })).toHaveValue("2006-01-02T15:04:05Z07:00");
    expect(screen.getByLabelText(/^PHP date\(\)/, { selector: "textarea" })).toHaveValue("Y-m-d\\TH:i:sp");
    expect(screen.getByRole("option", { name: "Auto (Go)" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Tokens" })).toHaveTextContent("Year, 4 digits");
  });

  it("renders the preview for a chosen date in UTC", async () => {
    render(<DateFormatTranslator />);
    fireEvent.click(screen.getByRole("switch", { name: "UTC" }));
    fireEvent.change(screen.getByLabelText("Preview date"), { target: { value: "2024-03-05T07:08:09" } });
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "%Y-%m-%dT%H:%M:%S%z" } });
    expect(await screen.findByTestId("date-format-preview-java")).toHaveTextContent("2024-03-05T07:08:09+0000");
    expect(screen.getByTestId("date-format-preview-moment")).toHaveTextContent("2024-03-05T07:08:09+0000");
  });

  it("shows warnings for targets without an equivalent", async () => {
    render(<DateFormatTranslator />);
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "yyyy-MM-dd HH:mm:ss.SSS" } });
    const warnings = await screen.findByRole("list", { name: "C strftime warnings" });
    expect(warnings).toHaveTextContent(/no fractional seconds/);
  });

  it("uses the chosen source dialect", async () => {
    render(<DateFormatTranslator />);
    fireEvent.change(screen.getByRole("combobox", { name: "Source dialect" }), { target: { value: "moment" } });
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "D MMM" } });
    expect(await screen.findAllByDisplayValue("%-d %b")).toHaveLength(3);
    expect(screen.getByLabelText(/^Java/, { selector: "textarea" })).toHaveValue("d MMM");
  });
});
