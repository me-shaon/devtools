/**
 * The system-wide shortcut that brings DevTools up with the command palette open.
 * It records KeyboardEvent.code (for example "KeyD"), not .key: on macOS, Option+D reports
 * "∂" as the key, which is not a valid shortcut. The Rust side parses the code names directly.
 */
export interface GlobalShortcut {
  enabled: boolean;
  code: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export const GLOBAL_SHORTCUT_STORAGE_KEY = "devtools-global-shortcut-v1";

const MODIFIER_CODES = new Set([
  "MetaLeft", "MetaRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "CapsLock", "Fn",
]);

/**
 * Ctrl+Shift+Space on every platform. On macOS, Cmd+Shift+Space belongs to 1Password Quick
 * Access, Cmd+Space to Spotlight, and Option+Space to Raycast, Alfred, and ChatGPT.
 */
export function getDefaultGlobalShortcut(_platform?: string): GlobalShortcut {
  return { enabled: true, code: "Space", meta: false, ctrl: true, alt: false, shift: true };
}

/** Builds a shortcut from a key press. Returns null for a modifier alone or without a real modifier. */
export function globalShortcutFromEvent(event: Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): GlobalShortcut | null {
  if (!event.code || MODIFIER_CODES.has(event.code)) return null;
  // Shift alone would take over normal typing everywhere, so require Cmd, Ctrl, or Alt/Option.
  const isFunctionKey = /^F\d{1,2}$/.test(event.code);
  if (!isFunctionKey && !event.metaKey && !event.ctrlKey && !event.altKey) return null;
  return { enabled: true, code: event.code, meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey };
}

/** The accelerator string for the Rust global-shortcut plugin, or null when turned off. */
export function toAccelerator(shortcut: GlobalShortcut | null, platform: string | undefined): string | null {
  if (!shortcut?.enabled || !shortcut.code) return null;
  const parts = [
    shortcut.meta ? (platform === "darwin" ? "Command" : "Super") : "",
    shortcut.ctrl ? "Control" : "",
    shortcut.alt ? "Alt" : "",
    shortcut.shift ? "Shift" : "",
    shortcut.code,
  ].filter(Boolean);
  return parts.join("+");
}

const KEY_LABELS: Record<string, string> = {
  Space: "Space", Comma: ",", Period: ".", Slash: "/", Backslash: "\\", Semicolon: ";", Quote: "'",
  BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Backquote: "`",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Enter: "Enter", Escape: "Esc", Tab: "Tab",
};

/** A readable label such as "Cmd+Shift+Space" or "Ctrl+Alt+D". */
export function formatGlobalShortcut(shortcut: GlobalShortcut | null, platform: string | undefined): string {
  if (!shortcut) return "Not set";
  const mac = platform === "darwin";
  const key = KEY_LABELS[shortcut.code] ?? shortcut.code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ");
  return [
    shortcut.meta ? (mac ? "Cmd" : "Win") : "",
    shortcut.ctrl ? "Ctrl" : "",
    shortcut.alt ? (mac ? "Option" : "Alt") : "",
    shortcut.shift ? "Shift" : "",
    key,
  ].filter(Boolean).join("+");
}

export function loadGlobalShortcut(storage: Storage | undefined, platform: string | undefined): GlobalShortcut {
  try {
    const stored = JSON.parse(storage?.getItem(GLOBAL_SHORTCUT_STORAGE_KEY) ?? "null");
    if (stored && typeof stored.code === "string" && typeof stored.enabled === "boolean") {
      return { ...getDefaultGlobalShortcut(platform), ...stored };
    }
  } catch {
    // Fall back to the default below.
  }
  return getDefaultGlobalShortcut(platform);
}

export function saveGlobalShortcut(storage: Storage | undefined, shortcut: GlobalShortcut) {
  try {
    storage?.setItem(GLOBAL_SHORTCUT_STORAGE_KEY, JSON.stringify(shortcut));
  } catch {
    // The setting still applies for this session.
  }
}
