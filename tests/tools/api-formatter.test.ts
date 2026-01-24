/**
 * Test for API Response Formatter utilities
 */

import { describe, it, expect } from 'vitest';
import {
  formatJson,
  minifyJson,
  parseUrlEncoded,
  parseQueryString,
  isValidJson,
} from '@/utils/api-formatter';

describe('API Formatter Utils', () => {
  describe('formatJson', () => {
    it('should format JSON with proper indentation', () => {
      const input = '{"name":"John","age":30}';
      const result = formatJson(input);
      expect(result).toBe('{\n  "name": "John",\n  "age": 30\n}');
    });

    it('should format nested objects', () => {
      const input = '{"person":{"name":"John","age":30}}';
      const result = formatJson(input);
      expect(result).toContain('  "person": {');
      expect(result).toContain('    "name": "John"');
    });

    it('should throw error for empty input', () => {
      expect(() => formatJson('')).toThrow('Please enter JSON to format');
    });

    it('should throw error for invalid JSON', () => {
      expect(() => formatJson('invalid json')).toThrow('Invalid JSON');
    });

    it('should format arrays', () => {
      const input = '{"items":[1,2,3]}';
      const result = formatJson(input);
      expect(result).toContain('  "items": [');
      expect(result).toContain('    1,');
    });
  });

  describe('minifyJson', () => {
    it('should remove whitespace from JSON', () => {
      const input = '{\n  "name": "John",\n  "age": 30\n}';
      const result = minifyJson(input);
      expect(result).toBe('{"name":"John","age":30}');
    });

    it('should minify nested objects', () => {
      const input = '{"person":{"name":"John","age":30}}';
      const result = minifyJson(input);
      expect(result).toBe('{"person":{"name":"John","age":30}}');
    });

    it('should throw error for empty input', () => {
      expect(() => minifyJson('')).toThrow('Please enter JSON to minify');
    });

    it('should throw error for invalid JSON', () => {
      expect(() => minifyJson('invalid json')).toThrow('Invalid JSON');
    });
  });

  describe('parseUrlEncoded', () => {
    it('should parse URL-encoded data to JSON', () => {
      const input = 'name=John&age=30&city=New+York';
      const result = parseUrlEncoded(input);
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({
        name: 'John',
        age: '30',
        city: 'New York',
      });
    });

    it('should handle special characters', () => {
      const input = 'email=test%40example.com';
      const result = parseUrlEncoded(input);
      const parsed = JSON.parse(result);
      expect(parsed.email).toBe('test@example.com');
    });

    it('should handle multiple values with same key', () => {
      const input = 'tags=red&tags=blue';
      const result = parseUrlEncoded(input);
      const parsed = JSON.parse(result);
      // URLSearchParams will take the last value for duplicate keys
      expect(parsed.tags).toBe('blue');
    });

    it('should throw error for empty input', () => {
      expect(() => parseUrlEncoded('')).toThrow('Please enter URL-encoded data');
    });
  });

  describe('parseQueryString', () => {
    it('should parse query string with leading ?', () => {
      const input = '?name=John&age=30';
      const result = parseQueryString(input);
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({
        name: 'John',
        age: '30',
      });
    });

    it('should parse query string without leading ?', () => {
      const input = 'name=John&age=30';
      const result = parseQueryString(input);
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({
        name: 'John',
        age: '30',
      });
    });

    it('should handle URL-encoded values', () => {
      const input = '?search=hello%20world';
      const result = parseQueryString(input);
      const parsed = JSON.parse(result);
      expect(parsed.search).toBe('hello world');
    });

    it('should throw error for empty input', () => {
      expect(() => parseQueryString('')).toThrow('Please enter a query string');
    });
  });

  describe('isValidJson', () => {
    it('should return true for valid JSON', () => {
      expect(isValidJson('{"name":"John"}')).toBe(true);
      expect(isValidJson('["a","b","c"]')).toBe(true);
      expect(isValidJson('123')).toBe(true);
      expect(isValidJson('"string"')).toBe(true);
      expect(isValidJson('true')).toBe(true);
    });

    it('should return false for invalid JSON', () => {
      expect(isValidJson('invalid')).toBe(false);
      expect(isValidJson('{"name":}')).toBe(false);
      expect(isValidJson("{'name':'John'}")).toBe(false); // single quotes
    });

    it('should return false for empty input', () => {
      expect(isValidJson('')).toBe(false);
      expect(isValidJson('   ')).toBe(false);
    });

    it('should return true for JSON with whitespace', () => {
      expect(isValidJson('  {"name":"John"}  ')).toBe(true);
    });
  });
});
