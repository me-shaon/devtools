/**
 * Test for JSON Viewer utilities
 */

import { describe, it, expect } from 'vitest';
import {
  parseJson,
  getJsonType,
  formatJson,
  minifyJson,
  sortJsonKeys,
  jsonToXml,
  jsonToYaml,
  getJsonPaths,
  queryJson,
  getJsonStats,
} from '@/utils/json';

describe('JSON Utils', () => {
  const sampleJson = {
    name: 'John',
    age: 30,
    active: true,
    address: { city: 'NYC', country: 'USA' },
    hobbies: ['reading', 'coding'],
  };

  describe('parseJson', () => {
    it('should parse valid JSON', () => {
      const input = JSON.stringify(sampleJson);
      const result = parseJson(input);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleJson);
    });

    it('should build tree structure', () => {
      const input = JSON.stringify(sampleJson);
      const result = parseJson(input);
      expect(result.tree).toBeDefined();
      expect(result.tree?.type).toBe('object');
    });

    it('should handle invalid JSON', () => {
      const result = parseJson('invalid');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle empty object', () => {
      const result = parseJson('{}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });
  });

  describe('getJsonType', () => {
    it('should identify string', () => {
      expect(getJsonType('hello')).toBe('string');
    });

    it('should identify number', () => {
      expect(getJsonType(42)).toBe('number');
    });

    it('should identify boolean', () => {
      expect(getJsonType(true)).toBe('boolean');
    });

    it('should identify null', () => {
      expect(getJsonType(null)).toBe('null');
    });

    it('should identify array', () => {
      expect(getJsonType([1, 2, 3])).toBe('array');
    });

    it('should identify object', () => {
      expect(getJsonType({ key: 'value' })).toBe('object');
    });
  });

  describe('formatJson', () => {
    it('should format JSON with indentation', () => {
      const input = '{"name":"John","age":30}';
      const result = formatJson(input);
      expect(result).toContain('  ');
    });

    it('should handle invalid JSON', () => {
      const result = formatJson('invalid');
      expect(result).toBeNull();
    });

    it('should use custom indent', () => {
      const input = '{"name":"John"}';
      const result = formatJson(input, 4);
      expect(result).toContain('    ');
    });
  });

  describe('minifyJson', () => {
    it('should remove whitespace', () => {
      const input = '{\n  "name": "John",\n  "age": 30\n}';
      const result = minifyJson(input);
      expect(result).toBe('{"name":"John","age":30}');
    });

    it('should handle invalid JSON', () => {
      const result = minifyJson('invalid');
      expect(result).toBeNull();
    });
  });

  describe('sortJsonKeys', () => {
    it('should sort object keys alphabetically', () => {
      const input = '{"z":1,"a":2,"m":3}';
      const result = sortJsonKeys(input);
      expect(result).toContain('"a"');
      expect(result?.indexOf('"a"')).toBeLessThan(result?.indexOf('"m"'));
    });

    it('should handle nested objects', () => {
      const input = '{"outer":{"z":1,"a":2}}';
      const result = sortJsonKeys(input);
      expect(result).not.toBeNull();
    });
  });

  describe('jsonToXml', () => {
    it('should convert simple object to XML', () => {
      const input = '{"name":"John","age":30}';
      const result = jsonToXml(input);
      expect(result).toContain('<name>John</name>');
      expect(result).toContain('<age>30</age>');
    });

    it('should handle nested objects', () => {
      const input = '{"person":{"name":"John"}}';
      const result = jsonToXml(input);
      expect(result).toContain('<person>');
      expect(result).toContain('<name>John</name>');
    });

    it('should handle arrays', () => {
      const input = '{"items":[1,2,3]}';
      const result = jsonToXml(input);
      expect(result).toContain('<items>');
    });

    it('should handle invalid JSON', () => {
      const result = jsonToXml('invalid');
      expect(result).toBeNull();
    });
  });

  describe('jsonToYaml', () => {
    it('should convert object to YAML', () => {
      const input = '{"name":"John","age":30}';
      const result = jsonToYaml(input);
      expect(result).toContain('name:');
      expect(result).toContain('age:');
    });

    it('should handle nested objects', () => {
      const input = '{"person":{"name":"John"}}';
      const result = jsonToYaml(input);
      expect(result).toContain('person:');
    });

    it('should handle invalid JSON', () => {
      const result = jsonToYaml('invalid');
      expect(result).toBeNull();
    });
  });

  describe('getJsonPaths', () => {
    it('should generate paths for nested object', () => {
      const data = { user: { name: 'John' } };
      const paths = getJsonPaths(data);
      expect(paths).toContain('user');
      expect(paths).toContain('user.name');
    });

    it('should generate paths for arrays', () => {
      const data = { items: [1, 2, 3] };
      const paths = getJsonPaths(data);
      expect(paths).toContain('items[0]');
      expect(paths).toContain('items[1]');
    });

    it('should handle empty object', () => {
      const paths = getJsonPaths({});
      expect(paths).toHaveLength(0);
    });
  });

  describe('queryJson', () => {
    it('should query nested property', () => {
      const data = { user: { name: 'John' } };
      const result = queryJson(data, 'user.name');
      expect(result).toBe('John');
    });

    it('should query array element', () => {
      const data = { items: ['a', 'b', 'c'] };
      const result = queryJson(data, 'items[1]');
      expect(result).toBe('b');
    });

    it('should return null for invalid path', () => {
      const data = { user: { name: 'John' } };
      const result = queryJson(data, 'user.invalid');
      expect(result).toBeNull();
    });
  });

  describe('getJsonStats', () => {
    it('should calculate statistics', () => {
      const input = JSON.stringify(sampleJson);
      const stats = getJsonStats(input);
      expect(stats).not.toBeNull();
      expect(stats?.keys).toBeGreaterThan(0);
    });

    it('should count objects', () => {
      const input = '{"a":{},"b":{}}';
      const stats = getJsonStats(input);
      expect(stats?.objects).toBe(3); // 2 inner + 1 root
    });

    it('should count arrays', () => {
      const input = '{"arr1":[],"arr2":[]}';
      const stats = getJsonStats(input);
      // Root is an object (1), plus 2 inner arrays = 2 total (not counting root object)
      expect(stats?.arrays).toBe(2);
    });

    it('should calculate depth', () => {
      const input = '{"a":{"b":{"c":1}}}';
      const stats = getJsonStats(input);
      expect(stats?.depth).toBe(3);
    });

    it('should handle invalid JSON', () => {
      const stats = getJsonStats('invalid');
      expect(stats).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle unicode characters', () => {
      const input = '{"message":"Hello 世界"}';
      const result = parseJson(input);
      expect(result.success).toBe(true);
    });

    it('should handle escaped characters', () => {
      const input = '{"text":"Line 1\\nLine 2"}';
      const result = parseJson(input);
      expect(result.success).toBe(true);
    });

    it('should handle very large numbers', () => {
      const input = '{"big":9007199254740991}';
      const result = parseJson(input);
      expect(result.success).toBe(true);
    });
  });
});
