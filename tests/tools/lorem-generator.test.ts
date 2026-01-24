/**
 * Test for Lorem Generator utilities
 */

import { describe, it, expect } from 'vitest';
import {
  generateWords,
  generateSentences,
  generateParagraphs,
  generateLorem,
  type LoremOptions,
} from '@/utils/lorem';

describe('Lorem Utils', () => {
  describe('generateWords', () => {
    it('should generate specified number of words', () => {
      const result = generateWords(5);
      const words = result.split(' ');
      expect(words).toHaveLength(5);
    });

    it('should start with Lorem ipsum when specified', () => {
      const result = generateWords(5, true);
      expect(result).toMatch(/^Lorem ipsum/);
    });

    it('should not start with Lorem ipsum by default', () => {
      const result = generateWords(10, false);
      // First word could be anything from the word list
      expect(result.split(' ')).toHaveLength(10);
    });
  });

  describe('generateSentences', () => {
    it('should generate specified number of sentences', () => {
      const result = generateSentences(3);
      const sentences = result.split('. ').filter(s => s.length > 0);
      expect(sentences).toHaveLength(3);
    });

    it('should start each sentence with capital letter', () => {
      const result = generateSentences(5);
      const sentences = result.split('. ').filter(s => s.length > 0);
      sentences.forEach(sentence => {
        expect(sentence[0]).toBe(sentence[0].toUpperCase());
      });
    });

    it('should end each sentence with period', () => {
      const result = generateSentences(3);
      expect(result).toMatch(/\.$/);
    });
  });

  describe('generateParagraphs', () => {
    it('should generate specified number of paragraphs', () => {
      const result = generateParagraphs(3);
      const paragraphs = result.split('\n\n').filter(p => p.length > 0);
      expect(paragraphs).toHaveLength(3);
    });

    it('should separate paragraphs with double newline', () => {
      const result = generateParagraphs(2);
      expect(result).toContain('\n\n');
    });

    it('should start with Lorem ipsum by default', () => {
      const result = generateParagraphs(2, true);
      expect(result).toMatch(/^Lorem/);
    });
  });

  describe('generateLorem', () => {
    it('should generate paragraphs by default', () => {
      const result = generateLorem({ count: 2 });
      expect(result).toContain('\n\n');
    });

    it('should generate words when type is words', () => {
      const result = generateLorem({ count: 5, type: 'words' });
      const words = result.split(' ');
      expect(words).toHaveLength(5);
    });

    it('should generate sentences when type is sentences', () => {
      const result = generateLorem({ count: 3, type: 'sentences' });
      const sentences = result.split('. ').filter(s => s.length > 0);
      expect(sentences).toHaveLength(3);
    });

    it('should generate paragraphs when type is paragraphs', () => {
      const result = generateLorem({ count: 2, type: 'paragraphs' });
      const paragraphs = result.split('\n\n').filter(p => p.length > 0);
      expect(paragraphs).toHaveLength(2);
    });

    it('should respect startWithLorem option', () => {
      const result = generateLorem({ count: 1, type: 'paragraphs', startWithLorem: true });
      expect(result).toMatch(/^Lorem/);
    });

    it('should use default options when none provided', () => {
      const result = generateLorem();
      const paragraphs = result.split('\n\n').filter(p => p.length > 0);
      expect(paragraphs.length).toBeGreaterThan(0);
      expect(paragraphs.length).toBeLessThanOrEqual(3);
    });
  });
});
