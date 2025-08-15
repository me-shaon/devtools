/**
 * Test for Base64 utilities
 */

const Base64Utils = require('../../src/utils/base64-utils');

describe('Base64Utils', () => {
  describe('encodeText', () => {
    it('should encode text to base64', () => {
      const result = Base64Utils.encodeText('Hello World');
      expect(result).toBe('SGVsbG8gV29ybGQ=');
    });

    it('should throw error for empty input', () => {
      expect(() => Base64Utils.encodeText('')).toThrow(
        'Please enter text to encode.'
      );
      expect(() => Base64Utils.encodeText('   ')).toThrow(
        'Please enter text to encode.'
      );
      expect(() => Base64Utils.encodeText(null)).toThrow(
        'Please enter text to encode.'
      );
    });

    it('should handle special characters correctly', () => {
      const result = Base64Utils.encodeText('Hello 🌟 World!');
      expect(result).toBe('SGVsbG8g8J+MnyBXb3JsZCE=');
    });

    it('should handle newlines and special characters', () => {
      const result = Base64Utils.encodeText('Hello\nWorld\t!');
      expect(result).toBe('SGVsbG8KV29ybGQJIQ==');
    });
  });

  describe('decodeText', () => {
    it('should decode base64 to text', () => {
      const result = Base64Utils.decodeText('SGVsbG8gV29ybGQ=');
      expect(result).toBe('Hello World');
    });

    it('should throw error for empty input', () => {
      expect(() => Base64Utils.decodeText('')).toThrow(
        'Please enter Base64 to decode.'
      );
      expect(() => Base64Utils.decodeText('   ')).toThrow(
        'Please enter Base64 to decode.'
      );
      expect(() => Base64Utils.decodeText(null)).toThrow(
        'Please enter Base64 to decode.'
      );
    });

    it('should throw error for invalid base64', () => {
      expect(() => Base64Utils.decodeText('invalid-base64!@#')).toThrow(
        'Invalid Base64 format'
      );
      expect(() => Base64Utils.decodeText('SGVsbG8gV29ybGQ')).toThrow(
        'Invalid Base64 format'
      ); // missing padding
    });

    it('should decode special characters correctly', () => {
      const result = Base64Utils.decodeText('SGVsbG8g8J+MnyBXb3JsZCE=');
      expect(result).toBe('Hello 🌟 World!');
    });
  });

  describe('isValidBase64', () => {
    it('should validate correct base64 strings', () => {
      expect(Base64Utils.isValidBase64('SGVsbG8gV29ybGQ=')).toBe(true);
      expect(Base64Utils.isValidBase64('dGVzdA==')).toBe(true);
      expect(Base64Utils.isValidBase64('SGVsbG8g8J+MnyBXb3JsZCE=')).toBe(true);
    });

    it('should reject invalid base64 strings', () => {
      expect(Base64Utils.isValidBase64('invalid!@#')).toBe(false);
      expect(Base64Utils.isValidBase64('SGVsbG8gV29ybGQ')).toBe(false); // missing padding
      expect(Base64Utils.isValidBase64('')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(Base64Utils.isValidBase64('QQ==')).toBe(true); // 'A' encoded
      expect(Base64Utils.isValidBase64('QUI=')).toBe(true); // 'AB' encoded
      expect(Base64Utils.isValidBase64('QUJD')).toBe(true); // 'ABC' encoded
    });
  });
});
