/**
 * Test for Text Compare utilities
 */

import { describe, it, expect } from 'vitest';
import {
  compareTexts,
  getLineDiff,
  calculateSimilarity,
  getCharDiff,
  getUnifiedDiff,
  areTextsEqual,
  getTextStats,
} from '@/utils/text-compare';

describe('Text Compare Utils', () => {
  describe('compareTexts', () => {
    it('should detect identical texts', () => {
      const text = 'Hello\nWorld';
      const result = compareTexts(text, text);
      expect(result.addedLines).toBe(0);
      expect(result.removedLines).toBe(0);
      expect(result.unchangedLines).toBe(2);
    });

    it('should detect added lines', () => {
      const result = compareTexts('Hello', 'Hello\nWorld');
      expect(result.addedLines).toBe(1);
      expect(result.removedLines).toBe(0);
    });

    it('should detect removed lines', () => {
      const result = compareTexts('Hello\nWorld', 'Hello');
      expect(result.addedLines).toBe(0);
      expect(result.removedLines).toBe(1);
    });

    it('should detect modified lines', () => {
      const result = compareTexts('Hello\nWorld', 'Hello\nThere');
      expect(result.addedLines).toBe(1);
      expect(result.removedLines).toBe(1);
      expect(result.unchangedLines).toBe(1);
    });

    it('should handle empty texts', () => {
      const result = compareTexts('', '');
      // Empty strings split to [''], which produces one empty line
      expect(result.differences.length).toBeGreaterThan(0);
      expect(result.unchangedLines).toBe(1); // One empty line
    });

    it('should mark differences correctly', () => {
      const result = compareTexts('Line 1\nLine 2', 'Line 1\nLine 3');
      expect(result.differences[0].type).toBe('unchanged');
      expect(result.differences[1].type).toBe('removed');
      expect(result.differences[2].type).toBe('added');
    });
  });

  describe('getLineDiff', () => {
    it('should return all unchanged for identical texts', () => {
      const result = getLineDiff('Hello\nWorld', 'Hello\nWorld');
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('unchanged');
      expect(result[1].type).toBe('unchanged');
    });

    it('should detect added lines', () => {
      const result = getLineDiff('Hello', 'Hello\nWorld');
      expect(result).toHaveLength(2);
      expect(result[1].type).toBe('added');
    });

    it('should detect removed lines', () => {
      const result = getLineDiff('Hello\nWorld', 'Hello');
      expect(result).toHaveLength(2);
      expect(result[1].type).toBe('removed');
    });

    it('should detect modified lines', () => {
      const result = getLineDiff('Hello\nWorld', 'Hello\nThere');
      expect(result[1].type).toBe('modified');
      expect(result[1].content).toBe('There');
      expect(result[1].oldContent).toBe('World');
    });

    it('should include line numbers', () => {
      const result = getLineDiff('Line 1\nLine 2', 'Line 1\nLine 2');
      expect(result[0].lineNumber).toBe(0);
      expect(result[1].lineNumber).toBe(1);
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 100% for identical texts', () => {
      const text = 'Hello\nWorld';
      const result = calculateSimilarity(text, text);
      expect(result).toBe(100);
    });

    it('should return 0% for completely different texts', () => {
      const result = calculateSimilarity('Hello', 'World');
      expect(result).toBe(0);
    });

    it('should calculate partial similarity', () => {
      const result = calculateSimilarity('Line 1\nLine 2\nLine 3', 'Line 1\nDifferent\nLine 3');
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(100);
    });

    it('should handle empty texts', () => {
      expect(calculateSimilarity('', '')).toBe(100);
      expect(calculateSimilarity('Hello', '')).toBe(0);
      expect(calculateSimilarity('', 'World')).toBe(0);
    });
  });

  describe('getCharDiff', () => {
    it('should return all unchanged for identical strings', () => {
      const result = getCharDiff('hello', 'hello');
      expect(result).toHaveLength(5);
      expect(result.every((d) => d.type === 'unchanged')).toBe(true);
    });

    it('should detect character additions', () => {
      const result = getCharDiff('hi', 'hi!');
      expect(result[result.length - 1].type).toBe('added');
      expect(result[result.length - 1].value).toBe('!');
    });

    it('should detect character removals', () => {
      const result = getCharDiff('hi!', 'hi');
      expect(result[result.length - 1].type).toBe('removed');
      expect(result[result.length - 1].value).toBe('!');
    });

    it('should detect character replacements', () => {
      const result = getCharDiff('cat', 'bat');
      expect(result[0].type).toBe('removed');
      expect(result[1].type).toBe('added');
    });

    it('should handle empty strings', () => {
      const result = getCharDiff('', '');
      expect(result).toHaveLength(0);
    });
  });

  describe('getUnifiedDiff', () => {
    it('should generate unified diff format', () => {
      const result = getUnifiedDiff('Line 1\nLine 2', 'Line 1\nLine 3');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array for identical texts', () => {
      const result = getUnifiedDiff('Same\nText', 'Same\nText');
      expect(result).toHaveLength(0);
    });

    it('should include context lines', () => {
      const result = getUnifiedDiff(
        'Line 1\nLine 2\nLine 3\nLine 4\nLine 5',
        'Line 1\nModified\nLine 3\nLine 4\nLine 5',
        1
      );
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('areTextsEqual', () => {
    it('should return true for identical texts', () => {
      expect(areTextsEqual('Hello', 'Hello')).toBe(true);
    });

    it('should return false for different texts', () => {
      expect(areTextsEqual('Hello', 'World')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(areTextsEqual('Hello', 'hello')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(areTextsEqual('', '')).toBe(true);
    });
  });

  describe('getTextStats', () => {
    it('should count lines correctly', () => {
      const stats = getTextStats('Line 1\nLine 2\nLine 3');
      expect(stats.lines).toBe(3);
    });

    it('should count characters correctly', () => {
      const stats = getTextStats('Hello');
      expect(stats.characters).toBe(5);
    });

    it('should count words correctly', () => {
      const stats = getTextStats('Hello world test');
      expect(stats.words).toBe(3);
    });

    it('should count bytes correctly', () => {
      const stats = getTextStats('Hello');
      expect(stats.bytes).toBe(5);
    });

    it('should handle empty text', () => {
      const stats = getTextStats('');
      expect(stats.lines).toBe(1); // Split still returns 1 element
      expect(stats.characters).toBe(0);
      expect(stats.words).toBe(0);
    });

    it('should handle multiple spaces', () => {
      const stats = getTextStats('Hello    world');
      expect(stats.words).toBe(2);
    });

    it('should handle leading/trailing whitespace', () => {
      const stats = getTextStats('  Hello world  ');
      expect(stats.words).toBe(2);
    });
  });

  describe('complex scenarios', () => {
    it('should handle mixed changes', () => {
      const text1 = 'Line 1\nLine 2\nLine 3\nLine 4';
      const text2 = 'Line 1\nModified\nLine 3\nLine 5';
      const result = compareTexts(text1, text2);

      expect(result.unchangedLines).toBeGreaterThanOrEqual(1); // At least Line 1
      expect(result.addedLines).toBe(2); // Modified and Line 5
      expect(result.removedLines).toBe(2); // Line 2 and Line 4
    });

    it('should calculate stats for realistic text', () => {
      const text = 'The quick brown fox\njumps over\nthe lazy dog.';
      const stats = getTextStats(text);

      expect(stats.lines).toBe(3);
      expect(stats.words).toBe(9);
      expect(stats.characters).toBeGreaterThan(0);
    });
  });
});
