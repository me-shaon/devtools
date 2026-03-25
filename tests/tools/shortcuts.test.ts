import { describe, expect, it } from "vitest";
import {
  formatShortcutBinding,
  getDefaultShortcutBindings,
  getShortcutConflict,
  isReservedShortcut,
} from "@/utils/shortcuts";

describe("shortcut utils", () => {
  it("uses platform-appropriate defaults", () => {
    expect(formatShortcutBinding(getDefaultShortcutBindings("darwin")["open-command-palette"], "darwin")).toBe("Cmd+K");
    expect(formatShortcutBinding(getDefaultShortcutBindings("win32")["open-command-palette"], "win32")).toBe("Ctrl+K");
  });

  it("detects conflicting bindings", () => {
    const bindings = getDefaultShortcutBindings("win32");
    const conflict = getShortcutConflict(bindings, bindings["open-favorite-1"]!, "go-home");

    expect(conflict).toBe("open-favorite-1");
  });

  it("blocks reserved shortcuts", () => {
    expect(isReservedShortcut({ key: "q", meta: true, ctrl: false, alt: false, shift: false }, "darwin")).toBe(true);
    expect(isReservedShortcut({ key: "r", meta: false, ctrl: true, alt: false, shift: false }, "win32")).toBe(true);
  });
});
