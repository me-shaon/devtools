import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MAX_COLOR_INPUT_LENGTH, useColorStudio } from "@/hooks/useColorStudio";
import { parseColor } from "@/utils/color";

const initial = () => renderHook(() => useColorStudio());

describe("useColorStudio", () => {
  it("starts with a canonical color and synchronized drafts", () => {
    const { result } = initial();
    expect(result.current.color.hex).toBe("#3b82f6");
    expect(result.current.drafts).toEqual({
      hex: "#3b82f6",
      rgb: { r: "59", g: "130", b: "246" },
      hsl: { h: "217", s: "91", l: "60" },
      alpha: "100",
    });
    expect(result.current.invalid).toEqual({ hex: false, rgb: false, hsl: false, alpha: false });
  });

  it("keeps the last valid color for an invalid draft and recovers", () => {
    const { result } = initial();
    act(() => result.current.setHexDraft("not a color"));
    expect(result.current.invalid.hex).toBe(true);
    expect(result.current.color.hex).toBe("#3b82f6");

    act(() => result.current.setHexDraft("rebeccapurple"));
    expect(result.current.invalid.hex).toBe(false);
    expect(result.current.color.hex).toBe("#663399");
    expect(result.current.drafts.rgb).toEqual({ r: "102", g: "51", b: "153" });
    expect(result.current.drafts.hsl).toEqual({ h: "270", s: "50", l: "40" });
  });

  it("does not rewrite the text of the surface being typed", () => {
    const { result } = initial();
    act(() => result.current.setHexDraft("#ABC"));
    expect(result.current.drafts.hex).toBe("#ABC");
    expect(result.current.color.hex).toBe("#aabbcc");
  });

  it("rejects out-of-range RGB channels without changing the color", () => {
    const { result } = initial();
    act(() => result.current.setRgbDraft("r", "300"));
    expect(result.current.invalid.rgb).toBe(true);
    expect(result.current.color.hex).toBe("#3b82f6");

    act(() => result.current.setRgbDraft("r", "255"));
    expect(result.current.invalid.rgb).toBe(false);
    expect(result.current.color.hex).toBe("#ff82f6");
    expect(result.current.drafts.hex).toBe("#ff82f6");
  });

  it("rejects out-of-range HSL values", () => {
    const { result } = initial();
    act(() => result.current.setHslDraft("l", "120"));
    expect(result.current.invalid.hsl).toBe(true);
    expect(result.current.color.hex).toBe("#3b82f6");

    act(() => result.current.setHslDraft("l", "40"));
    expect(result.current.invalid.hsl).toBe(false);
    expect(result.current.drafts.rgb.r).not.toBe("59");
  });

  it("round-trips alpha 0 and 100 through drafts", () => {
    const { result } = initial();
    act(() => result.current.setAlphaDraft("0"));
    expect(result.current.color.alpha).toBe(0);
    expect(result.current.drafts.hex).toBe("#3b82f600");
    expect(result.current.drafts.alpha).toBe("0");

    act(() => result.current.setAlphaDraft("100"));
    expect(result.current.color.alpha).toBe(1);
    expect(result.current.drafts.hex).toBe("#3b82f6");
    expect(result.current.drafts.alpha).toBe("100");
  });

  it("keeps fractional alpha visible in the draft", () => {
    const { result } = initial();
    act(() => result.current.applyColor(parseColor("#3b82f680")!));
    expect(result.current.drafts.alpha).toBe("50.2");
    expect(result.current.color.alpha).toBeCloseTo(0.502, 3);
  });

  it("bounds oversized input", () => {
    const { result } = initial();
    act(() => result.current.setHexDraft("#" + "f".repeat(MAX_COLOR_INPUT_LENGTH)));
    expect(result.current.invalid.hex).toBe(true);
    expect(result.current.color.hex).toBe("#3b82f6");
  });

  it("records commits, not keystrokes", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useColorStudio({ onCommit }));
    act(() => result.current.setHexDraft("rebeccapurple"));
    expect(onCommit).not.toHaveBeenCalled();

    act(() => result.current.commit());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].hex).toBe("#663399");
  });

  it("does not record an invalid draft as a commit", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useColorStudio({ onCommit }));
    act(() => result.current.setHexDraft("nope"));
    act(() => result.current.commit());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("records externally applied colors", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useColorStudio({ onCommit }));
    act(() => result.current.applyColor(parseColor("#ff0000")!));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(result.current.drafts.hex).toBe("#ff0000");
    expect(result.current.invalid.hex).toBe(false);
  });
});
