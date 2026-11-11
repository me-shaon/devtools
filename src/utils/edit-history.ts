export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export interface KeyInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** True when the OS command key is down: Cmd on macOS, Ctrl on Windows and Linux. */
export function hasCommandKey(event: KeyInput, mac = isMac): boolean {
  return !event.altKey && (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);
}

/**
 * Undo or redo for a key press. Undo is Cmd+Z on macOS and Ctrl+Z on Windows and Linux.
 * Redo is Shift+Cmd+Z on macOS, and Ctrl+Y or Ctrl+Shift+Z on Windows and Linux.
 * Keys with Alt are left alone, because AltGr on Windows sends Ctrl+Alt.
 */
export function historyCommand(event: KeyInput, mac = isMac): "undo" | "redo" | null {
  if (!hasCommandKey(event, mac)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !mac && !event.shiftKey) return "redo";
  return null;
}

/** The text and the selection of an editor at one time. */
export interface EditorState {
  value: string;
  start: number;
  end: number;
}

/**
 * Undo and redo history for a text editor. The editor records the state before each change.
 * Typing merges into one step until the user pauses or `breakGroup` is called.
 */
export class EditHistory {
  private undoStack: EditorState[] = [];
  private redoStack: EditorState[] = [];
  private lastTyping = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly limit = 200,
    private readonly pauseMs = 1000,
  ) {}

  /** Saves the state before a change. A change from typing merges with typing just before it. */
  record(before: EditorState, typing: boolean, now = Date.now()) {
    this.redoStack = [];
    if (typing && now - this.lastTyping < this.pauseMs) {
      this.lastTyping = now;
      return;
    }
    this.undoStack.push(before);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.lastTyping = typing ? now : Number.NEGATIVE_INFINITY;
  }

  /** Starts a new undo step for the next typing, for example after the caret moves. */
  breakGroup() {
    this.lastTyping = Number.NEGATIVE_INFINITY;
  }

  /** The state to go back to, or null when there is nothing to undo. */
  undo(current: EditorState): EditorState | null {
    const state = this.undoStack.pop();
    if (!state) return null;
    this.redoStack.push(current);
    this.breakGroup();
    return state;
  }

  /** The state to go forward to, or null when there is nothing to redo. */
  redo(current: EditorState): EditorState | null {
    const state = this.redoStack.pop();
    if (!state) return null;
    this.undoStack.push(current);
    this.breakGroup();
    return state;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }
}
