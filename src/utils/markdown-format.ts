import { hasCommandKey, historyCommand, isMac, type KeyInput } from "@/utils/edit-history";

/**
 * Formatting actions for the Markdown editor. Each action reads the text and the selection
 * and returns one edit: replace `start`..`end` with `insert`, then select `selectStart`..`selectEnd`.
 * One edit per action keeps each action as one step in the editor's undo history.
 */

export interface Selection {
  value: string;
  start: number;
  end: number;
}

export interface MarkdownEdit {
  start: number;
  end: number;
  insert: string;
  selectStart: number;
  selectEnd: number;
}

export type MarkdownFormat = "bold" | "italic" | "strikethrough" | "code" | "heading" | "quote" | "bullet-list" | "numbered-list" | "task-list" | "link" | "image" | "table";

const INLINE: Record<"bold" | "italic" | "strikethrough" | "code", { marker: string; placeholder: string }> = {
  bold: { marker: "**", placeholder: "bold text" },
  italic: { marker: "_", placeholder: "italic text" },
  strikethrough: { marker: "~~", placeholder: "strikethrough text" },
  code: { marker: "`", placeholder: "code" },
};

const URL_LIKE = /^(?:https?:\/\/|mailto:|\.{0,2}\/)\S*$/i;

interface Span {
  start: number;
  end: number;
  /** Characters before the inner text. */
  open: number;
  /** Characters after the inner text. */
  close: number;
}

// Spans on one line. Bold before italic, so ** is not read as two italic markers.
const SPAN_PATTERNS: Record<"bold" | "italic" | "strikethrough" | "code" | "link" | "image", RegExp> = {
  bold: /(\*\*|__)(?=\S)[^\n]*?\S\1/g,
  // _ does not work inside a word (snake_case). A single * is not part of a ** marker.
  italic: /(?<![\\\w_])_(?![_\s])[^\n]*?[^\s_\\]_(?![_\w])|(?<![\\*])\*(?![*\s])[^\n]*?[^\s*\\]\*(?!\*)/g,
  strikethrough: /~~(?=\S)[^\n]*?\S~~/g,
  code: /`[^`\n]+`/g,
  link: /(?<!!)\[[^\]\n]*\]\([^)\n]*\)/g,
  image: /!\[[^\]\n]*\]\([^)\n]*\)/g,
};

const MARKER_SIZE = { bold: 2, italic: 1, strikethrough: 2, code: 1 } as const;

/** The span of the format that holds the whole selection, if any. Only spans on one line count. */
function enclosingSpan({ value, start, end }: Selection, format: keyof typeof SPAN_PATTERNS): Span | null {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const next = value.indexOf("\n", start);
  const lineEnd = next === -1 ? value.length : next;
  if (end > lineEnd) return null;
  for (const match of value.slice(lineStart, lineEnd).matchAll(SPAN_PATTERNS[format])) {
    const spanStart = lineStart + match.index;
    const spanEnd = spanStart + match[0].length;
    if (spanStart <= start && end <= spanEnd) {
      if (format === "link" || format === "image") {
        const open = format === "image" ? 2 : 1;
        const text = match[0].slice(open, match[0].indexOf("]"));
        return { start: spanStart, end: spanEnd, open, close: match[0].length - open - text.length };
      }
      return { start: spanStart, end: spanEnd, open: MARKER_SIZE[format], close: MARKER_SIZE[format] };
    }
  }
  return null;
}

/** Removes the markers of a span and keeps the selection on the same characters. */
function unwrap({ value, start, end }: Selection, span: Span): MarkdownEdit {
  const inner = value.slice(span.start + span.open, span.end - span.close);
  const map = (position: number) => Math.min(Math.max(position - span.open, span.start), span.start + inner.length);
  return { start: span.start, end: span.end, insert: inner, selectStart: map(start), selectEnd: map(end) };
}

/** Adds the marker around the selection, or removes it when the selection is in a span of the format. */
function toggleInline(selection: Selection, format: keyof typeof MARKER_SIZE): MarkdownEdit {
  const span = enclosingSpan(selection, format);
  if (span) return unwrap(selection, span);

  const { value, start, end } = selection;
  const { marker, placeholder } = INLINE[format];
  const selected = value.slice(start, end);
  const size = marker.length;
  // The selection includes markers that the span patterns do not match, such as "** a **"
  if (selected.length >= size * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(size, -size);
    return { start, end, insert: inner, selectStart: start, selectEnd: start + inner.length };
  }

  const text = selected || placeholder;
  return { start, end, insert: `${marker}${text}${marker}`, selectStart: start + size, selectEnd: start + size + text.length };
}

/** Puts a selection over more than one line in a fenced code block. */
function codeBlock({ value, start, end }: Selection): MarkdownEdit {
  const selected = value.slice(start, end);
  const before = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
  const after = end < value.length && value[end] !== "\n" ? "\n" : "";
  const insert = `${before}\`\`\`\n${selected}\n\`\`\`${after}`;
  const selectStart = start + before.length + 4;
  return { start, end, insert, selectStart, selectEnd: selectStart + selected.length };
}

