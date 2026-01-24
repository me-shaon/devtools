/**
 * Test for CSV to JSON Converter utilities
 */

import { describe, it, expect } from 'vitest';
import {
  parseCSV,
  csvToJson,
  jsonToCsv,
  csvToArray,
  detectDelimiter,
} from '@/utils/csv';

describe('CSV Utils', () => {
  describe('parseCSV', () => {
    it('should parse simple CSV', () => {
      const csv = 'name,age,city\nJohn,30,NYC\nJane,25,LA';
      const result = parseCSV(csv);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(['name', 'age', 'city']);
      expect(result[1]).toEqual(['John', '30', 'NYC']);
    });

    it('should handle quoted values', () => {
      const csv = 'name,description\n"John Doe","A person, with commas"';
      const result = parseCSV(csv);
      expect(result[1]).toEqual(['John Doe', 'A person, with commas']);
    });

    it('should handle escaped quotes', () => {
      const csv = 'name,quote\n"Test ""Hello""","Quote"';
      const result = parseCSV(csv);
      expect(result[1][0]).toBe('Test "Hello"');
    });

    it('should handle empty lines', () => {
      const csv = 'name,age\nJohn,30\n\nJane,25';
      const result = parseCSV(csv);
      expect(result).toHaveLength(3); // header + 2 data rows (empty line skipped)
    });

    it('should handle different delimiters', () => {
      const csv = 'name;age;city\nJohn;30;NYC';
      const result = parseCSV(csv, { delimiter: ';' });
      expect(result[0]).toEqual(['name', 'age', 'city']);
    });

    it('should handle tab delimiter', () => {
      const csv = 'name\tage\nJohn\t30';
      const result = parseCSV(csv, { delimiter: '\t' });
      expect(result[0]).toEqual(['name', 'age']);
    });

    it('should trim values by default', () => {
      const csv = 'name,age\n  John  ,  30  ';
      const result = parseCSV(csv);
      expect(result[1]).toEqual(['John', '30']);
    });

    it('should not trim when trimValues is false', () => {
      const csv = 'name,age\n  John  ,  30  ';
      const result = parseCSV(csv, { trimValues: false });
      expect(result[1][0]).toBe('  John  ');
    });
  });

  describe('csvToJson', () => {
    it('should convert CSV to JSON with headers', () => {
      const csv = 'name,age,city\nJohn,30,NYC\nJane,25,LA';
      const result = csvToJson(csv);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'John', age: 30, city: 'NYC' });
      expect(result[1]).toEqual({ name: 'Jane', age: 25, city: 'LA' });
    });

    it('should handle CSV without headers', () => {
      const csv = 'John,30,NYC\nJane,25,LA';
      const result = csvToJson(csv, { hasHeader: false });
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('data');
    });

    it('should handle empty CSV', () => {
      const result = csvToJson('');
      expect(result).toEqual([]);
    });

    it('should handle missing values', () => {
      const csv = 'name,age,city\nJohn,30,\nJane,25,LA';
      const result = csvToJson(csv);
      expect(result[0].city).toBe('');
      expect(result[1].city).toBe('LA');
    });

    it('should handle different delimiters', () => {
      const csv = 'name;age;city\nJohn;30;NYC';
      const result = csvToJson(csv, { delimiter: ';' });
      expect(result[0]).toEqual({ name: 'John', age: 30, city: 'NYC' });
    });
  });

  describe('jsonToCsv', () => {
    it('should convert JSON to CSV', () => {
      const data = [
        { name: 'John', age: 30, city: 'NYC' },
        { name: 'Jane', age: 25, city: 'LA' },
      ];
      const result = jsonToCsv(data);
      expect(result).toContain('name,age,city');
      expect(result).toContain('John,30,NYC');
      expect(result).toContain('Jane,25,LA');
    });

    it('should handle values with commas', () => {
      const data = [{ name: 'John, Doe', age: 30 }];
      const result = jsonToCsv(data);
      expect(result).toContain('"John, Doe"');
    });

    it('should handle empty array', () => {
      const result = jsonToCsv([]);
      expect(result).toBe('');
    });

    it('should handle null/undefined values', () => {
      const data = [{ name: 'John', age: null, city: undefined }];
      const result = jsonToCsv(data);
      expect(result).toContain('John,,');
    });

    it('should work without headers', () => {
      const data = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ];
      const result = jsonToCsv(data, { hasHeader: false });
      expect(result).not.toContain('name,age');
      expect(result).toContain('John,30');
    });

    it('should use custom delimiter', () => {
      const data = [{ name: 'John', age: 30 }];
      const result = jsonToCsv(data, { delimiter: ';' });
      expect(result).toContain('name;age');
      expect(result).toContain('John;30');
    });
  });

  describe('csvToArray', () => {
    it('should convert CSV to 2D array', () => {
      const csv = 'a,b,c\n1,2,3\n4,5,6';
      const result = csvToArray(csv);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(['a', 'b', 'c']);
      expect(result[1]).toEqual(['1', '2', '3']);
    });

    it('should handle simple CSV without headers', () => {
      const csv = 'John,30,NYC\nJane,25,LA';
      const result = csvToArray(csv);
      expect(result).toHaveLength(2);
    });
  });

  describe('detectDelimiter', () => {
    it('should detect comma delimiter', () => {
      const csv = 'name,age,city\nJohn,30,NYC';
      const delimiter = detectDelimiter(csv);
      expect(delimiter).toBe(',');
    });

    it('should detect semicolon delimiter', () => {
      const csv = 'name;age;city\nJohn;30;NYC';
      const delimiter = detectDelimiter(csv);
      expect(delimiter).toBe(';');
    });

    it('should detect tab delimiter', () => {
      const csv = 'name\tage\tcity\nJohn\t30\tNYC';
      const delimiter = detectDelimiter(csv);
      expect(delimiter).toBe('\t');
    });

    it('should detect pipe delimiter', () => {
      const csv = 'name|age|city\nJohn|30|NYC';
      const delimiter = detectDelimiter(csv);
      expect(delimiter).toBe('|');
    });

    it('should default to comma when unknown', () => {
      const csv = 'name age city\nJohn 30 NYC';
      const delimiter = detectDelimiter(csv);
      expect(delimiter).toBe(',');
    });
  });

  describe('round-trip conversion', () => {
    it('should maintain data integrity CSV -> JSON -> CSV', () => {
      const originalCsv = 'name,age,city\nJohn,30,NYC\nJane,25,LA';
      const json = csvToJson(originalCsv);
      const resultCsv = jsonToCsv(json);
      const resultJson = csvToJson(resultCsv);

      expect(resultJson).toEqual(json);
    });

    it('should maintain data integrity JSON -> CSV -> JSON', () => {
      const originalJson = [
        { name: 'John', age: 30, city: 'NYC' },
        { name: 'Jane', age: 25, city: 'LA' },
      ];
      const csv = jsonToCsv(originalJson);
      const resultJson = csvToJson(csv);

      expect(resultJson).toEqual(originalJson);
    });
  });
});
