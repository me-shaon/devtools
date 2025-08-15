/**
 * Integration test for Lorem Generator functionality
 * Focuses on core functionality without complex DOM interactions
 */

// Import the lorem generator by requiring the utils
const path = require('path');
const LoremUtils = require('../../src/utils/lorem-utils.js');

describe('LoremGenerator Functionality', () => {
  test('generates paragraphs using utils', () => {
    const result = LoremUtils.generateParagraphs(2);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.includes('lorem')).toBeTruthy();
    // Should have 2 paragraphs separated by double newlines
    expect(result.split('\n\n')).toHaveLength(2);
  });

  test('generates sentences using utils', () => {
    const result = LoremUtils.generateSentences(3);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    // Should end with punctuation
    expect(/[.!?]$/.test(result)).toBeTruthy();
  });

  test('generates words using utils', () => {
    const result = LoremUtils.generateWords(10);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    const words = result.split(' ');
    expect(words).toHaveLength(10);
  });

  test('handles edge cases', () => {
    expect(() => LoremUtils.generateParagraphs(0)).toThrow();
    expect(() => LoremUtils.generateSentences(0)).toThrow();
    expect(() => LoremUtils.generateWords(0)).toThrow();
  });
});
