import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { requestHistory, type HistoryAvailability } from "@/hooks/useTextHistory";
import type { EditorState } from "@/utils/edit-history";
import { activeFormats, canIndent, continueList, editorCommand, formatMarkdown, indentLines, type EditorCommand, type MarkdownEdit } from "@/utils/markdown-format";

export type ToolbarCommand = Exclude<EditorCommand, "indent" | "outdent" | "newline">;

/**
 * Editing for the Markdown text area: formatting, keyboard shortcuts, and the formats at the
 * selection. The undo history lives in CodeTextarea, which records each change of the value.
 */
export function useMarkdownEditor(value: string, setValue: (value: string) => void) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const [history, setHistory] = useState<HistoryAvailability>({ canUndo: false, canRedo: false });
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const track = (start: number, end: number) => {
    setSelection((current) => (current.start === start && current.end === end ? current : { start, end }));
  };

  const current = (): EditorState | null => {
    const textarea = editor.current;
    return textarea ? { value: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd } : null;
  };

  /** Shows a state in the text area. The text area changes first, so React sees no difference. */
  const show = (state: EditorState) => {
    const textarea = editor.current;
    if (!textarea) return;
    textarea.value = state.value;
    setValue(state.value);
    textarea.focus();
    textarea.setSelectionRange(state.start, state.end);
    track(state.start, state.end);
  };

  const applyEdit = (edit: MarkdownEdit) => {
    const before = current();
    if (!before) return;
    show({
      value: before.value.slice(0, edit.start) + edit.insert + before.value.slice(edit.end),
      start: edit.selectStart,
      end: edit.selectEnd,
    });
  };

  const run = (command: ToolbarCommand) => {
    const state = current();
    if (!state) return;
    if (command === "undo" || command === "redo") {
      if (editor.current) requestHistory(editor.current, command);
      return;
    }
    applyEdit(formatMarkdown(state, command));
  };

  // The text area can mount again (for example when the layout changes), so listen on the
  // document and check the target. selectionchange also reports selections set from code.
  useEffect(() => {
    const isEditor = (target: EventTarget | null) => target !== null && target === editor.current;
    const onSelection = (event: Event) => {
      if (event.type !== "selectionchange" && !isEditor(event.target)) return;
      const textarea = editor.current;
      if (!textarea) return;
      track(textarea.selectionStart, textarea.selectionEnd);
    };
    const events = ["selectionchange", "select", "keyup", "mouseup", "focusin"];
    for (const type of events) document.addEventListener(type, onSelection, true);
    return () => {
      for (const type of events) document.removeEventListener(type, onSelection, true);
    };
  }, []);

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
    track(event.target.selectionStart, event.target.selectionEnd);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    const command = editorCommand(event);
    const state = current();
    // CodeTextarea handles the undo and redo keys
    if (!command || !state || command === "undo" || command === "redo") return;

    if (command === "newline") {
      const edit = continueList(state);
      if (!edit) return;
      event.preventDefault();
      applyEdit(edit);
    } else if (command === "indent" || command === "outdent") {
      // Tab outside a list moves the focus, so keyboard users can leave the editor
      if (!canIndent(state)) return;
      event.preventDefault();
      applyEdit(indentLines(state, command === "outdent"));
    } else {
      event.preventDefault();
      run(command);
    }
  };

  /** Replaces all text as one undo step, for example for Clear. */
  const replaceAll = (next: string) => {
    applyEdit({ start: 0, end: value.length, insert: next, selectStart: 0, selectEnd: 0 });
  };

  const active = useMemo(() => {
    const start = Math.min(selection.start, value.length);
    return activeFormats({ value, start, end: Math.max(start, Math.min(selection.end, value.length)) });
  }, [value, selection]);

  return {
    editor,
    active,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    run,
    replaceAll,
    textareaProps: { ref: editor, onChange, onKeyDown, onHistoryChange: setHistory },
  };
}
