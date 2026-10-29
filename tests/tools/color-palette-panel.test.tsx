import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ColorPalette } from "@/components/tools/ColorPalette";
import { buildPalette, paletteToCss, paletteToJson, parseColor, toCssColor } from "@/utils/color";

const clipboard = () => vi.mocked(navigator.clipboard.writeText);
const blue = parseColor("#3b82f6")!;

beforeEach(() => {
  localStorage.clear();
  clipboard().mockClear();
});

describe("ColorPalette palette panel", () => {
  it("shows the working color first and applies a swatch", () => {
    render(<ColorPalette />);
    const palette = buildPalette(blue, "tints");
    expect(screen.getByRole("button", { name: `Use ${toCssColor(palette[0])}` })).toBeInTheDocument();

    const target = palette[1];
    fireEvent.click(screen.getByRole("button", { name: `Use ${toCssColor(target)}` }));
    expect(screen.getByLabelText("Color")).toHaveValue(toCssColor(target));
  });

  it("keeps named values on swatches for accessibility", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Palette mode"), { target: { value: "triadic" } });
    const palette = buildPalette(blue, "triadic");
    for (const swatch of palette) {
      expect(screen.getByRole("button", { name: `Use ${toCssColor(swatch)}` })).toBeInTheDocument();
    }
  });

  it("changes mode without changing the working color", () => {
    render(<ColorPalette />);
    const complement = buildPalette(blue, "complementary")[1];
    fireEvent.change(screen.getByLabelText("Palette mode"), { target: { value: "complementary" } });
    expect(screen.getByRole("button", { name: `Use ${toCssColor(complement)}` })).toBeInTheDocument();
    expect(screen.getByLabelText("Color")).toHaveValue("#3b82f6");
  });

  it("copies CSS variables in displayed order with alpha", async () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#3b82f680" } });
    const palette = buildPalette(parseColor("#3b82f680")!, "tints");

    fireEvent.click(screen.getByRole("button", { name: "Copy CSS variables" }));
    await waitFor(() => expect(clipboard()).toHaveBeenCalledWith(paletteToCss(palette)));
    expect(paletteToCss(palette)).toContain("--color-1: rgba(");
    expect(paletteToCss(palette)).not.toContain("#3b82f6;");
  });

  it("copies JSON matching the displayed palette", async () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Palette mode"), { target: { value: "analogous" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
    const expected = paletteToJson(buildPalette(blue, "analogous"));
    await waitFor(() => expect(clipboard()).toHaveBeenCalledWith(expected));
    const parsed = JSON.parse(expected) as { name: string; value: string }[];
    expect(parsed[0]).toEqual({ name: "--color-1", value: "#3b82f6" });
  });

  it("reports an export clipboard failure without a success state", async () => {
    clipboard().mockRejectedValueOnce(new Error("denied"));
    const error = vi.spyOn(toast, "error");
    render(<ColorPalette />);
    const button = screen.getByRole("button", { name: "Copy CSS variables" });
    fireEvent.click(button);
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(button).not.toHaveAttribute("data-copied");
  });

  it("leaves the compare list alone until the explicit action", () => {
    render(<ColorPalette />);
    const compare = screen.getByLabelText<HTMLTextAreaElement>("Colors to compare");
    fireEvent.change(compare, { target: { value: "red" } });
    fireEvent.change(screen.getByLabelText("Palette mode"), { target: { value: "triadic" } });
    expect(compare).toHaveValue("red");

    fireEvent.click(screen.getByRole("button", { name: "Use palette colors for comparison" }));
    const expected = buildPalette(blue, "triadic")
      .map((color) => toCssColor(color))
      .join(", ");
    expect(compare).toHaveValue(expected);
  });
});
