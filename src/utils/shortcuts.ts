export type ShortcutActionId =
  | "open-command-palette"
  | "go-home"
  | "toggle-sidebar"
  | "open-favorite-1"
  | "open-favorite-2"
  | "open-favorite-3"
  | "open-favorite-4"
  | "open-favorite-5";

export interface ShortcutBinding {
  key: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export type ShortcutBindings = Record<ShortcutActionId, ShortcutBinding | null>;

export interface ShortcutActionDefinition {
  id: ShortcutActionId;
  label: string;
  description: string;
  group: "general" | "favorites";
}

export const SHORTCUTS_STORAGE_KEY = "devtools-shortcuts-v1";

export const SHORTCUT_ACTIONS: ShortcutActionDefinition[] = [
  {
    id: "open-command-palette",
    label: "Open Command Palette",
    description: "Search tools and open one without using the mouse.",
    group: "general",
  },
  {
    id: "go-home",
    label: "Go Home",
    description: "Return to the home screen from any tool.",
    group: "general",
  },
  {
    id: "toggle-sidebar",
    label: "Toggle Sidebar",
    description: "Show or hide the tool sidebar.",
    group: "general",
  },
  {
    id: "open-favorite-1",
    label: "Open Favorite 1",
    description: "Open the first tool in your favorites list.",
    group: "favorites",
  },
  {
    id: "open-favorite-2",
    label: "Open Favorite 2",
    description: "Open the second tool in your favorites list.",
    group: "favorites",
  },
  {
    id: "open-favorite-3",
    label: "Open Favorite 3",
    description: "Open the third tool in your favorites list.",
    group: "favorites",
  },
  {
    id: "open-favorite-4",
    label: "Open Favorite 4",
    description: "Open the fourth tool in your favorites list.",
    group: "favorites",
  },
  {
    id: "open-favorite-5",
    label: "Open Favorite 5",
    description: "Open the fifth tool in your favorites list.",
    group: "favorites",
  },
];

const DISPLAY_KEY_LABELS: Record<string, string> = {
  escape: "Esc",
  enter: "Enter",
  " ": "Space",
  space: "Space",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  "/": "/",
  ",": ",",
  ".": ".",
};

const RESERVED_SHORTCUTS = {
  darwin: new Set(["meta+q", "meta+w", "meta+r", "meta+l"]),
  default: new Set(["ctrl+r", "ctrl+l", "alt+f4"]),
};

function createBinding(
  key: string,
  modifiers: Partial<Omit<ShortcutBinding, "key">>,
): ShortcutBinding {
  return {
    key,
    meta: Boolean(modifiers.meta),
    ctrl: Boolean(modifiers.ctrl),
    alt: Boolean(modifiers.alt),
    shift: Boolean(modifiers.shift),
  };
}

function normalizePlatform(platform: string | undefined): "darwin" | "default" {
  return platform === "darwin" ? "darwin" : "default";
}

export function getDefaultShortcutBindings(platform: string | undefined): ShortcutBindings {
  const primaryModifier = normalizePlatform(platform) === "darwin" ? { meta: true } : { ctrl: true };

  return {
    "open-command-palette": createBinding("k", primaryModifier),
    "go-home": null,
    "toggle-sidebar": null,
    "open-favorite-1": createBinding("1", primaryModifier),
    "open-favorite-2": createBinding("2", primaryModifier),
    "open-favorite-3": createBinding("3", primaryModifier),
    "open-favorite-4": createBinding("4", primaryModifier),
    "open-favorite-5": createBinding("5", primaryModifier),
  };
}

export function isModifierOnlyKey(key: string): boolean {
  return ["meta", "control", "shift", "alt"].includes(key.toLowerCase());
}

export function normalizeShortcutKey(key: string): string {
  if (key === " ") {
    return "space";
  }

  return key.toLowerCase();
}

export function getShortcutIdentifier(binding: ShortcutBinding): string {
  const parts = [
    binding.meta ? "meta" : "",
    binding.ctrl ? "ctrl" : "",
    binding.alt ? "alt" : "",
    binding.shift ? "shift" : "",
    normalizeShortcutKey(binding.key),
  ].filter(Boolean);

  return parts.join("+");
}

export function areShortcutBindingsEqual(
  left: ShortcutBinding | null,
  right: ShortcutBinding | null,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return getShortcutIdentifier(left) === getShortcutIdentifier(right);
}

export function formatShortcutBinding(
  binding: ShortcutBinding | null,
  platform: string | undefined,
): string {
  if (!binding) {
    return "Unassigned";
  }

  const normalizedPlatform = normalizePlatform(platform);
  const parts: string[] = [];

  if (binding.meta) {
    parts.push(normalizedPlatform === "darwin" ? "Cmd" : "Meta");
  }

  if (binding.ctrl) {
    parts.push("Ctrl");
  }

  if (binding.alt) {
    parts.push(normalizedPlatform === "darwin" ? "Option" : "Alt");
  }

  if (binding.shift) {
    parts.push("Shift");
  }

  const normalizedKey = normalizeShortcutKey(binding.key);
  parts.push(DISPLAY_KEY_LABELS[normalizedKey] ?? normalizedKey.toUpperCase());

  return parts.join("+");
}

export function bindingFromKeyboardEvent(event: KeyboardEvent): ShortcutBinding | null {
  if (isModifierOnlyKey(event.key)) {
    return null;
  }

  return {
    key: normalizeShortcutKey(event.key),
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}

export function matchesShortcut(event: KeyboardEvent, binding: ShortcutBinding | null): boolean {
  if (!binding) {
    return false;
  }

  return (
    normalizeShortcutKey(event.key) === normalizeShortcutKey(binding.key) &&
    event.metaKey === binding.meta &&
    event.ctrlKey === binding.ctrl &&
    event.altKey === binding.alt &&
    event.shiftKey === binding.shift
  );
}

export function loadStoredShortcutBindings(
  platform: string | undefined,
  storage: Storage | undefined,
): ShortcutBindings {
  const defaults = getDefaultShortcutBindings(platform);

  if (!storage) {
    return defaults;
  }

  try {
    const rawValue = storage.getItem(SHORTCUTS_STORAGE_KEY);
    if (!rawValue) {
      return defaults;
    }

    const parsed = JSON.parse(rawValue) as Partial<Record<ShortcutActionId, ShortcutBinding | null>>;
    const merged = { ...defaults };

    for (const action of SHORTCUT_ACTIONS) {
      if (Object.prototype.hasOwnProperty.call(parsed, action.id)) {
        merged[action.id] = parsed[action.id] ?? null;
      }
    }

    return merged;
  } catch (error) {
    console.error("Failed to load shortcut bindings:", error);
    return defaults;
  }
}

export function saveShortcutBindings(storage: Storage | undefined, bindings: ShortcutBindings) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(bindings));
  } catch (error) {
    console.error("Failed to save shortcut bindings:", error);
  }
}

export function getShortcutConflict(
  bindings: ShortcutBindings,
  candidate: ShortcutBinding,
  currentActionId: ShortcutActionId,
): ShortcutActionId | null {
  for (const action of SHORTCUT_ACTIONS) {
    if (action.id === currentActionId) {
      continue;
    }

    if (areShortcutBindingsEqual(bindings[action.id], candidate)) {
      return action.id;
    }
  }

  return null;
}

export function isReservedShortcut(
  binding: ShortcutBinding,
  platform: string | undefined,
): boolean {
  const normalizedPlatform = normalizePlatform(platform);
  const identifier = getShortcutIdentifier(binding);

  return (
    RESERVED_SHORTCUTS[normalizedPlatform].has(identifier) ||
    RESERVED_SHORTCUTS.default.has(identifier)
  );
}

export function getShortcutActionDefinition(actionId: ShortcutActionId): ShortcutActionDefinition {
  const action = SHORTCUT_ACTIONS.find((entry) => entry.id === actionId);

  if (!action) {
    throw new Error(`Unknown shortcut action: ${actionId}`);
  }

  return action;
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();

  return tagName === "input" || tagName === "textarea" || tagName === "select";
}
