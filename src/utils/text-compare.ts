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
  lineNumber: number;
  type: 'added' | 'removed' | 'unchanged' | 'modified';
  content: string;
  oldContent?: string;
}

/**
 * Compare two texts and return differences
 */
export function compareTexts(text1: string, text2: string): TextComparison {
  const lines1 = text1.split('\n');
  const lines2 = text2.split('\n');

  const differences: DiffResult[] = [];
  let addedLines = 0;
  let removedLines = 0;
  let unchangedLines = 0;

  const maxLines = Math.max(lines1.length, lines2.length);

  for (let i = 0; i < maxLines; i++) {
    const line1 = lines1[i];
    const line2 = lines2[i];

    if (line1 === line2) {
      differences.push({ type: 'unchanged', value: line1 || '', lineNumber: i });
      unchangedLines++;
    } else {
      if (line1 !== undefined) {
        differences.push({ type: 'removed', value: line1, lineNumber: i });
        removedLines++;
      }
      if (line2 !== undefined) {
        differences.push({ type: 'added', value: line2, lineNumber: i });
        addedLines++;
      }
    }
  }

  return {
    differences,
    addedLines,
    removedLines,
    unchangedLines,
  };
}

/**
 * Get line-by-line diff with more detail
 */
export function getLineDiff(text1: string, text2: string): LineDiff[] {
  const lines1 = text1.split('\n');
  const lines2 = text2.split('\n');

  const result: LineDiff[] = [];
  const maxLines = Math.max(lines1.length, lines2.length);

  for (let i = 0; i < maxLines; i++) {
    const line1 = lines1[i];
    const line2 = lines2[i];

    if (line1 === line2) {
      result.push({
        lineNumber: i,
        type: 'unchanged',
        content: line1 || '',
      });
    } else if (line1 === undefined) {
      result.push({
        lineNumber: i,
        type: 'added',
        content: line2 || '',
      });
    } else if (line2 === undefined) {
      result.push({
        lineNumber: i,
        type: 'removed',
        content: line1 || '',
      });
    } else {
      result.push({
        lineNumber: i,
        type: 'modified',
        content: line2 || '',
        oldContent: line1 || '',
      });
    }
  }

  return result;
}

/**
 * Calculate similarity percentage between two texts
 */
export function calculateSimilarity(text1: string, text2: string): number {
  if (!text1 && !text2) return 100;
  if (!text1 || !text2) return 0;

  const lines1 = text1.split('\n');
  const lines2 = text2.split('\n');

  const maxLines = Math.max(lines1.length, lines2.length);
  if (maxLines === 0) return 100;

  let matchingLines = 0;

  for (let i = 0; i < Math.min(lines1.length, lines2.length); i++) {
    if (lines1[i] === lines2[i]) {
      matchingLines++;
    }
  }

  return (matchingLines / maxLines) * 100;
}

/**
 * Get character-level diff for a single line
 */
export function getCharDiff(line1: string, line2: string): DiffResult[] {
  const result: DiffResult[] = [];
  const maxLen = Math.max(line1.length, line2.length);

  for (let i = 0; i < maxLen; i++) {
    const char1 = line1[i];
    const char2 = line2[i];

    if (char1 === char2) {
      result.push({ type: 'unchanged', value: char1 || '' });
    } else {
      if (char1 !== undefined) {
        result.push({ type: 'removed', value: char1 });
      }
      if (char2 !== undefined) {
        result.push({ type: 'added', value: char2 });
      }
    }
  }

  return result;
}

/**
 * Find differences in a unified diff format
 */
export function getUnifiedDiff(
  text1: string,
  text2: string,
  contextLines = 3
): string[] {
  const lineDiffs = getLineDiff(text1, text2);
  const changedIndices = lineDiffs
    .map((diff, index) => (diff.type === 'unchanged' ? -1 : index))
    .filter((index) => index >= 0);

  if (changedIndices.length === 0) {
    return [];
  }

  const start = Math.max(0, changedIndices[0] - contextLines);
  const end = Math.min(lineDiffs.length - 1, changedIndices[changedIndices.length - 1] + contextLines);
  const visibleDiffs = lineDiffs.slice(start, end + 1);

  let oldCount = 0;
  let newCount = 0;

  for (const diff of visibleDiffs) {
    switch (diff.type) {
      case 'unchanged':
        oldCount++;
        newCount++;
        break;
      case 'removed':
        oldCount++;
        break;
      case 'added':
        newCount++;
        break;
      case 'modified':
        oldCount++;
        newCount++;
        break;
    }
  }

  const lines = [
    '--- original',
    '+++ modified',
    `@@ -${start + 1},${oldCount} +${start + 1},${newCount} @@`,
  ];

  for (const diff of visibleDiffs) {
    switch (diff.type) {
      case 'unchanged':
        lines.push(` ${diff.content}`);
        break;
      case 'removed':
        lines.push(`-${diff.content}`);
        break;
      case 'added':
        lines.push(`+${diff.content}`);
        break;
      case 'modified':
        lines.push(`-${diff.oldContent || ''}`);
        lines.push(`+${diff.content}`);
        break;
    }
  }

  return lines;
}

/**
 * Check if two texts are identical
 */
export function areTextsEqual(text1: string, text2: string): boolean {
  return text1 === text2;
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
