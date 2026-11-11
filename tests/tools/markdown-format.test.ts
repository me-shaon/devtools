import { describe, expect, it } from "vitest";
import { activeFormats, canIndent, continueList, editorCommand, formatMarkdown, indentLines, type MarkdownEdit, type MarkdownFormat } from "@/utils/markdown-format";

/** Applies a format to text where ‹ and › mark the selection, and returns the result marked the same way. */
const format = (marked: string, kind: MarkdownFormat) => {
  const start = marked.indexOf("‹");
  const end = marked.indexOf("›") - 1;
  const value = marked.replace("‹", "").replace("›", "");
  const edit = formatMarkdown({ value, start, end }, kind);
  const next = value.slice(0, edit.start) + edit.insert + value.slice(edit.end);
  return next.slice(0, edit.selectStart) + "‹" + next.slice(edit.selectStart, edit.selectEnd) + "›" + next.slice(edit.selectEnd);
};

describe("formatMarkdown", () => {
  it("wraps the selection in inline markers", () => {
    expect(format("say ‹hello› now", "bold")).toBe("say **‹hello›** now");
    expect(format("say ‹hello› now", "italic")).toBe("say _‹hello›_ now");
    expect(format("say ‹hello› now", "strikethrough")).toBe("say ~~‹hello›~~ now");
    expect(format("say ‹hello› now", "code")).toBe("say `‹hello›` now");
  });

  it("inserts a selected placeholder when nothing is selected", () => {
    expect(format("a ‹›b", "bold")).toBe("a **‹bold text›**b");
  });

  it("removes inline markers that are already there", () => {
    expect(format("say **‹hello›** now", "bold")).toBe("say ‹hello› now");
    expect(format("say ‹**hello**› now", "bold")).toBe("say ‹hello› now");
  });

  it("puts a selection over more than one line in a code block", () => {
    expect(format("x\n‹a\nb›\ny", "code")).toBe("x\n```\n‹a\nb›\n```\ny");
  });

  it("cycles the heading level", () => {
    expect(format("ti‹›tle", "heading")).toBe("# title‹›");
    expect(format("# ti‹›tle", "heading")).toBe("## title‹›");
    expect(format("### ti‹›tle", "heading")).toBe("title‹›");
  });

  it("toggles list prefixes on each selected line", () => {
    expect(format("‹one\ntwo›", "bullet-list")).toBe("‹- one\n- two›");
    expect(format("‹- one\n- two›", "bullet-list")).toBe("‹one\ntwo›");
    expect(format("‹one\ntwo›", "numbered-list")).toBe("‹1. one\n2. two›");
    expect(format("‹- one\n- two›", "task-list")).toBe("‹- [ ] one\n- [ ] two›");
    expect(format("‹- [ ] one›", "task-list")).toBe("‹one›");
  });

  it("toggles a quote", () => {
    expect(format("‹a\nb›", "quote")).toBe("‹> a\n> b›");
    expect(format("‹> a\n> b›", "quote")).toBe("‹a\nb›");
  });

  it("selects the URL of a new link, or the text when the selection is a URL", () => {
    expect(format("‹docs›", "link")).toBe("[docs](‹https://›)");
    expect(format("‹https://x.dev›", "link")).toBe("[‹link text›](https://x.dev)");
    expect(format("‹›", "image")).toBe("![alt text](‹https://›)");
  });

  it("inserts a table with blank lines around it", () => {
    expect(format("text‹›", "table")).toBe("text\n\n| ‹Column 1› | Column 2 |\n| -------- | -------- |\n| Cell     | Cell     |\n");
  });
});

describe("removing a format from the caret position", () => {
  it("removes inline markers around the caret", () => {
    expect(format("say **he‹›llo** now", "bold")).toBe("say he‹›llo now");
    expect(format("a _it‹al›ic_ b", "italic")).toBe("a it‹al›ic b");
    expect(format("a ~~x‹›~~ b", "strikethrough")).toBe("a x‹› b");
    expect(format("run `np‹›m`", "code")).toBe("run np‹›m");
  });

  it("removes a link or an image and keeps the text", () => {
    expect(format("see [do‹›cs](https://x.dev) now", "link")).toBe("see do‹›cs now");
    expect(format("![lo‹›go](a.png)", "image")).toBe("lo‹›go");
  });
});

/** The active formats for text where ‹ and › mark the selection. */
const active = (marked: string) => {
  const start = marked.indexOf("‹");
  const end = marked.indexOf("›") - 1;
  return [...activeFormats({ value: marked.replace("‹", "").replace("›", ""), start, end })].sort();
};