/** The start of the first selected line and the end of the last selected line. */
function lineRange({ value, start, end }: Selection) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  // A selection that ends at the start of a line does not include that line
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const next = value.indexOf("\n", last);
  return { lineStart, lineEnd: next === -1 ? value.length : next };
}

/** Replaces each selected line and selects the changed lines. */
function mapLines(selection: Selection, change: (lines: string[]) => string[]): MarkdownEdit {
  const { lineStart, lineEnd } = lineRange(selection);
  const lines = selection.value.slice(lineStart, lineEnd).split("\n");
  const insert = change(lines).join("\n");
  // A single line keeps a caret at the end, so the user can type after the new prefix
  if (lines.length === 1 && selection.start === selection.end) {
    const caret = lineStart + insert.length;
    return { start: lineStart, end: lineEnd, insert, selectStart: caret, selectEnd: caret };
  }
  return { start: lineStart, end: lineEnd, insert, selectStart: lineStart, selectEnd: lineStart + insert.length };
}

const BULLET = /^(\s*)[-*+] (?!\[[ xX]\] )/;
const NUMBERED = /^(\s*)\d+[.)] /;
const TASK = /^(\s*)[-*+] \[[ xX]\] /;
const QUOTE = /^> ?/;
const HEADING = /^(#{1,6}) /;
const ANY_LIST = /^(\s*)(?:[-*+] \[[ xX]\] |[-*+] |\d+[.)] )/;

/** Adds the list prefix to each non-empty line, or removes it when every line has it. */
function toggleList(selection: Selection, pattern: RegExp, prefix: (index: number) => string): MarkdownEdit {
  return mapLines(selection, (lines) => {
    const filled = lines.filter((line) => line.trim());
    if (filled.length > 0 && filled.every((line) => pattern.test(line))) {
      return lines.map((line) => line.replace(pattern, "$1"));
    }
    let index = 0;
    return lines.map((line) => {
      if (!line.trim() && lines.length > 1) return line;
      const [, indent = ""] = line.match(/^(\s*)/) ?? [];
      return `${indent}${prefix(index++)}${line.replace(ANY_LIST, "").trimStart()}`;
    });
  });
}

function toggleQuote(selection: Selection): MarkdownEdit {
  return mapLines(selection, (lines) => {
    if (lines.every((line) => QUOTE.test(line) || !line.trim())) return lines.map((line) => line.replace(QUOTE, ""));
    return lines.map((line) => `> ${line}`);
  });
}

/** Cycles the heading level of the line: none, #, ##, ###, then none again. */
function cycleHeading(selection: Selection): MarkdownEdit {
  return mapLines(selection, (lines) =>
    lines.map((line) => {
      const level = line.match(HEADING)?.[1].length ?? 0;
      const text = line.replace(HEADING, "");
      return level >= 3 ? text : `${"#".repeat(level + 1)} ${text}`;
    }),
  );
}

function linkOrImage(selection: Selection, image: boolean): MarkdownEdit {
  const span = enclosingSpan(selection, image ? "image" : "link");
  if (span) return unwrap(selection, span);
  const { value, start, end } = selection;
  const selected = value.slice(start, end);
  const bang = image ? "!" : "";
  if (URL_LIKE.test(selected)) {
    const text = image ? "alt text" : "link text";
    return { start, end, insert: `${bang}[${text}](${selected})`, selectStart: start + bang.length + 1, selectEnd: start + bang.length + 1 + text.length };
  }
  const text = selected || (image ? "alt text" : "link text");
  const url = "https://";
  const urlStart = start + bang.length + text.length + 3;
  return { start, end, insert: `${bang}[${text}](${url})`, selectStart: urlStart, selectEnd: urlStart + url.length };
}

function table({ value, start, end }: Selection): MarkdownEdit {
  // A table needs a blank line before and after it
  const head = value.slice(0, start);
  const tail = value.slice(end);
  const before = !head || head.endsWith("\n\n") ? "" : head.endsWith("\n") ? "\n" : "\n\n";
  const after = tail.startsWith("\n\n") ? "" : tail.startsWith("\n") || !tail ? "\n" : "\n\n";
  const header = "Column 1";
  const body = `| ${header} | Column 2 |\n| -------- | -------- |\n| Cell     | Cell     |`;
  const selectStart = start + before.length + 2;
  return { start, end, insert: `${before}${body}${after}`, selectStart, selectEnd: selectStart + header.length };
}

