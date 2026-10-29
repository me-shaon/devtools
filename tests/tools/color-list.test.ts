import { describe, expect, it } from "vitest";
import { MAX_COMPARE_COLORS, parseColorList } from "@/utils/color";

describe("parseColorList cap", () => {
  it("keeps every color when the list is within the cap", () => {
    const result = parseColorList("#ff0000 #00ff00 #0000ff");
    expect(result.colors.map((entry) => entry.color.hex)).toEqual(["#ff0000", "#00ff00", "#0000ff"]);
    expect(result.invalid).toEqual([]);
    expect(result.truncated).toBe(0);
  });

  it("caps the list at 32 colors and counts the dropped entries", () => {
    const text = Array.from({ length: 50 }, (_, i) => `#${i.toString(16).padStart(6, "0")}`).join(" ");
    const result = parseColorList(text);
    expect(result.colors).toHaveLength(MAX_COMPARE_COLORS);
    expect(result.colors[0].color.hex).toBe("#000000");
    expect(result.colors[MAX_COMPARE_COLORS - 1].color.hex).toBe(`#${(MAX_COMPARE_COLORS - 1).toString(16).padStart(6, "0")}`);
    expect(result.truncated).toBe(50 - MAX_COMPARE_COLORS);
  });

  it("honors a custom cap", () => {
    const result = parseColorList("red green blue yellow", 2);
    expect(result.colors.map((entry) => entry.color.hex)).toEqual(["#ff0000", "#008000"]);
    expect(result.truncated).toBe(2);
  });

  it("still reports invalid tokens after the cap is reached", () => {
    const text = `${Array.from({ length: 40 }, () => "red").join(" ")} nope`;
    const result = parseColorList(text);
    expect(result.colors).toHaveLength(MAX_COMPARE_COLORS);
    expect(result.invalid).toEqual(["nope"]);
    expect(result.truncated).toBe(8);
  });

  it("handles an empty list", () => {
    const result = parseColorList("   ");
    expect(result.colors).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.truncated).toBe(0);
  });

  it("preserves the existing destructuring contract", () => {
    const { colors, invalid } = parseColorList("#f00, rgb(0, 128, 0)\nhsl(240 100% 50%) tomato; nope");
    expect(colors.map((entry) => entry.color.hex)).toEqual(["#ff0000", "#008000", "#0000ff", "#ff6347"]);
    expect(invalid).toEqual(["nope"]);
  });
});
