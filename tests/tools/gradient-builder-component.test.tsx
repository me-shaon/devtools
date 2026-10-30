import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GradientBuilder } from "@/components/tools/GradientBuilder";
import { ColorPalette } from "@/components/tools/ColorPalette";

const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("GradientBuilder", () => {
  it("edits stops with numeric controls and keeps at least two stops", () => {
    render(<GradientBuilder />);
    expect(screen.getByLabelText("Remove stop 1")).toBeDisabled();
    fireEvent.click(screen.getByText("Add stop"));
    change("Stop 3 color", "not-a-color");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid color");
    change("Stop 3 color", "#ffffff80");
    change("Stop 3 position", "25");
    expect(screen.getByText(/background: linear/)).toHaveTextContent("#FFFFFF80 25%");
    fireEvent.click(screen.getByLabelText("Remove stop 3"));
    expect(screen.queryByLabelText("Stop 3 color")).not.toBeInTheDocument();
  });

  it("opens from a Color Palette tab panel and keeps its stops across tab changes", () => {
    render(<ColorPalette />);
    const gradientTab = screen.getByRole("tab", { name: "Gradient" });
    const panel = document.getElementById(gradientTab.getAttribute("aria-controls") ?? "");
    expect(panel).toHaveAttribute("role", "tabpanel");
    expect(panel).not.toBeVisible();
    fireEvent.mouseDown(gradientTab, { button: 0 });
    expect(panel).toBeVisible();
    fireEvent.click(screen.getByText("Add stop"));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Colors" }), { button: 0 });
    expect(panel).not.toBeVisible();
    fireEvent.mouseDown(gradientTab, { button: 0 });
    expect(screen.getByLabelText("Stop 3 color")).toBeInTheDocument();
  });
});
