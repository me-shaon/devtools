import { useCallback, useMemo, useRef, useState } from "react";
import {
  RECENT_COLORS_KEY,
  addRecentColor,
  parseRecentColors,
  serializeRecentColors,
  type Color,
} from "@/utils/color";

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read(storage: Storage | null): Color[] {
  if (!storage) return [];
  try {
    return parseRecentColors(storage.getItem(RECENT_COLORS_KEY));
  } catch {
    return [];
  }
}

/**
 * Most-recent-first color history backed by local storage. Reads once on mount and writes
 * best-effort: unavailable or full storage never breaks the in-memory list.
 */
export function useRecentColors(storage?: Storage | null) {
  const store = useMemo(() => (storage === undefined ? defaultStorage() : storage), [storage]);
  const [colors, setColors] = useState<Color[]>(() => read(store));
  const colorsRef = useRef(colors);

  const add = useCallback(
    (color: Color) => {
      const next = addRecentColor(colorsRef.current, color);
      colorsRef.current = next;
      setColors(next);
      if (!store) return;
      try {
        store.setItem(RECENT_COLORS_KEY, serializeRecentColors(next));
      } catch {
        // Quota or privacy-mode failures leave the in-memory history usable.
      }
    },
    [store],
  );

  return { colors, add };
}
