import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ColorPalette } from "@/components/tools/ColorPalette";

beforeEach(() => {
  localStorage.clear();
});

describe("ColorPalette contrast panel", () => {
  it("swaps the pair", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Foreground"), { target: { value: "#000000" } });
    fireEvent.change(screen.getByLabelText("Background"), { target: { value: "#ffffff" } });
    expect(screen.getByTestId("contrast-ratio")).toHaveTextContent("21.00:1");

    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect(screen.getByLabelText("Foreground")).toHaveValue("#ffffff");
    expect(screen.getByLabelText("Background")).toHaveValue("#000000");
    expect(screen.getByTestId("contrast-ratio")).toHaveTextContent("21.00:1");
  });

  it("uses the working color on either side and leaves the other side alone", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#ff0000" } });
    fireEvent.click(screen.getByRole("button", { name: "Use working color as foreground" }));
    expect(screen.getByLabelText("Foreground")).toHaveValue("#ff0000");
    expect(screen.getByLabelText("Background")).toHaveValue("#ffffff");

    fireEvent.click(screen.getByRole("button", { name: "Use working color as background" }));
    expect(screen.getByLabelText("Background")).toHaveValue("#ff0000");
  });

  it("keeps the comparison pair when the working color changes", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Foreground"), { target: { value: "#123456" } });
    fireEvent.change(screen.getByLabelText("Background"), { target: { value: "#abcdef" } });
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#ff0000" } });
    expect(screen.getByLabelText("Foreground")).toHaveValue("#123456");
    expect(screen.getByLabelText("Background")).toHaveValue("#abcdef");
  });

  it("suggests and applies a passing foreground", () => {
    render(<ColorPalette />);
    expect(screen.getByTestId("contrast-suggestion")).toBeInTheDocument();
    const apply = screen.getByRole("button", { name: /^Apply suggested (foreground|background)$/ });
    fireEvent.click(apply);
    expect(screen.getByText("AA normal text (4.5:1)").nextSibling).toHaveTextContent("Pass");
  });

  it("records an applied suggestion as a recent color", () => {
    render(<ColorPalette />);
    const suggested = screen.getByTestId("contrast-suggestion").querySelector("code")!.textContent!;
    fireEvent.click(screen.getByRole("button", { name: /^Apply suggested (foreground|background)$/ }));
    expect(screen.getByRole("button", { name: `Use recent color ${suggested}` })).toBeInTheDocument();
  });

  it("meets the AAA target when selected", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("WCAG target"), { target: { value: "aaa-normal" } });
    fireEvent.click(screen.getByRole("button", { name: /^Apply suggested (foreground|background)$/ }));
    expect(screen.getByText("AAA normal text (7:1)").nextSibling).toHaveTextContent("Pass");
  });

  it("flags an invalid input and keeps the last valid pair out of the result", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Foreground"), { target: { value: "nope" } });
    expect(screen.getByText("Invalid color.")).toBeInTheDocument();
    expect(screen.queryByTestId("contrast-ratio")).toBeNull();
  });

  it("reports an impossible target", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Foreground"), { target: { value: "transparent" } });
    expect(
      screen.getByText(/No foreground or background lightness change can meet AA normal text/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("contrast-suggestion")).toBeNull();
  });

  it("says when the pair already meets the target", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("WCAG target"), { target: { value: "aa-large" } });
    expect(screen.getByText(/This pair meets AA large text \(3:1\)/)).toBeInTheDocument();
    expect(screen.getByText(/This pair meets AA large text \(3:1\)/).closest("[role=status]")).not.toBeNull();
    expect(screen.getByTestId("contrast-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("contrast-suggestion")).toBeNull();
  });

  it("discloses compositing for translucent pairs", () => {
    render(<ColorPalette />);
    fireEvent.change(screen.getByLabelText("Foreground"), { target: { value: "rgba(0, 0, 0, 0.5)" } });
    expect(screen.getByText(/blends the foreground over the background/)).toBeInTheDocument();
    expect(screen.getByTestId("contrast-ratio")).toHaveTextContent("3.94:1");
  });
});
