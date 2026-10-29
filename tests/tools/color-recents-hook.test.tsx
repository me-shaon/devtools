import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRecentColors } from "@/hooks/useRecentColors";
import { useColorStudio } from "@/hooks/useColorStudio";
import {
  MAX_RECENT_COLORS,
  RECENT_COLORS_KEY,
  parseColor,
  serializeRecentColors,
  type Color,
} from "@/utils/color";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }

  clear() {
    this.data.clear();
  }

  getItem(key: string) {
    return this.data.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }

  seed(key: string, value: string) {
    this.data.set(key, value);
  }
}

const red = parseColor("#ff0000") as Color;
const green = parseColor("#00ff00") as Color;
const translucent = parseColor("#0000ff80") as Color;

describe("useRecentColors", () => {
  it("restores the saved list on mount", () => {
    const storage = new MemoryStorage();
    storage.seed(RECENT_COLORS_KEY, serializeRecentColors([red, green]));
    const { result } = renderHook(() => useRecentColors(storage));
    expect(result.current.colors.map((color) => color.hex)).toEqual(["#ff0000", "#00ff00"]);
  });

  it("starts empty for malformed data", () => {
    const storage = new MemoryStorage();
    storage.seed(RECENT_COLORS_KEY, "{not json");
    const { result } = renderHook(() => useRecentColors(storage));
    expect(result.current.colors).toEqual([]);
  });

  it("starts empty when reading throws", () => {
    const storage = new MemoryStorage();
    storage.getItem = () => {
      throw new Error("denied");
    };
    const { result } = renderHook(() => useRecentColors(storage));
    expect(result.current.colors).toEqual([]);
  });

  it("works without storage", () => {
    const { result } = renderHook(() => useRecentColors(null));
    act(() => result.current.add(red));
    expect(result.current.colors.map((color) => color.hex)).toEqual(["#ff0000"]);
  });

  it("writes new entries and preserves alpha", () => {
    const storage = new MemoryStorage();
    const { result } = renderHook(() => useRecentColors(storage));
    act(() => result.current.add(translucent));
    expect(storage.getItem(RECENT_COLORS_KEY)).toBe(serializeRecentColors([translucent]));
    expect(result.current.colors[0].alpha).toBeCloseTo(0.502, 3);
  });

  it("moves a duplicate to the front without duplicating", () => {
    const storage = new MemoryStorage();
    const { result } = renderHook(() => useRecentColors(storage));
    act(() => result.current.add(red));
    act(() => result.current.add(green));
    act(() => result.current.add(red));
    expect(result.current.colors.map((color) => color.hex)).toEqual(["#ff0000", "#00ff00"]);
  });

  it("caps the list", () => {
    const { result } = renderHook(() => useRecentColors(null));
    for (let i = 0; i < MAX_RECENT_COLORS + 3; i++) {
      const hex = `#${(i + 1).toString(16).padStart(2, "0").repeat(3)}`;
      act(() => result.current.add(parseColor(hex)!));
    }
    expect(result.current.colors).toHaveLength(MAX_RECENT_COLORS);
    expect(result.current.colors[0].hex).toBe(`#${(MAX_RECENT_COLORS + 3).toString(16).padStart(2, "0").repeat(3)}`);
  });

  it("keeps the in-memory list when writing throws", () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new Error("quota");
    };
    const { result } = renderHook(() => useRecentColors(storage));
    act(() => result.current.add(red));
    expect(result.current.colors.map((color) => color.hex)).toEqual(["#ff0000"]);
  });

  it("records commits from the studio but not keystrokes", () => {
    const { result } = renderHook(() => {
      const recents = useRecentColors(null);
      const studio = useColorStudio({ onCommit: recents.add });
      return { recents, studio };
    });

    act(() => result.current.studio.setHexDraft("rebeccapurple"));
    expect(result.current.recents.colors).toHaveLength(0);

    act(() => result.current.studio.commit());
    expect(result.current.recents.colors.map((color) => color.hex)).toEqual(["#663399"]);

    act(() => result.current.studio.applyColor(red));
    expect(result.current.recents.colors.map((color) => color.hex)).toEqual(["#ff0000", "#663399"]);
  });
});