/** The edit that applies a format to the selection. */
export function formatMarkdown(selection: Selection, format: MarkdownFormat): MarkdownEdit {
  switch (format) {
    case "bold":
    case "italic":
    case "strikethrough":
      return toggleInline(selection, format);
    case "code":
      return selection.value.slice(selection.start, selection.end).includes("\n")
        ? codeBlock(selection)
        : toggleInline(selection, "code");
    case "heading":
      return cycleHeading(selection);
    case "quote":
      return toggleQuote(selection);
    case "bullet-list":
      return toggleList(selection, BULLET, () => "- ");
    case "numbered-list":
      return toggleList(selection, NUMBERED, (index) => `${index + 1}. `);
    case "task-list":
      return toggleList(selection, TASK, () => "- [ ] ");
    case "link":
      return linkOrImage(selection, false);
    case "image":
      return linkOrImage(selection, true);
    case "table":
      return table(selection);
  }
}

const LINE_PATTERNS: [MarkdownFormat, RegExp][] = [
  ["heading", HEADING],
  ["quote", QUOTE],
  ["bullet-list", BULLET],
  ["numbered-list", NUMBERED],
  ["task-list", TASK],
];

/** The formats that apply to the whole selection. A toolbar shows these as pressed. */
export function activeFormats(selection: Selection): Set<MarkdownFormat> {
  const active = new Set<MarkdownFormat>();
  for (const format of ["bold", "italic", "strikethrough", "code", "link", "image"] as const) {
    if (enclosingSpan(selection, format)) active.add(format);
  }
  const { lineStart, lineEnd } = lineRange(selection);
  const lines = selection.value.slice(lineStart, lineEnd).split("\n").filter((line) => line.trim());
  for (const [format, pattern] of LINE_PATTERNS) {
    if (lines.length > 0 && lines.every((line) => pattern.test(line))) active.add(format);
  }
  return active;
}

/** Lines that Enter continues: list items and quotes. */
const CONTINUED = /^(\s*)(?:([-*+]) \[[ xX]\] |([-*+]) |(\d+)([.)]) |> ?)/;

/**
 * The edit for Enter at the caret. On a list item or a quote, the new line gets the same
 * prefix (the next number for a numbered list). On an empty item, Enter removes the prefix.
 * Returns null where Enter should insert a plain line break.
 */
export function continueList({ value, start, end }: Selection): MarkdownEdit | null {
  if (start !== end) return null;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const next = value.indexOf("\n", start);
  const line = value.slice(lineStart, next === -1 ? value.length : next);
  const match = line.match(CONTINUED);
  if (!match || start < lineStart + match[0].length) return null;

  if (!line.slice(match[0].length).trim() && start === lineStart + line.length) {
    return { start: lineStart, end: start, insert: "", selectStart: lineStart, selectEnd: lineStart };
  }
  const [, indent, task, bullet, number, delimiter] = match;
  const prefix = task ? `${task} [ ] ` : bullet ? `${bullet} ` : number ? `${Number(number) + 1}${delimiter} ` : "> ";
  const insert = `\n${indent}${prefix}`;
  return { start, end, insert, selectStart: start + insert.length, selectEnd: start + insert.length };
}

/** True when Tab should indent the selection instead of moving the focus: a list item or more than one line. */
export function canIndent(selection: Selection): boolean {
  const { lineStart, lineEnd } = lineRange(selection);
  const text = selection.value.slice(lineStart, lineEnd);
  return text.includes("\n") || ANY_LIST.test(text);
}

/** Adds two spaces before each selected line, or removes up to two spaces or a tab. */
export function indentLines(selection: Selection, outdent: boolean): MarkdownEdit {
  const { lineStart, lineEnd } = lineRange(selection);
  const lines = selection.value.slice(lineStart, lineEnd).split("\n");
  const changed = lines.map((line) => (outdent ? line.replace(/^(?: {1,2}|\t)/, "") : line && `  ${line}`));
  const insert = changed.join("\n");
  const firstShift = changed[0].length - lines[0].length;
  const totalShift = insert.length - (lineEnd - lineStart);
  return {
    start: lineStart,
    end: lineEnd,
    insert,
    selectStart: Math.max(lineStart, selection.start + firstShift),
    selectEnd: Math.max(lineStart, selection.end + totalShift),
  };
}

export type EditorCommand = MarkdownFormat | "undo" | "redo" | "indent" | "outdent" | "newline";

export { isMac };

/**
 * The editor command for a key press. The command key is Cmd on macOS and Ctrl on Windows
 * and Linux. See `historyCommand` for undo and redo.
 */
export function editorCommand(event: KeyInput, mac = isMac): EditorCommand | null {
  if (event.altKey) return null;
  const plain = !event.metaKey && !event.ctrlKey;
  if (event.key === "Enter") return plain && !event.shiftKey ? "newline" : null;
  if (event.key === "Tab") return plain ? (event.shiftKey ? "outdent" : "indent") : null;

  const history = historyCommand(event, mac);
  if (history) return history;
  if (!hasCommandKey(event, mac)) return null;
  const key = event.key.toLowerCase();
  if (event.shiftKey) return key === "x" ? "strikethrough" : null;
  return ({ b: "bold", i: "italic", e: "code", k: "link" } as const)[key as "b"] ?? null;
}
