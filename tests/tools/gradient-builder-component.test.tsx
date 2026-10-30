import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  it("applies a starter preset to the stops and angle", () => {
    render(<GradientBuilder />);
    fireEvent.click(
      screen.getByRole("button", { name: "Apply Sunset gradient" }),
    );
    const css = screen.getByText(/background: linear/);
    expect(css).toHaveTextContent("45deg");
    expect(css).toHaveTextContent("#F12711 0%");
    expect(css).toHaveTextContent("#F5AF19 100%");
    expect(screen.getByLabelText("Stop 1 color")).toHaveValue("#f12711");
  });

  it("paints a stop with the native color picker without losing its hex field", () => {
    render(<GradientBuilder />);
    change("Pick color for stop 1", "#ff0000");
    expect(screen.getByLabelText("Stop 1 color")).toHaveValue("#ff0000");
    expect(screen.getByText(/background: linear/)).toHaveTextContent("#FF0000 0%");
  });

  it("adds a stop where the gradient bar is clicked", () => {
    render(<GradientBuilder />);
    const track = screen.getByRole("group", {
      name: /Click to add a color stop/,
    });
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 100,
    } as DOMRect);
    fireEvent.pointerDown(track, { clientX: 50, pointerId: 1 });
    fireEvent.pointerUp(track, { pointerId: 1 });
    expect(screen.getByLabelText("Stop 3 position")).toHaveValue(50);
  });

  it("drags a handle to reposition its stop", () => {
    render(<GradientBuilder />);
    const track = screen.getByRole("group", {
      name: /Click to add a color stop/,
    });
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 100,
    } as DOMRect);
    const handle = screen.getByRole("button", { name: "Stop 1 at 0 percent" });
    fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 70, pointerId: 1 });
    fireEvent.pointerUp(track, { pointerId: 1 });
    expect(screen.getByLabelText("Stop 1 position")).toHaveValue(70);
  });
});
