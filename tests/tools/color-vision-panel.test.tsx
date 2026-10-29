import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ColorPalette } from "@/components/tools/ColorPalette";

beforeEach(() => {
  localStorage.clear();
});

describe("ColorPalette vision panel", () => {
  it("applies no simulation at severity 0", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText(/^Severity/), { target: { value: "0" } });
    expect(screen.getByLabelText(/^Severity/)).toHaveValue("0");
    expect(screen.getByText(/Severity: 0% \(No simulation\)/)).toBeInTheDocument();
    expect(within(screen.getByTestId("cvd-row-protan")).getByText("#3b82f6")).toBeInTheDocument();
    expect(within(screen.getByTestId("cvd-row-deutan")).getByText("No simulation")).toBeInTheDocument();
    expect(within(screen.getByTestId("cvd-row-achroma")).getByText("#3b82f6")).toBeInTheDocument();
  });

  it("labels full and partial deficiency forms", () => {
    render(<ColorPalette />);
    expect(within(screen.getByTestId("cvd-row-protan")).getByText("Protanopia")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Severity/), { target: { value: "60" } });
    expect(within(screen.getByTestId("cvd-row-protan")).getByText("Protanomaly")).toBeInTheDocument();
  });

  it("names the source of each column", () => {
    render(<ColorPalette />);
    expect(screen.getByRole("columnheader", { name: "Color (workspace)" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Sample text" })).toBeInTheDocument();
  });

  it("shows each simulated color as sample text on a legible surface", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#ff0000" } });
    const normal = within(screen.getByTestId("cvd-row-normal")).getByText("Sample text");
    const deutan = within(screen.getByTestId("cvd-row-deutan")).getByText("Sample text");
    expect(normal.style.color).toBe("rgb(255, 0, 0)");
    expect(deutan.style.color).not.toBe(normal.style.color);
    expect(normal.style.backgroundColor).toBe("rgb(0, 0, 0)");
    expect(screen.getByTestId("cvd-contrast-normal").textContent).not.toBe(
      screen.getByTestId("cvd-contrast-deutan").textContent,
    );
  });

  it("uses a light surface for a dark working color", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#000000" } });
    expect(within(screen.getByTestId("cvd-row-normal")).getByText("Sample text").style.backgroundColor).toBe(
      "rgb(255, 255, 255)",
    );
  });

  it("marks a neutral color as unchanged", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#808080" } });
    expect(within(screen.getByTestId("cvd-row-deutan")).getByText("(unchanged)")).toBeInTheDocument();
  });

  it("caps and reports an oversized compare list", async () => {
    render(<ColorPalette />);
    const text = Array.from({ length: 40 }, (_, i) => `#${i.toString(16).padStart(2, "0").repeat(3)}`).join(" ");
    fireEvent.change(screen.getByLabelText("Colors to compare"), { target: { value: `${text} nope` } });
    expect(await screen.findByText(/Only the first 32 colors are simulated; 8 more were ignored/)).toBeInTheDocument();
    expect(screen.getByText("Not a valid CSS color: nope")).toBeInTheDocument();
  });

  it("handles an empty compare list", async () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Colors to compare"), { target: { value: "" } });
    await waitFor(() => expect(screen.queryByTestId("cvd-palette")).toBeNull());
    expect(screen.queryByRole("alert", { name: "Hard to tell apart" })).toBeNull();
  });

  it("compares no pairs for a single color", async () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Colors to compare"), { target: { value: "red" } });
    await waitFor(() => expect(screen.queryByRole("alert", { name: "Hard to tell apart" })).toBeNull());
    expect(screen.queryByText(/Every pair stays distinct/)).toBeNull();
  });
});
