/**
 * Test for Base64 utilities
 */

import { describe, it, expect } from 'vitest';
import { encodeText, decodeText, isValidBase64 } from '@/utils/base64';

describe('Base64 Utils', () => {
  describe('encodeText', () => {
    it('should encode text to base64', () => {
      const result = encodeText('Hello World');
      expect(result).toBe('SGVsbG8gV29ybGQ=');
    });

    it('should throw error for empty input', () => {
      expect(() => encodeText('')).toThrow('Please enter text to encode.');
      expect(() => encodeText('   ')).toThrow('Please enter text to encode.');
    });

    it('should handle special characters correctly', () => {
      const result = encodeText('Hello 🌟 World!');
      expect(result).toBe('SGVsbG8g8J+MnyBXb3JsZCE=');
    });

    it('should handle newlines and special characters', () => {
      const result = encodeText('Hello\nWorld\t!');
      expect(result).toBe('SGVsbG8KV29ybGQJIQ==');
    });
  });

  describe('decodeText', () => {
    it('should decode base64 to text', () => {
      const result = decodeText('SGVsbG8gV29ybGQ=');
      expect(result).toBe('Hello World');
    });

    it('should throw error for empty input', () => {
      expect(() => decodeText('')).toThrow('Please enter Base64 to decode.');
      expect(() => decodeText('   ')).toThrow('Please enter Base64 to decode.');
    });

    it('should throw error for invalid base64', () => {
      expect(() => decodeText('invalid-base64!@#')).toThrow();
    });

    it('should decode special characters correctly', () => {
      const result = decodeText('SGVsbG8g8J+MnyBXb3JsZCE=');
      expect(result).toBe('Hello 🌟 World!');
    });
  });

  describe('isValidBase64', () => {
    it('should validate correct base64 strings', () => {
      expect(isValidBase64('SGVsbG8gV29ybGQ=')).toBe(true);
      expect(isValidBase64('dGVzdA==')).toBe(true);
      expect(isValidBase64('SGVsbG8g8J+MnyBXb3JsZCE=')).toBe(true);
    });

    it('should reject invalid base64 strings', () => {
      expect(isValidBase64('invalid!@#')).toBe(false);
      expect(isValidBase64('')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidBase64('QQ==')).toBe(true); // 'A' encoded
      expect(isValidBase64('QUI=')).toBe(true); // 'AB' encoded
      expect(isValidBase64('QUJD')).toBe(true); // 'ABC' encoded
    });
  });
});
