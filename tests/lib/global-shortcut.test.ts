import { describe, expect, it } from "vitest";
import {
  formatGlobalShortcut,
  getDefaultGlobalShortcut,
  globalShortcutFromEvent,
  loadGlobalShortcut,
  saveGlobalShortcut,
  toAccelerator,
} from "@/utils/global-shortcut";

const press = (code: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods,
});

describe("global shortcut", () => {
  it("defaults to Cmd+Shift+Space on macOS and Ctrl+Shift+Space elsewhere", () => {
    expect(toAccelerator(getDefaultGlobalShortcut("darwin"), "darwin")).toBe("Command+Shift+Space");
    expect(toAccelerator(getDefaultGlobalShortcut("win32"), "win32")).toBe("Control+Shift+Space");
    expect(formatGlobalShortcut(getDefaultGlobalShortcut("darwin"), "darwin")).toBe("Cmd+Shift+Space");
  });

  it("records the physical key, so Option+D stays D on macOS", () => {
    const shortcut = globalShortcutFromEvent(press("KeyD", { altKey: true, metaKey: true }));
    expect(toAccelerator(shortcut, "darwin")).toBe("Command+Alt+KeyD");
    expect(formatGlobalShortcut(shortcut, "darwin")).toBe("Cmd+Option+D");
  });

  it("rejects modifiers alone and keys without Cmd, Ctrl, or Alt", () => {
    expect(globalShortcutFromEvent(press("ShiftLeft", { shiftKey: true }))).toBeNull();
    expect(globalShortcutFromEvent(press("KeyA"))).toBeNull();
    expect(globalShortcutFromEvent(press("KeyA", { shiftKey: true }))).toBeNull();
    expect(globalShortcutFromEvent(press("F8"))).not.toBeNull();
  });

  it("returns no accelerator when turned off", () => {
    expect(toAccelerator({ ...getDefaultGlobalShortcut("linux"), enabled: false }, "linux")).toBeNull();
  });

  it("persists the setting and falls back to the default for bad data", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } as unknown as Storage;
    saveGlobalShortcut(storage, { ...getDefaultGlobalShortcut("darwin"), code: "KeyK", enabled: false });
    expect(loadGlobalShortcut(storage, "darwin")).toMatchObject({ code: "KeyK", enabled: false });
    store.set("devtools-global-shortcut-v1", "{not json");
    expect(loadGlobalShortcut(storage, "darwin")).toEqual(getDefaultGlobalShortcut("darwin"));
  });
});
