import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ColorPalette } from "@/components/tools/ColorPalette";
import { RECENT_COLORS_KEY } from "@/utils/color";

const codeFor = (label: string) =>
  screen.getByRole("button", { name: `Copy ${label}` }).parentElement!.querySelector("code")!;

const clipboard = () => vi.mocked(navigator.clipboard.writeText);

beforeEach(() => {
  localStorage.clear();
  clipboard().mockClear();
});

describe("ColorPalette workspace", () => {
  it("shows the primary controls and keeps tab state", async () => {
    render(<ColorPalette />);
    expect(screen.getByLabelText("Color")).toHaveValue("#3b82f6");
    expect(screen.getByLabelText("Pick a color")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Color preview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Palette" })).toHaveAttribute("aria-selected", "true");

    fireEvent.change(screen.getByLabelText(/^Severity/), { target: { value: "60" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Contrast" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Contrast" })).toHaveAttribute("aria-selected", "true"),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Vision" }));
    expect(screen.getByLabelText(/^Severity/)).toHaveValue("60");
  });

  it("updates every format from an RGB channel", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Red"), { target: { value: "255" } });
    expect(codeFor("HEX")).toHaveTextContent("#FF82F6");
    expect(codeFor("RGB")).toHaveTextContent("rgb(255, 130, 246)");
    expect(screen.getByLabelText("Red")).toHaveValue("255");
  });

  it("rejects out-of-range channels without changing the color", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Red"), { target: { value: "300" } });
    expect(screen.getByLabelText("Red")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Use whole numbers from 0 to 255.")).toBeInTheDocument();
    expect(codeFor("HEX")).toHaveTextContent("#3B82F6");
  });

  it("rejects out-of-range HSL values", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Lightness"), { target: { value: "120" } });
    expect(screen.getByLabelText("Lightness")).toHaveAttribute("aria-invalid", "true");
    expect(codeFor("HEX")).toHaveTextContent("#3B82F6");
  });

  it("keeps typed text while editing and normalizes on blur", () => {
    render(<ColorPalette />);
    const input = screen.getByLabelText("Color");
    fireEvent.change(input, { target: { value: "#ABC" } });
    expect(input).toHaveValue("#ABC");
    expect(codeFor("HEX")).toHaveTextContent("#AABBCC");
    fireEvent.blur(input);
    expect(input).toHaveValue("#aabbcc");
  });

  it("round-trips alpha boundaries through the formats", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Alpha percent"), { target: { value: "0" } });
    expect(codeFor("HEX")).toHaveTextContent("#3B82F600");
    expect(codeFor("RGB")).toHaveTextContent("rgba(59, 130, 246, 0)");

    fireEvent.change(screen.getByLabelText("Alpha percent"), { target: { value: "100" } });
    expect(codeFor("HEX")).toHaveTextContent("#3B82F6");
  });

  it("changes alpha from the slider", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Alpha"), { target: { value: "50" } });
    expect(codeFor("HEX")).toHaveTextContent("#3B82F680");
  });

  it("copies the displayed format", async () => {
    render(<ColorPalette />);
    fireEvent.click(screen.getByRole("button", { name: "Copy HSL" }));
    await waitFor(() => expect(clipboard()).toHaveBeenCalledWith(codeFor("HSL").textContent));
    expect(screen.getByRole("button", { name: "Copy HSL" })).toHaveAttribute("data-copied", "true");
  });

  it("reports a clipboard failure without a success state", async () => {
    clipboard().mockRejectedValueOnce(new Error("denied"));
    const error = vi.spyOn(toast, "error");
    render(<ColorPalette />);
    const button = screen.getByRole("button", { name: "Copy HEX" });
    fireEvent.click(button);
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(button).not.toHaveAttribute("data-copied");
  });

  it("records committed colors and reapplies them", () => {
    render(<ColorPalette />);
    const input = screen.getByLabelText("Color");
    expect(screen.queryByText("Recent colors")).toBeNull();

    fireEvent.change(input, { target: { value: "rebeccapurple" } });
    fireEvent.blur(input);
    expect(localStorage.getItem(RECENT_COLORS_KEY)).toContain("#663399");

    fireEvent.change(input, { target: { value: "#ff0000" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: "Use recent color #663399" }));
    expect(input).toHaveValue("#663399");
    expect(codeFor("HEX")).toHaveTextContent("#663399");
  });

  it("does not record an invalid draft", () => {
    render(<ColorPalette />);
    const input = screen.getByLabelText("Color");
    fireEvent.change(input, { target: { value: "nope" } });
    fireEvent.blur(input);
    expect(screen.queryByText("Recent colors")).toBeNull();
  });

  it("restores recent colors from storage", () => {
    const first = render(<ColorPalette />);
    const input = screen.getByLabelText("Color");
    fireEvent.change(input, { target: { value: "#123456" } });
    fireEvent.blur(input);
    first.unmount();

    render(<ColorPalette />);
    expect(screen.getByRole("button", { name: "Use recent color #123456" })).toBeInTheDocument();
  });

  it("renders the updated help copy", () => {
    render(<ColorPalette />);
    expect(screen.getByText("Help & reference")).toBeInTheDocument();
    expect(screen.getByText(/The Color field accepts any sRGB CSS color/)).toBeInTheDocument();
    expect(screen.getByText(/the last 8 applied colors/)).toBeInTheDocument();
    expect(screen.getByText(/Every palette starts from the working color/)).toBeInTheDocument();
    expect(screen.getByText(/suggests the closest lightness change/)).toBeInTheDocument();
    expect(screen.getByText(/At 0% no simulation is applied/)).toBeInTheDocument();
    expect(screen.getByText(/Up to 32 colors are compared at once/)).toBeInTheDocument();
    expect(screen.getByText(/Images up to 20 MB and 40 megapixels/)).toBeInTheDocument();
    expect(screen.queryByText(/Base color/)).toBeNull();
    expect(screen.queryByText(/^Generate/)).toBeNull();
  });
});
