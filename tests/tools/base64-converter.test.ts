/**
 * Test for Base64 utilities
 */

import { describe, it, expect } from 'vitest';
import {
  encodeText,
  decodeText,
  isValidBase64,
  toUrlSafe,
  normalizeBase64,
  bytesToBase64,
  base64ToBytes,
  bytesToDataUri,
  parseDataUri,
  extensionForMime,
  sniffMimeType,
} from '@/utils/base64';

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

  describe('URL-safe', () => {
    it('encodes with - and _ and no padding', () => {
      expect(encodeText('???>>>', { urlSafe: true })).toBe('Pz8_Pj4-');
      expect(encodeText('???>>>')).toBe('Pz8/Pj4+');
      expect(encodeText('a', { urlSafe: true })).toBe('YQ');
    });

    it('decodes standard and URL-safe input, padded or not', () => {
      expect(decodeText('Pz8_Pj4-')).toBe('???>>>');
      expect(decodeText('Pz8/Pj4+')).toBe('???>>>');
      expect(decodeText('YQ')).toBe('a');
      expect(decodeText('YQ==')).toBe('a');
    });

    it('round-trips Unicode', () => {
      const text = 'héllo 世界 🌟';
      expect(decodeText(encodeText(text, { urlSafe: true }))).toBe(text);
      expect(decodeText(encodeText(text))).toBe(text);
    });

    it('ignores whitespace and rejects bad input', () => {
      expect(decodeText('SGVs\nbG8=')).toBe('Hello');
      expect(() => normalizeBase64('A')).toThrow('Invalid Base64 format');
      expect(() => normalizeBase64('ab$d')).toThrow('Invalid Base64 format');
    });

    it('converts to URL-safe form', () => {
      expect(toUrlSafe('Pz8/Pj4+==')).toBe('Pz8_Pj4-');
    });
  });

  describe('bytes and data URIs', () => {
    it('round-trips binary bytes', () => {
      const bytes = new Uint8Array([0, 255, 128, 1, 2, 250]);
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
      expect(Array.from(base64ToBytes(bytesToBase64(bytes, { urlSafe: true })))).toEqual(
        Array.from(bytes)
      );
    });

    it('handles large byte arrays', () => {
      const bytes = new Uint8Array(100000).map((_, i) => i % 256);
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    });

    it('builds and parses data URIs', () => {
      const uri = bytesToDataUri(new TextEncoder().encode('hi'), 'text/plain');
      expect(uri).toBe('data:text/plain;base64,aGk=');
      expect(parseDataUri(uri)).toEqual({ mimeType: 'text/plain', base64: 'aGk=' });
      expect(parseDataUri('data:text/plain;charset=utf-8;base64,aGk=')?.base64).toBe('aGk=');
      expect(parseDataUri('aGk=')).toBeNull();
    });

    it('picks extensions and sniffs file types', () => {
      expect(extensionForMime('image/png')).toBe('png');
      expect(extensionForMime('foo/bar')).toBe('bin');
      expect(sniffMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
      expect(sniffMimeType(new Uint8Array([1, 2, 3]))).toBeNull();
    });

    it('rejects non UTF-8 data as text', () => {
      expect(() => decodeText(bytesToBase64(new Uint8Array([0xff, 0xfe, 0xfd])))).toThrow(
        'not valid UTF-8'
      );
    });
  });
});