describe("activeFormats", () => {
  it("finds inline formats around the selection", () => {
    expect(active("say **he‹›llo** now")).toEqual(["bold"]);
    expect(active("**bold _bo‹th_**›")).toEqual(["bold"]);
    expect(active("**bold _bo‹›th_**")).toEqual(["bold", "italic"]);
    expect(active("~~gone~~ and `co‹de`›")).toEqual(["code"]);
    expect(active("~~go‹›ne~~")).toEqual(["strikethrough"]);
    expect(active("[link](u) ![im‹›g](u)")).toEqual(["image"]);
    expect(active("[li‹›nk](u)")).toEqual(["link"]);
  });

  it("does not read snake_case or a bold marker as italic", () => {
    expect(active("snake_ca‹›se_name")).toEqual([]);
    expect(active("**‹›bold**")).toEqual(["bold"]);
  });

  it("finds line formats when every selected line has them", () => {
    expect(active("## Ti‹›tle")).toEqual(["heading"]);
    expect(active("‹- a\n- b›")).toEqual(["bullet-list"]);
    expect(active("‹- a\nb›")).toEqual([]);
    expect(active("1. o‹›ne")).toEqual(["numbered-list"]);
    expect(active("- [x] do‹›ne")).toEqual(["task-list"]);
    expect(active("> - quo‹›ted")).toEqual(["quote"]);
  });
});

describe("editorCommand", () => {
  const key = (key: string, extra: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...extra,
  });

  it("uses Cmd on macOS", () => {
    expect(editorCommand(key("z", { metaKey: true }), true)).toBe("undo");
    expect(editorCommand(key("Z", { metaKey: true, shiftKey: true }), true)).toBe("redo");
    expect(editorCommand(key("y", { metaKey: true }), true)).toBeNull();
    expect(editorCommand(key("b", { metaKey: true }), true)).toBe("bold");
    expect(editorCommand(key("x", { metaKey: true, shiftKey: true }), true)).toBe("strikethrough");
    // Ctrl+B moves the caret back one character on macOS
    expect(editorCommand(key("b", { ctrlKey: true }), true)).toBeNull();
  });

  it("uses Ctrl on Windows and Linux", () => {
    expect(editorCommand(key("z", { ctrlKey: true }), false)).toBe("undo");
    expect(editorCommand(key("y", { ctrlKey: true }), false)).toBe("redo");
    expect(editorCommand(key("Z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo");
    expect(editorCommand(key("k", { ctrlKey: true }), false)).toBe("link");
    expect(editorCommand(key("b", { metaKey: true }), false)).toBeNull();
  });

  it("leaves AltGr and unknown keys alone", () => {
    expect(editorCommand(key("z", { ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(editorCommand(key("q", { ctrlKey: true }), false)).toBeNull();
    expect(editorCommand(key("a"), false)).toBeNull();
  });

  it("maps Enter and Tab without modifiers", () => {
    expect(editorCommand(key("Enter"), true)).toBe("newline");
    expect(editorCommand(key("Enter", { shiftKey: true }), true)).toBeNull();
    expect(editorCommand(key("Tab"), false)).toBe("indent");
    expect(editorCommand(key("Tab", { shiftKey: true }), false)).toBe("outdent");
  });
});

/** Applies an edit to text where ‹ and › mark the selection. Returns null when there is no edit. */
const applyMarked = (marked: string, makeEdit: (selection: { value: string; start: number; end: number }) => MarkdownEdit | null) => {
  const start = marked.indexOf("‹");
  const end = marked.indexOf("›") - 1;
  const value = marked.replace("‹", "").replace("›", "");
  const edit = makeEdit({ value, start, end });
  if (!edit) return null;
  const next = value.slice(0, edit.start) + edit.insert + value.slice(edit.end);
  return next.slice(0, edit.selectStart) + "‹" + next.slice(edit.selectStart, edit.selectEnd) + "›" + next.slice(edit.selectEnd);
};

describe("continueList", () => {
  it("continues list items and quotes on Enter", () => {
    expect(applyMarked("- one‹›", continueList)).toBe("- one\n- ‹›");
    expect(applyMarked("  * one‹›", continueList)).toBe("  * one\n  * ‹›");
    expect(applyMarked("9. nine‹›", continueList)).toBe("9. nine\n10. ‹›");
    expect(applyMarked("- [x] done‹›", continueList)).toBe("- [x] done\n- [ ] ‹›");
    expect(applyMarked("> said‹›", continueList)).toBe("> said\n> ‹›");
  });

  it("ends the list on an empty item", () => {
    expect(applyMarked("- one\n- ‹›", continueList)).toBe("- one\n‹›");
  });

  it("inserts a plain line break elsewhere", () => {
    expect(applyMarked("text‹›", continueList)).toBeNull();
    expect(applyMarked("-‹› one", continueList)).toBeNull();
    expect(applyMarked("- ‹one›", continueList)).toBeNull();
  });
});

describe("indentLines", () => {
  it("indents and outdents the selected lines", () => {
    expect(applyMarked("- o‹›ne", (s) => indentLines(s, false))).toBe("  - o‹›ne");
    expect(applyMarked("  - o‹›ne", (s) => indentLines(s, true))).toBe("- o‹›ne");
    expect(applyMarked("‹a\nb›", (s) => indentLines(s, false))).toBe("  ‹a\n  b›");
  });

  it("indents only list items or text over more than one line", () => {
    expect(canIndent({ value: "- one", start: 2, end: 2 })).toBe(true);
    expect(canIndent({ value: "a\nb", start: 0, end: 3 })).toBe(true);
    expect(canIndent({ value: "plain", start: 2, end: 2 })).toBe(false);
  });
});
