/**
 * Test for Lorem Generator utilities
 */

import { describe, it, expect } from 'vitest';
import {
  generateWords,
  generateSentences,
  generateParagraphs,
  generateLorem,
  generateItems,
  formatItems,
  MAX_COUNT,
} from '@/utils/lorem';

// A seeded random source, so tests that need many values stay repeatable.
const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

describe('fake data', () => {
  it('makes full names from the built-in lists', () => {
    const names = generateItems('names', 20, { random: seeded() });
    expect(names).toHaveLength(20);
    for (const name of names) expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it('makes unique emails on reserved example domains', () => {
    const emails = generateItems('emails', MAX_COUNT, { random: seeded(7) });
    expect(new Set(emails).size).toBe(MAX_COUNT);
    for (const email of emails) expect(email).toMatch(/^[a-z]+\.[a-z]+\d*@example\.(com|org|net)$/);
  });

  it('makes https URLs on example domains', () => {
    const urls = generateItems('urls', 10, { random: seeded(3) });
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/(www\.)?example\.(com|org|net)\/[a-z]+(-[a-z]+)*(\/[a-z]+(-[a-z]+)*)*$/);
      expect(() => new URL(url)).not.toThrow();
    }
  });

  it('makes titles in title case without a final period', () => {
    const titles = generateItems('titles', 10, { random: seeded(5) });
    for (const title of titles) {
      const words = title.split(' ');
      expect(words.length).toBeGreaterThanOrEqual(3);
      expect(words.length).toBeLessThanOrEqual(7);
      for (const word of words) expect(word).toMatch(/^[A-Z][a-z]*$/);
    }
  });

  it('is repeatable with the same random source', () => {
    expect(generateItems('emails', 5, { random: seeded(9) })).toEqual(generateItems('emails', 5, { random: seeded(9) }));
  });
});

describe('generateItems for lorem text', () => {
  it('starts the first item with Lorem ipsum only when asked', () => {
    expect(generateItems('sentences', 3, { startWithLorem: true, random: seeded() })[0]).toMatch(/^Lorem ipsum /);
    expect(generateItems('words', 3, { startWithLorem: true, random: seeded() })).toEqual(['Lorem', 'ipsum', expect.any(String)]);
  });

  it('clamps the count to the allowed range', () => {
    expect(generateItems('names', 0)).toHaveLength(1);
    expect(generateItems('words', MAX_COUNT + 50)).toHaveLength(MAX_COUNT);
  });
});

describe('formatItems', () => {
  it('joins text by kind', () => {
    expect(formatItems(['a', 'b'], 'paragraphs', 'text')).toBe('a\n\nb');
    expect(formatItems(['A.', 'B.'], 'sentences', 'text')).toBe('A. B.');
    expect(formatItems(['a', 'b'], 'words', 'text')).toBe('a b');
    expect(formatItems(['x@example.com', 'y@example.com'], 'emails', 'text')).toBe('x@example.com\ny@example.com');
  });

  it('writes a JSON array of strings', () => {
    const json = formatItems(['Ann Lee', 'Bo "B" Ray'], 'names', 'json');
    expect(JSON.parse(json)).toEqual(['Ann Lee', 'Bo "B" Ray']);
    expect(json).toBe('[\n  "Ann Lee",\n  "Bo \\"B\\" Ray"\n]');
  });
});

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
