import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ColorPalette } from "@/components/tools/ColorPalette";

const codeFor = (label: string) => screen.getByRole("button", { name: `Copy ${label}` }).parentElement!.querySelector("code")!;

describe("ColorPalette converter", () => {
  it("shows every format for a named color", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "rebeccapurple" } });
    expect(codeFor("HEX")).toHaveTextContent("#663399");
    expect(codeFor("RGB")).toHaveTextContent("rgb(102, 51, 153)");
    expect(codeFor("HWB")).toHaveTextContent("hwb(270 20% 40%)");
    expect(codeFor("OKLCH").textContent).toMatch(/^oklch\(/);
    expect(codeFor("Name")).toHaveTextContent("rebeccapurple");
  });

  it("keeps alpha from an 8-digit hex", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#3b82f680" } });
    expect(codeFor("RGB")).toHaveTextContent("rgba(59, 130, 246, 0.5)");
    expect(codeFor("HEX")).toHaveTextContent("#3B82F680");
  });

  it("updates from the native color picker and keeps alpha", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "rgb(0 0 0 / 50%)" } });
    fireEvent.input(screen.getByLabelText("Pick a color"), { target: { value: "#ff0000" } });
    expect(screen.getByLabelText("Color")).toHaveValue("#ff000080");
  });

  it("shows an error for an invalid color after typing stops", async () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "not a color" } });
    expect(await screen.findByText("Not a valid CSS color.")).toBeInTheDocument();
  });
});

describe("ColorPalette contrast checker", () => {
  it("keeps the WCAG checks", () => {
    render(<ColorPalette />);
    expect(screen.getByTestId("contrast-ratio")).toHaveTextContent("4.47:1");
    expect(screen.getByText("AA normal text (4.5:1)").nextSibling).toHaveTextContent("Fail");
  });

  it("accepts named colors and blends a transparent foreground", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Foreground"), { target: { value: "rgba(0, 0, 0, 0)" } });
    fireEvent.change(screen.getByLabelText("Background"), { target: { value: "white" } });
    expect(screen.getByTestId("contrast-ratio")).toHaveTextContent("1.00:1");
    expect(screen.getByText(/blends the foreground over the background/)).toBeInTheDocument();
  });
});
