import { describe, expect, it } from "vitest";
import { EditHistory, historyCommand } from "@/utils/edit-history";

const state = (value: string) => ({ value, start: value.length, end: value.length });

describe("EditHistory", () => {
  it("undoes and redoes changes", () => {
    const history = new EditHistory();
    history.record(state(""), false);
    history.record(state("a"), false);
    expect(history.undo(state("ab"))).toEqual(state("a"));
    expect(history.undo(state("a"))).toEqual(state(""));
    expect(history.undo(state(""))).toBeNull();
    expect(history.redo(state(""))).toEqual(state("a"));
    expect(history.redo(state("a"))).toEqual(state("ab"));
    expect(history.canRedo).toBe(false);
  });

  it("merges typing until a pause", () => {
    const history = new EditHistory(200, 1000);
    history.record(state(""), true, 0);
    history.record(state("a"), true, 300);
    history.record(state("ab"), true, 600);
    history.record(state("abc"), true, 2000);
    expect(history.undo(state("abcd"))).toEqual(state("abc"));
    expect(history.undo(state("abc"))).toEqual(state(""));
  });

  it("starts a new step after breakGroup", () => {
    const history = new EditHistory();
    history.record(state(""), true, 0);
    history.breakGroup();
    history.record(state("a"), true, 10);
    expect(history.undo(state("ab"))).toEqual(state("a"));
  });

  it("clears redo after a new change", () => {
    const history = new EditHistory();
    history.record(state(""), false);
    history.undo(state("a"));
    history.record(state(""), false);
    expect(history.canRedo).toBe(false);
  });
});

describe("historyCommand", () => {
  const key = (key: string, extra: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...extra,
  });

  it("uses Cmd+Z and Shift+Cmd+Z on macOS", () => {
    expect(historyCommand(key("z", { metaKey: true }), true)).toBe("undo");
    expect(historyCommand(key("Z", { metaKey: true, shiftKey: true }), true)).toBe("redo");
    expect(historyCommand(key("y", { metaKey: true }), true)).toBeNull();
    expect(historyCommand(key("z", { ctrlKey: true }), true)).toBeNull();
  });

  it("uses Ctrl+Z, Ctrl+Y, and Ctrl+Shift+Z on Windows and Linux", () => {
    expect(historyCommand(key("z", { ctrlKey: true }), false)).toBe("undo");
    expect(historyCommand(key("y", { ctrlKey: true }), false)).toBe("redo");
    expect(historyCommand(key("Z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo");
    expect(historyCommand(key("z", { metaKey: true }), false)).toBeNull();
    expect(historyCommand(key("z", { ctrlKey: true, altKey: true }), false)).toBeNull();
  });
});
