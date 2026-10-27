/**
 * Text Compare utility functions
 */

export interface DiffResult {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
  lineNumber?: number;
}

export interface TextComparison {
  differences: DiffResult[];
  addedLines: number;
  removedLines: number;
  unchangedLines: number;
}

export interface LineDiff {
  /** Zero-based line number in the modified text, or in the original text for a removed line. */
  lineNumber: number;
  /** Zero-based line number in the original text. Not set for an added line. */
  oldLineNumber?: number;
  type: 'added' | 'removed' | 'unchanged' | 'modified';
  content: string;
  oldContent?: string;
}

export interface CompareOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
}

function normalizeLine(line: string, options: CompareOptions): string {
  let result = line;
  if (options.ignoreWhitespace) {
    result = result.replace(/\s+/g, ' ').trim();
  }
  if (options.ignoreCase) {
    result = result.toLowerCase();
  }
  return result;
}

function linesMatch(a: string, b: string, options: CompareOptions): boolean {
  return normalizeLine(a, options) === normalizeLine(b, options);
}

type DiffOp = 'equal' | 'delete' | 'insert';

/** Above this many edits the diff stops searching and replaces the rest as one block. */
const MAX_EDIT_STEPS = 2000;

/**
 * Shortest edit script between two sequences (Myers' O(ND) algorithm).
 * Each op uses one item: equal from both sides, delete from a, insert from b.
 */
function diffSequences<T>(a: readonly T[], b: readonly T[], equal: (x: T, y: T) => boolean): DiffOp[] {
  let start = 0;
  while (start < a.length && start < b.length && equal(a[start], b[start])) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && equal(a[endA - 1], b[endB - 1])) {
    endA--;
    endB--;
  }
  const same = (count: number): DiffOp[] => Array<DiffOp>(count).fill('equal');
  return [...same(start), ...myers(a.slice(start, endA), b.slice(start, endB), equal), ...same(a.length - endA)];
}

function myers<T>(a: readonly T[], b: readonly T[], equal: (x: T, y: T) => boolean): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const replaceAll = (): DiffOp[] => [...Array<DiffOp>(n).fill('delete'), ...Array<DiffOp>(m).fill('insert')];
  if (n === 0 || m === 0) return replaceAll();

  const max = n + m;
  const offset = max + 1;
  // v[offset + k] is the furthest x reached on diagonal k.
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];

  for (let d = 0; d <= max; d++) {
    if (d > MAX_EDIT_STEPS) return replaceAll();
    // Keep diagonals -d-1..d+1 from the previous step for the backtrack.
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && equal(a[x], b[y])) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, n, m);
    }
  }
  return replaceAll();
}

function backtrack(trace: Int32Array[], n: number, m: number): DiffOp[] {
  const ops: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const snapshot = trace[d];
    const at = (k: number) => snapshot[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push('equal');
      x--;
      y--;
    }
    if (x === prevX) {
      ops.push('insert');
      y--;
    } else {
      ops.push('delete');
      x--;
    }
  }
  while (x > 0 && y > 0) {
    ops.push('equal');
    x--;
    y--;
  }
  return ops.reverse();
}

function diffLines(text1: string, text2: string, options: CompareOptions) {
  const lines1 = text1.split('\n');
  const lines2 = text2.split('\n');
  const ops = diffSequences(
    lines1.map((line) => normalizeLine(line, options)),
    lines2.map((line) => normalizeLine(line, options)),
    (x, y) => x === y
  );
  return { ops, lines1, lines2 };
}

/**
 * Compare two texts and return differences. Lines are aligned, so an inserted
 * line does not mark the lines after it as changed.
 */
