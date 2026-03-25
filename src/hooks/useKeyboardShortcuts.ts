import { useEffect } from "react";
import {
  isEditableElement,
  matchesShortcut,
  type ShortcutActionId,
  type ShortcutBindings,
} from "@/utils/shortcuts";

interface UseKeyboardShortcutsOptions {
  bindings: ShortcutBindings;
  handlers: Partial<Record<ShortcutActionId, () => void>>;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  bindings,
  handlers,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) {
        return;
      }

      for (const [actionId, binding] of Object.entries(bindings) as Array<
        [ShortcutActionId, ShortcutBindings[ShortcutActionId]]
      >) {
        if (!matchesShortcut(event, binding)) {
          continue;
        }

        const handler = handlers[actionId];
        if (!handler) {
          continue;
        }

        event.preventDefault();
        event.stopPropagation();
        handler();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [bindings, enabled, handlers]);
}
