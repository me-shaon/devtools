import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ColorPalette } from "@/components/tools/ColorPalette";
import { RECENT_COLORS_STORAGE_KEY, getContrastRatio, parseColor, simulateCvd } from "@/utils/color";

const codeFor = (label: string) => screen.getByRole("button", { name: `Copy ${label}` }).parentElement!.querySelector("code")!;

afterEach(() => localStorage.clear());

describe("ColorPalette recent colors", () => {
  it("records a color when the field loses focus and stores it", () => {
    render(<ColorPalette />);
    const input = screen.getByLabelText("Color");
    fireEvent.change(input, { target: { value: "tomato" } });
    fireEvent.blur(input);
    expect(screen.getByRole("button", { name: "Use recent color #ff6347" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(RECENT_COLORS_STORAGE_KEY)!)).toEqual(["#ff6347"]);
  });

  it("does not record an invalid color", () => {
    render(<ColorPalette />);
    const input = screen.getByLabelText("Color");
    fireEvent.change(input, { target: { value: "nope" } });
    fireEvent.blur(input);
    expect(screen.queryByText("Recent colors")).toBeNull();
  });

  it("records a selected palette swatch", () => {
    render(<ColorPalette />);
    fireEvent.click(screen.getByRole("button", { name: "Use #ffffff" }));
    expect(screen.getByRole("button", { name: "Use recent color #ffffff" })).toBeInTheDocument();
  });

  it("restores stored colors and applies one", () => {
    localStorage.setItem(RECENT_COLORS_STORAGE_KEY, JSON.stringify(["#00ff00", "broken"]));
    render(<ColorPalette />);
    fireEvent.click(screen.getByRole("button", { name: "Use recent color #00ff00" }));
    expect(screen.getByLabelText("Color")).toHaveValue("#00ff00");
    expect(screen.queryByRole("button", { name: "Use recent color broken" })).toBeNull();
  });
});

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

  it("picks an opaque color when the current color is fully transparent", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "transparent" } });
    fireEvent.input(screen.getByLabelText("Pick a color"), { target: { value: "#ff0000" } });
    expect(screen.getByLabelText("Color")).toHaveValue("#ff0000");
    expect(codeFor("RGB")).toHaveTextContent("rgb(255, 0, 0)");
  });

  it("marks and describes an invalid color", async () => {
    render(<ColorPalette />);
    const input = screen.getByLabelText("Color");
    fireEvent.change(input, { target: { value: "not a color" } });
    // The field stays valid while typing, until the error shows.
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(await screen.findByText("Not a valid CSS color.")).toHaveAttribute("id", "color-convert-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "color-convert-error");
  });

  it("labels the preview as an image", () => {
    render(<ColorPalette />);
    expect(screen.getByRole("img", { name: "Color preview" })).toBeInTheDocument();
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
    expect(screen.getByTestId("contrast-ratio")).toHaveTextContent("3.67:1");
    expect(screen.getByText("AA normal text (4.5:1)").nextSibling).toHaveTextContent("Fail");
  });

  it("accepts named colors and blends a transparent foreground", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Foreground"), { target: { value: "rgba(0, 0, 0, 0)" } });
    fireEvent.change(screen.getByLabelText("Background"), { target: { value: "white" } });
    expect(screen.getByTestId("contrast-ratio")).toHaveTextContent("1.00:1");
    expect(screen.getByText(/blends the foreground over the background/)).toBeInTheDocument();
  });

  it("marks an invalid contrast color and links the message after typing stops", async () => {
    render(<ColorPalette />);
    const fg = screen.getByLabelText("Foreground");
    fireEvent.change(fg, { target: { value: "nope" } });
    expect(fg).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText("Invalid color.")).toBeNull();
    expect(await screen.findByText("Invalid color.")).toHaveAttribute("id", "contrast-fg-error");
    expect(fg).toHaveAttribute("aria-invalid", "true");
    expect(fg).toHaveAttribute("aria-describedby", "contrast-fg-error");
  });
});

describe("ColorPalette palette", () => {
  it("shows the palette of the working color without a separate input", () => {
    render(<ColorPalette />);
    expect(screen.getByRole("button", { name: "Use #3b82f6" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#000000" } });
    expect(screen.getByRole("button", { name: "Use #000000" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use #3b82f6" })).toBeNull();
  });

  it("makes a selected swatch the working color", () => {
    render(<ColorPalette />);
    fireEvent.click(screen.getByRole("button", { name: "Use #ffffff" }));
    expect(screen.getByLabelText("Color")).toHaveValue("#ffffff");
  });

  it("switches the palette type", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#ff0000" } });
    fireEvent.change(screen.getByLabelText("Palette type"), { target: { value: "complementary" } });
    expect(screen.getByRole("button", { name: "Use #00ffff" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use #ffffff" })).toBeNull();
  });

  it("offers the palette as CSS variables and JSON", () => {
    render(<ColorPalette />);
    expect(screen.getByRole("button", { name: /Copy CSS variables/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy JSON/ })).toBeInTheDocument();
  });

  it("shows a hint when the working color is not valid", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "nope" } });
    expect(screen.getByText("Enter a valid color above to see its palette.")).toBeInTheDocument();
  });
});

describe("ColorPalette contrast suggestions", () => {
  it("suggests a foreground for a failing pair and applies it", () => {
    render(<ColorPalette />);
    const suggestion = screen.getByTestId("contrast-suggestion");
    expect(suggestion).toHaveTextContent(/A foreground of #[0-9a-f]{6} reaches 4\.\d\d:1 for AA normal text/);
    fireEvent.click(within(suggestion).getByRole("button", { name: "Use this foreground" }));
    expect(screen.getByLabelText("Foreground")).not.toHaveValue("#3b82f6");
    expect(screen.getByText("This pair meets AA normal text.")).toBeInTheDocument();
  });

  it("follows the selected target", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Target for suggestions"), { target: { value: "aa-large" } });
    expect(screen.getByText("This pair meets AA large text.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Target for suggestions"), { target: { value: "aaa-normal" } });
    expect(screen.getByTestId("contrast-suggestion")).toHaveTextContent(/for AAA normal text/);
  });

  it("says when no lightness change can reach the target", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Foreground"), { target: { value: "rgb(0 0 0 / 10%)" } });
    expect(screen.getByText(/No lightness change of the foreground or the background/)).toBeInTheDocument();
  });
});

describe("ColorPalette contrast checker and working color", () => {
  it("uses the working color as the foreground or the background", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "black" } });
    fireEvent.click(screen.getByRole("button", { name: "Use working color as foreground" }));
    expect(screen.getByLabelText("Foreground")).toHaveValue("black");
    expect(screen.getByTestId("contrast-ratio")).toHaveTextContent("21.00:1");
    fireEvent.click(screen.getByRole("button", { name: "Use working color as background" }));
    expect(screen.getByLabelText("Background")).toHaveValue("black");
  });

  it("swaps the foreground and the background", () => {
    render(<ColorPalette />);
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect(screen.getByLabelText("Foreground")).toHaveValue("#ffffff");
    expect(screen.getByLabelText("Background")).toHaveValue("#3b82f6");
  });

  it("disables the working color buttons for an invalid color", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "nope" } });
    expect(screen.getByRole("button", { name: "Use working color as foreground" })).toBeDisabled();
  });
});

