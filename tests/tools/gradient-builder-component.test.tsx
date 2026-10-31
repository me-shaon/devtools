import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradientBuilder } from "@/components/tools/GradientBuilder";
import { ColorPalette } from "@/components/tools/ColorPalette";

const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

// jsdom has no PointerEvent, so RTL's pointer helpers drop clientX. React only needs the event
// type string and a clientX, which a named MouseEvent carries.
const pointer = (el: Element, type: string, clientX: number) =>
  fireEvent(el, new MouseEvent(type, { bubbles: true, clientX }));

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
    pointer(track, "pointerdown", 50);
    pointer(track, "pointerup", 50);
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
    const handle = screen.getByRole("slider", { name: "Stop 1 handle" });
    pointer(handle, "pointerdown", 0);
    pointer(track, "pointermove", 70);
    pointer(track, "pointerup", 70);
    expect(screen.getByLabelText("Stop 1 position")).toHaveValue(70);
  });

  it("stops adding stops from the bar at 16", () => {
    render(<GradientBuilder />);
    const track = screen.getByRole("group", { name: /Click to add a color stop/ });
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
    for (let i = 0; i < 20; i++) {
      pointer(track, "pointerdown", 5 + i * 4);
      pointer(track, "pointerup", 5 + i * 4);
    }
    expect(screen.getAllByRole("slider")).toHaveLength(16);
    expect(screen.getByText("Add stop")).toBeDisabled();
  });

  it("moves a focused handle with the keyboard and removes it with Delete", () => {
    render(<GradientBuilder />);
    const handle = screen.getByRole("slider", { name: "Stop 1 handle" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(screen.getByLabelText("Stop 1 position")).toHaveValue(1);
    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(screen.getByLabelText("Stop 1 position")).toHaveValue(11);
    fireEvent.keyDown(handle, { key: "End" });
    expect(handle).toHaveAttribute("aria-valuenow", "100");

    // Two stops is the minimum, so Delete does nothing until a third stop exists
    fireEvent.keyDown(handle, { key: "Delete" });
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    fireEvent.click(screen.getByText("Add stop"));
    fireEvent.keyDown(screen.getByRole("slider", { name: "Stop 3 handle" }), { key: "Delete" });
    expect(screen.getAllByRole("slider")).toHaveLength(2);
  });

  it("keeps a stop's alpha when the native picker changes its color", () => {
    render(<GradientBuilder />);
    change("Stop 1 color", "#2563eb80");
    change("Pick color for stop 1", "#ff0000");
    expect(screen.getByLabelText("Stop 1 color")).toHaveValue("#ff000080");
  });
});