export function compareTexts(text1: string, text2: string, options: CompareOptions = {}): TextComparison {
  const { ops, lines1, lines2 } = diffLines(text1, text2, options);
  const differences: DiffResult[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  for (const op of ops) {
    if (op === 'equal') {
      differences.push({ type: 'unchanged', value: lines1[oldIndex], lineNumber: oldIndex });
      oldIndex++;
      newIndex++;
    } else if (op === 'delete') {
      differences.push({ type: 'removed', value: lines1[oldIndex], lineNumber: oldIndex });
      oldIndex++;
    } else {
      differences.push({ type: 'added', value: lines2[newIndex], lineNumber: newIndex });
      newIndex++;
    }
  }

  const count = (type: DiffResult['type']) => differences.filter((diff) => diff.type === type).length;
  return {
    differences,
    addedLines: count('added'),
    removedLines: count('removed'),
    unchangedLines: count('unchanged'),
  };
}

/**
 * Get an aligned line-by-line diff. Removed and added lines between
 * the same unchanged lines are paired as modified lines.
 */
export function getLineDiff(text1: string, text2: string, options: CompareOptions = {}): LineDiff[] {
  const { ops, lines1, lines2 } = diffLines(text1, text2, options);
  const result: LineDiff[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let removed: number[] = [];
  let added: number[] = [];

  const flush = () => {
    const pairs = Math.min(removed.length, added.length);
    for (let i = 0; i < pairs; i++) {
      result.push({
        lineNumber: added[i],
        oldLineNumber: removed[i],
        type: 'modified',
        content: lines2[added[i]],
        oldContent: lines1[removed[i]],
      });
    }
    for (const line of removed.slice(pairs)) {
      result.push({ lineNumber: line, oldLineNumber: line, type: 'removed', content: lines1[line] });
    }
    for (const line of added.slice(pairs)) {
      result.push({ lineNumber: line, type: 'added', content: lines2[line] });
    }
    removed = [];
    added = [];
  };

  for (const op of ops) {
    if (op === 'equal') {
      flush();
      result.push({ lineNumber: newIndex, oldLineNumber: oldIndex, type: 'unchanged', content: lines2[newIndex] });
      oldIndex++;
      newIndex++;
    } else if (op === 'delete') {
      removed.push(oldIndex++);
    } else {
      added.push(newIndex++);
    }
  }
  flush();

  return result;
}

/**
 * Index of the first line of each change (a run of changed lines).
 */
export function getChangeStarts(lineDiffs: LineDiff[]): number[] {
  return lineDiffs.flatMap((diff, index) =>
    diff.type !== 'unchanged' && (index === 0 || lineDiffs[index - 1].type === 'unchanged') ? [index] : []
  );
}

/**
 * Calculate similarity: the share of lines that match after alignment, out of the longer text.
 */
export function calculateSimilarity(text1: string, text2: string, options: CompareOptions = {}): number {
  if (!text1 && !text2) return 100;
  if (!text1 || !text2) return 0;

  const { ops, lines1, lines2 } = diffLines(text1, text2, options);
  const matchingLines = ops.filter((op) => op === 'equal').length;
  return (matchingLines / Math.max(lines1.length, lines2.length)) * 100;
}

/** Turn edit ops into diff items. Unchanged items take the value from the modified side. */
function toDiffResults(ops: DiffOp[], a: readonly string[], b: readonly string[]): DiffResult[] {
  const result: DiffResult[] = [];
  let i = 0;
  let j = 0;
  for (const op of ops) {
    if (op === 'equal') {
      result.push({ type: 'unchanged', value: b[j] });
      i++;
      j++;
    } else if (op === 'delete') {
      result.push({ type: 'removed', value: a[i++] });
    } else {
      result.push({ type: 'added', value: b[j++] });
    }
  }
  return result;
}

/**
 * Join neighboring items of the same type into one item.
 */
export function mergeDiffResults(items: DiffResult[]): DiffResult[] {
  const merged: DiffResult[] = [];
  for (const item of items) {
    const last = merged[merged.length - 1];
    if (last && last.type === item.type) last.value += item.value;
    else merged.push({ type: item.type, value: item.value });
  }
  return merged;
}

/**
 * Get an aligned character-level diff for a single line, one item per character.
 */
export function getCharDiff(line1: string, line2: string): DiffResult[] {
  const a = Array.from(line1);
  const b = Array.from(line2);
  return toDiffResults(diffSequences(a, b, (x, y) => x === y), a, b);
}

/** Words, whitespace runs, and single punctuation characters. */
const WORD_TOKEN = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;

/**
 * Get a word-level diff for a single line. Neighboring items of the same type are joined.
 * With ignoreWhitespace, whitespace changes count as unchanged.
 */
export function getWordDiff(line1: string, line2: string, options: CompareOptions = {}): DiffResult[] {
  const a = line1.match(WORD_TOKEN) ?? [];
  const b = line2.match(WORD_TOKEN) ?? [];
  const isSpace = (token: string) => /^\s+$/.test(token);
  const normalize = (token: string) => {
    if (options.ignoreWhitespace && isSpace(token)) return ' ';
    return options.ignoreCase ? token.toLowerCase() : token;
  };
  const items = toDiffResults(diffSequences(a, b, (x, y) => normalize(x) === normalize(y)), a, b).flatMap(
    (item): DiffResult[] => {
      if (!options.ignoreWhitespace || item.type === 'unchanged' || !isSpace(item.value)) return [item];
      return item.type === 'added' ? [{ type: 'unchanged', value: item.value }] : [];
    }
  );
  return mergeDiffResults(items);
}

/**
 * Build a unified diff (patch format). Changes that are more than
 * 2 * contextLines apart go into separate hunks.
 */
export function getUnifiedDiff(
  text1: string,
  text2: string,
  contextLines = 3,
  options: CompareOptions = {}
): string[] {
  const { ops, lines1, lines2 } = diffLines(text1, text2, options);

  // One entry per op, with the count of original and modified lines before it.
  const entries: { op: DiffOp; text: string; oldBefore: number; newBefore: number }[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  for (const op of ops) {
    const text = op === 'insert' ? lines2[newIndex] : lines1[oldIndex];
    entries.push({ op, text, oldBefore: oldIndex, newBefore: newIndex });
    if (op !== 'insert') oldIndex++;
    if (op !== 'delete') newIndex++;
  }

  const changed = entries.flatMap((entry, index) => (entry.op === 'equal' ? [] : [index]));
  if (changed.length === 0) {
    return [];
  }

  // Group the changed entries into hunks.
  const hunks: [number, number][] = [];
  for (const index of changed) {
    const last = hunks[hunks.length - 1];
    if (last && index - last[1] - 1 <= 2 * contextLines) last[1] = index;
    else hunks.push([index, index]);
  }

  const lines = ['--- original', '+++ modified'];
  for (const [first, last] of hunks) {
    const start = Math.max(0, first - contextLines);
    const end = Math.min(entries.length - 1, last + contextLines);
    const visible = entries.slice(start, end + 1);
    const oldCount = visible.filter((entry) => entry.op !== 'insert').length;
    const newCount = visible.filter((entry) => entry.op !== 'delete').length;
    // An empty range points at the line before it, as in Git.
    const oldStart = entries[start].oldBefore + (oldCount > 0 ? 1 : 0);
    const newStart = entries[start].newBefore + (newCount > 0 ? 1 : 0);
    lines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const entry of visible) {
      const marker = entry.op === 'equal' ? ' ' : entry.op === 'delete' ? '-' : '+';
      lines.push(`${marker}${entry.text}`);
    }
  }

  return lines;
}

/**
 * Check if two texts are identical
 */
export function areTextsEqual(text1: string, text2: string, options: CompareOptions = {}): boolean {
  const lines1 = text1.split('\n');
  const lines2 = text2.split('\n');
  if (lines1.length !== lines2.length) {
    return false;
  }
  return lines1.every((line, i) => linesMatch(line, lines2[i], options));
}

/**
 * Get statistics about text differences
 */
export function getTextStats(text: string): {
  lines: number;
  characters: number;
  words: number;
  bytes: number;
} {
  const lines = text.split('\n').length;
  const characters = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const bytes = new Blob([text]).size;

  return { lines, characters, words, bytes };
}