describe("ColorPalette color blindness simulator", () => {
  it("simulates the converter color for each type", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#ff0000" } });
    expect(within(screen.getByTestId("cvd-row-normal")).getByText("#ff0000")).toBeInTheDocument();
    expect(within(screen.getByTestId("cvd-row-protan")).getByText("Protanopia")).toBeInTheDocument();
    expect(within(screen.getByTestId("cvd-row-protan")).getByText("#6d5f00")).toBeInTheDocument();
    const achroma = within(screen.getByTestId("cvd-row-achroma")).getByText(/^#/).textContent!;
    expect(achroma.slice(1, 3)).toBe(achroma.slice(3, 5));
  });

  it("shows a live default pair, not a frozen achromatic one", () => {
    render(<ColorPalette />);
    // The contrast foreground defaults to the working color, so the simulated pair shifts per
    // vision. A gray-on-white default left every row at the same ratio, which read as broken.
    const normal = screen.getByTestId("cvd-contrast-normal").textContent!;
    const protan = screen.getByTestId("cvd-contrast-protan").textContent!;
    const deutan = screen.getByTestId("cvd-contrast-deutan").textContent!;
    expect(normal).toContain("3.67:1");
    expect(protan).not.toBe(normal);
    expect(deutan).not.toBe(normal);
  });

  it("shows the simulated contrast of the checker pair", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Foreground"), { target: { value: "#d32f2f" } });
    const fg = parseColor("#d32f2f")!;
    const bg = parseColor("#ffffff")!;
    const ratio = getContrastRatio(simulateCvd(fg, "protan"), simulateCvd(bg, "protan"));
    const expected = (Math.floor(ratio * 100) / 100).toFixed(2);
    expect(screen.getByTestId("contrast-ratio")).toHaveTextContent("4.97:1");
    expect(screen.getByTestId("cvd-contrast-normal")).toHaveTextContent("4.97:1 AA");
    expect(screen.getByTestId("cvd-contrast-protan")).toHaveTextContent(`${expected}:1`);
  });

  it("warns when two colors look alike", () => {
    render(<ColorPalette />);
    const alerts = screen.getByRole("alert", { name: "Hard to tell apart" });
    expect(within(alerts).getByText(/^Deuteranopia: #d32f2f and #388e3c look alike/)).toBeInTheDocument();
    expect(within(alerts).queryByText(/^Normal vision/)).toBeNull();
  });

  it("lists the look-alike pairs as list items", () => {
    render(<ColorPalette />);
    const alert = screen.getByRole("alert", { name: "Hard to tell apart" });
    expect(within(alert).getByRole("list")).toBeInTheDocument();
    expect(within(alert).getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("says when every pair stays distinct", async () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Colors to compare"), { target: { value: "black, white" } });
    await waitFor(() => expect(screen.getByText(/Every pair stays distinct/)).toBeInTheDocument());
  });

  it("reports invalid colors in the list", async () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Colors to compare"), { target: { value: "red, nope" } });
    await waitFor(() => expect(screen.getByText("Not a valid CSS color: nope")).toBeInTheDocument());
  });

  it("switches to the anomaly forms below full severity", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText(/^Severity/), { target: { value: "60" } });
    expect(within(screen.getByTestId("cvd-row-deutan")).getByText("Deuteranomaly")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Severity/)).toHaveValue("60");
  });

  it("fills the compare list from the palette of the working color", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "tomato" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare these colors for color blindness" }));
    const values = screen.getByLabelText<HTMLTextAreaElement>("Colors to compare").value.split(", ");
    expect(values[0]).toBe("#ff6347");
    expect(new Set(values).size).toBe(values.length);
  });

  it("generates no duplicate swatches or false look-alike warnings for white", async () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#ffffff" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare these colors for color blindness" }));
    const values = screen.getByLabelText<HTMLTextAreaElement>("Colors to compare").value.split(", ");
    expect(values).toHaveLength(6);
    expect(new Set(values).size).toBe(6);
    await waitFor(() => expect(screen.getByText(/Every pair stays distinct/)).toBeInTheDocument());
    expect(screen.queryByRole("alert", { name: "Hard to tell apart" })).toBeNull();
  });
});
