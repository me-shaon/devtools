import { describe, it, expect } from 'vitest';
import {
  areTextsEqual,
  calculateSimilarity,
  compareTexts,
  getLineDiff,
  getUnifiedDiff,
} from '@/utils/text-compare';

describe('text compare options', () => {
  it('treats whitespace differences as changes by default', () => {
    expect(compareTexts('a  b', 'a b').unchangedLines).toBe(0);
    expect(areTextsEqual('  a b', 'a b')).toBe(false);
  });

  it('ignores whitespace runs and edge whitespace', () => {
    const opts = { ignoreWhitespace: true };
    const result = compareTexts('  a   b \nsame', 'a b\nsame', opts);
    expect(result.unchangedLines).toBe(2);
    expect(result.addedLines).toBe(0);
    expect(result.removedLines).toBe(0);
    expect(areTextsEqual('  a   b ', 'a b', opts)).toBe(true);
    expect(calculateSimilarity('a  b', 'a b', opts)).toBe(100);
    expect(getLineDiff('a\t b', 'a b', opts)[0].type).toBe('unchanged');
    expect(getUnifiedDiff('a  b', 'a b', 3, opts)).toEqual([]);
  });

  it('still reports real changes when ignoring whitespace', () => {
    const result = compareTexts('a b', 'a c', { ignoreWhitespace: true });
    expect(result.addedLines).toBe(1);
    expect(result.removedLines).toBe(1);
  });

  it('treats case differences as changes by default', () => {
    expect(getLineDiff('Hello', 'hello')[0].type).toBe('modified');
  });

  it('ignores case', () => {
    const opts = { ignoreCase: true };
    expect(compareTexts('Hello\nX', 'hello\nx', opts).unchangedLines).toBe(2);
    expect(areTextsEqual('Hello', 'HELLO', opts)).toBe(true);
    expect(calculateSimilarity('Hello', 'hELLO', opts)).toBe(100);
    expect(getLineDiff('Hello', 'hello', opts)[0].type).toBe('unchanged');
    expect(areTextsEqual('Hello', 'HELLO  ', opts)).toBe(false);
  });

  it('combines both options and still detects line count changes', () => {
    const opts = { ignoreCase: true, ignoreWhitespace: true };
    expect(areTextsEqual(' A  B ', 'a b', opts)).toBe(true);
    expect(areTextsEqual('a', 'a\nb', opts)).toBe(false);
  });
});
