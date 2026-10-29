import { describe, expect, it } from "vitest";
import {
  MAX_RECENT_COLORS,
  addRecentColor,
  parseColor,
  parseRecentColors,
  serializeRecentColors,
} from "@/utils/color";

const color = (input: string) => parseColor(input)!;

describe("parseRecentColors", () => {
  it("returns no colors for missing, malformed, or unexpected data", () => {
    expect(parseRecentColors(null)).toEqual([]);
    expect(parseRecentColors("")).toEqual([]);
    expect(parseRecentColors("{")).toEqual([]);
    expect(parseRecentColors("{}")).toEqual([]);
    expect(parseRecentColors('"#ff0000"')).toEqual([]);
  });

  it("skips invalid entries and non-string values", () => {
    const parsed = parseRecentColors(JSON.stringify(["#ff0000", "nope", 42, null, "red"]));
    expect(parsed.map((entry) => entry.hex)).toEqual(["#ff0000"]);
  });

  it("deduplicates equal colors and caps the list", () => {
    const raw = JSON.stringify([
      "#ff0000",
      "red",
      ...Array.from({ length: 12 }, (_, index) => `#0000${index.toString(16).padStart(2, "0")}`),
    ]);
    const parsed = parseRecentColors(raw);
    expect(parsed).toHaveLength(MAX_RECENT_COLORS);
    expect(new Set(parsed.map((entry) => `${entry.hex}:${entry.alpha}`)).size).toBe(parsed.length);
  });

  it("preserves alpha from CSS strings", () => {
    const [entry] = parseRecentColors(JSON.stringify(["rgba(255, 0, 0, 0.5)"]));
    expect(entry.alpha).toBe(0.5);
    expect(entry.hex).toBe("#ff0000");
  });
});

describe("addRecentColor", () => {
  it("adds the newest color first", () => {
    const result = addRecentColor([color("#00ff00")], color("#ff0000"));
    expect(result.map((entry) => entry.hex)).toEqual(["#ff0000", "#00ff00"]);
  });

  it("moves an existing color to the front without duplicating it", () => {
    const result = addRecentColor([color("#ff0000"), color("#00ff00")], color("#00ff00"));
    expect(result.map((entry) => entry.hex)).toEqual(["#00ff00", "#ff0000"]);
  });

  it("caps the list", () => {
    let colors: ReturnType<typeof color>[] = [];
    for (let index = 0; index < MAX_RECENT_COLORS + 3; index++) {
      colors = addRecentColor(colors, color(`rgb(${index}, 0, 0)`));
    }
    expect(colors).toHaveLength(MAX_RECENT_COLORS);
    expect(colors[0].hex).toBe("#0a0000");
  });
});

describe("serializeRecentColors", () => {
  it("round-trips colors including alpha", () => {
    const colors = [color("#ff0000"), color("rgba(0, 0, 255, 0.5)")];
    const serialized = serializeRecentColors(colors);
    expect(JSON.parse(serialized)).toEqual(["#ff0000", "rgba(0, 0, 255, 0.5)"]);
    expect(parseRecentColors(serialized).map((entry) => entry.alpha)).toEqual([1, 0.5]);
  });

  it("deduplicates and caps the serialized list", () => {
    const colors = Array.from({ length: MAX_RECENT_COLORS + 4 }, (_, index) => color(`rgb(${index}, 0, 0)`));
    colors.push(colors[0]);
    const serialized = serializeRecentColors(colors);
    expect(JSON.parse(serialized)).toHaveLength(MAX_RECENT_COLORS);
  });
});
