/**
 * Tests for Lorem Generator utilities
 */
const LoremUtils = require('../../src/utils/lorem-utils');

describe('LoremUtils', () => {
  describe('generateWords', () => {
    test('generates requested number of words', () => {
      const words = LoremUtils.generateWords(10);
      expect(words.split(' ')).toHaveLength(10);
    });

    test('generates words from lorem dictionary', () => {
      const words = LoremUtils.generateWords(5);
      const wordArray = words.split(' ');

      wordArray.forEach((word) => {
        expect(LoremUtils.LOREM_WORDS).toContain(word);
      });
    });

    test('throws error for invalid count', () => {
      expect(() => LoremUtils.generateWords(0)).toThrow(
        'Word count must be at least 1'
      );
      expect(() => LoremUtils.generateWords(-1)).toThrow(
        'Word count must be at least 1'
      );
    });

    test('returns string for single word', () => {
      const word = LoremUtils.generateWords(1);
      expect(typeof word).toBe('string');
      expect(word.split(' ')).toHaveLength(1);
    });

    test('returns different results on subsequent calls', () => {
      const words1 = LoremUtils.generateWords(20);
      const words2 = LoremUtils.generateWords(20);
      expect(words1).not.toBe(words2);
    });
  });

  describe('generateSentences', () => {
    test('generates requested number of sentences', () => {
      const sentences = LoremUtils.generateSentences(3);
      const sentenceArray = sentences.match(/[.!?]/g);
      expect(sentenceArray).toHaveLength(3);
    });

    test('sentences are capitalized and end with punctuation', () => {
      const sentences = LoremUtils.generateSentences(5);
      const sentenceArray = sentences.match(/[.!?]/g);
      expect(sentenceArray).toHaveLength(5);

      const firstWords = sentences.match(/^[A-Z]|[.!?]\s[A-Z]/g);
      expect(firstWords.length).toBeGreaterThan(0);
    });

    test('throws error for invalid count', () => {
      expect(() => LoremUtils.generateSentences(0)).toThrow(
        'Sentence count must be at least 1'
      );
      expect(() => LoremUtils.generateSentences(-1)).toThrow(
        'Sentence count must be at least 1'
      );
    });
  });

  describe('generateParagraphs', () => {
    test('generates requested number of paragraphs', () => {
      const paragraphs = LoremUtils.generateParagraphs(2);
      const paragraphArray = paragraphs.split('\n\n');
      expect(paragraphArray).toHaveLength(2);
    });

    test('throws error for invalid count', () => {
      expect(() => LoremUtils.generateParagraphs(0)).toThrow(
        'Paragraph count must be at least 1'
      );
      expect(() => LoremUtils.generateParagraphs(-1)).toThrow(
        'Paragraph count must be at least 1'
      );
    });
  });

  describe('generateLorem', () => {
    test('generates paragraphs by default', () => {
      const lorem = LoremUtils.generateLorem();
      expect(typeof lorem).toBe('string');
      expect(lorem.length).toBeGreaterThan(0);
      expect(lorem.split('\n\n')).toHaveLength(1);
    });

    test('generates words when type is "words"', () => {
      const lorem = LoremUtils.generateLorem('words', 5);
      expect(lorem.split(' ')).toHaveLength(5);
    });

    test('generates sentences when type is "sentences"', () => {
      const lorem = LoremUtils.generateLorem('sentences', 3);
      const sentenceCount = lorem.match(/[.!?]/g).length;
      expect(sentenceCount).toBe(3);
    });

    test('generates paragraphs when type is "paragraphs"', () => {
      const lorem = LoremUtils.generateLorem('paragraphs', 2);
      expect(lorem.split('\n\n')).toHaveLength(2);
    });

    test('throws error for invalid count range', () => {
      expect(() => LoremUtils.generateLorem('words', 0)).toThrow(
        'Count must be between 1 and 50'
      );
      expect(() => LoremUtils.generateLorem('words', 51)).toThrow(
        'Count must be between 1 and 50'
      );
    });
  });

  describe('utility methods', () => {
    test('randomBetween generates number in range', () => {
      for (let i = 0; i < 10; i++) {
        const num = LoremUtils.randomBetween(5, 10);
        expect(num).toBeGreaterThanOrEqual(5);
        expect(num).toBeLessThanOrEqual(10);
      }
    });

    test('capitalizeFirst capitalizes first letter', () => {
      expect(LoremUtils.capitalizeFirst('hello')).toBe('Hello');
      expect(LoremUtils.capitalizeFirst('WORLD')).toBe('WORLD');
      expect(LoremUtils.capitalizeFirst('')).toBe('');
    });

    test('capitalizeFirst handles edge cases', () => {
      expect(LoremUtils.capitalizeFirst(null)).toBe(null);
      expect(LoremUtils.capitalizeFirst(undefined)).toBe(undefined);
      expect(LoremUtils.capitalizeFirst('a')).toBe('A');
    });
  });
});
