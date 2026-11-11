import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { EditHistory, historyCommand, type EditorState } from "@/utils/edit-history";

export interface HistoryAvailability {
  canUndo: boolean;
  canRedo: boolean;
}

interface Options {
  /** Off for read-only fields and fields that the app does not control. */
  enabled?: boolean;
  onAvailabilityChange?: (availability: HistoryAvailability) => void;
}

/** Asks a text area with a history to undo or redo, as the Edit menu does. */
export function requestHistory(textarea: HTMLTextAreaElement, command: "undo" | "redo") {
  textarea.focus();
  textarea.dispatchEvent(new InputEvent("beforeinput", { inputType: command === "undo" ? "historyUndo" : "historyRedo", bubbles: true, cancelable: true }));
}

// React reads changes through the native value setter, so a value set this way reaches onChange
const setNativeValue = (textarea: HTMLTextAreaElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
};

const TYPING = /^(?:insertText|insertCompositionText|insertLineBreak|insertParagraph|delete(?:Content|Word|SoftLine|HardLine))/;

/**
 * Undo and redo for a controlled text area.
 *
 * The browser's own history loses every change that the app makes from code (Clear, Paste,
 * Format, a sample), and WebKit does not run `execCommand("undo")`. This history records
 * each change of `value`, whatever made it, and handles the undo and redo keys for the OS,
 * the Edit menu, and `requestHistory`.
 */
export function useTextHistory(textareaRef: RefObject<HTMLTextAreaElement>, value: unknown, { enabled = true, onAvailabilityChange }: Options = {}) {
  const active = enabled && typeof value === "string";
  const history = useRef(new EditHistory());
  // The last value and selection that the app has seen. A change is recorded from this state.
  const stable = useRef<EditorState>({ value: typeof value === "string" ? value : "", start: 0, end: 0 });
  // Set between beforeinput and the change it causes
  const pending = useRef<{ typing: boolean; start: number; end: number } | null>(null);
  // The value that undo or redo sets, so that change is not recorded again
  const restoring = useRef<EditorState | null>(null);
  const availability = useRef<HistoryAvailability>({ canUndo: false, canRedo: false });
  const notify = useRef(onAvailabilityChange);
  notify.current = onAvailabilityChange;

  const report = () => {
    const next = { canUndo: history.current.canUndo, canRedo: history.current.canRedo };
    if (next.canUndo === availability.current.canUndo && next.canRedo === availability.current.canRedo) return;
    availability.current = next;
    notify.current?.(next);
  };

  // Record each change of the value, after React has rendered it
  useLayoutEffect(() => {
    if (!active || value === stable.current.value) return;
    const textarea = textareaRef.current;
    const restored = restoring.current;
    restoring.current = null;
    if (restored && restored.value === value) {
      textarea?.setSelectionRange(restored.start, restored.end);
    } else {
      const input = pending.current;
      const before = input ? { value: stable.current.value, start: input.start, end: input.end } : stable.current;
      history.current.record(before, input?.typing ?? false);
    }
    pending.current = null;
    stable.current = {
      value: value as string,
      start: textarea?.selectionStart ?? 0,
      end: textarea?.selectionEnd ?? 0,
    };
    report();
  });

  // Listen on the current element. It can change without this hook mounting again, for
  // example when a pane layout mounts the text area again.
  const attached = useRef<{ textarea: HTMLTextAreaElement; detach: () => void } | null>(null);
  useEffect(() => () => attached.current?.detach(), []);
  useEffect(() => {
    const textarea = active ? textareaRef.current : null;
    if (attached.current?.textarea === textarea) return;
    attached.current?.detach();
    attached.current = null;
    if (!textarea) return;

    const run = (command: "undo" | "redo") => {
      const current = { value: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd };
      const next = command === "undo" ? history.current.undo(current) : history.current.redo(current);
      report();
      if (!next) return;
      restoring.current = next;
      setNativeValue(textarea, next.value);
      textarea.setSelectionRange(next.start, next.end);
    };

    const onSelection = () => {
      // Skip the moment between a change and its render
      if (textarea.value !== stable.current.value) return;
      // No change followed the last beforeinput, for example a rejected key
      pending.current = null;
      stable.current = { value: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd };
    };
    const onSelectionChange = () => {
      if (document.activeElement === textarea) onSelection();
    };
    const onMouseUp = () => {
      // Moving the caret with the mouse starts a new undo step
      history.current.breakGroup();
      onSelection();
    };
    const onBeforeInput = (event: Event) => {
      const { inputType } = event as InputEvent;
      if (inputType === "historyUndo" || inputType === "historyRedo") {
        event.preventDefault();
        run(inputType === "historyUndo" ? "undo" : "redo");
        return;
      }
      pending.current = { typing: TYPING.test(inputType ?? ""), start: textarea.selectionStart, end: textarea.selectionEnd };
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const command = historyCommand(event);
      if (!command) return;
      // Also when the history is empty, so the browser does not undo to a state the app never had
      event.preventDefault();
      run(command);
    };

    textarea.addEventListener("beforeinput", onBeforeInput);
    textarea.addEventListener("keydown", onKeyDown);
    textarea.addEventListener("keyup", onSelection);
    textarea.addEventListener("select", onSelection);
    textarea.addEventListener("focus", onSelection);
    textarea.addEventListener("mouseup", onMouseUp);
    document.addEventListener("selectionchange", onSelectionChange);
    const detach = () => {
      textarea.removeEventListener("beforeinput", onBeforeInput);
      textarea.removeEventListener("keydown", onKeyDown);
      textarea.removeEventListener("keyup", onSelection);
      textarea.removeEventListener("select", onSelection);
      textarea.removeEventListener("focus", onSelection);
      textarea.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
    attached.current = { textarea, detach };
  });
}
