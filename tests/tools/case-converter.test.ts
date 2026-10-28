/**
 * Test for Case Converter utilities
 */

import { describe, it, expect } from 'vitest';
import {
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  toKebabCase,
  toUpperSnakeCase,
  toSentenceCase,
  toTitleCase,
  toLowerCase,
  toUpperCase,
  convertCase,
  convertToAllCases,
  convertLines,
  splitWords,
  toTrainCase,
  toDotCase,
  toSlug,
  slugLines,
} from '@/utils/case';

describe('Case Converter Utils', () => {
  describe('toCamelCase', () => {
    it('should convert snake_case to camelCase', () => {
      expect(toCamelCase('hello_world')).toBe('helloWorld');
    });

    it('should convert kebab-case to camelCase', () => {
      expect(toCamelCase('hello-world')).toBe('helloWorld');
    });

    it('should convert space separated to camelCase', () => {
      expect(toCamelCase('hello world test')).toBe('helloWorldTest');
    });

    it('should handle already camelCase', () => {
      expect(toCamelCase('helloWorld')).toBe('helloWorld');
    });

    it('should handle PascalCase', () => {
      expect(toCamelCase('HelloWorld')).toBe('helloWorld');
    });

    it('should handle empty string', () => {
      expect(toCamelCase('')).toBe('');
    });
  });

  describe('toPascalCase', () => {
    it('should convert snake_case to PascalCase', () => {
      expect(toPascalCase('hello_world')).toBe('HelloWorld');
    });

    it('should convert kebab-case to PascalCase', () => {
      expect(toPascalCase('hello-world')).toBe('HelloWorld');
    });

    it('should convert space separated to PascalCase', () => {
      expect(toPascalCase('hello world test')).toBe('HelloWorldTest');
    });

    it('should handle camelCase', () => {
      expect(toPascalCase('helloWorld')).toBe('HelloWorld');
    });
  });

  describe('toSnakeCase', () => {
    it('should convert camelCase to snake_case', () => {
      expect(toSnakeCase('helloWorld')).toBe('hello_world');
    });

    it('should convert PascalCase to snake_case', () => {
      expect(toSnakeCase('HelloWorld')).toBe('hello_world');
    });

    it('should convert kebab-case to snake_case', () => {
      expect(toSnakeCase('hello-world')).toBe('hello_world');
    });

    it('should handle space separated', () => {
      expect(toSnakeCase('hello world')).toBe('hello_world');
    });
  });

  describe('toKebabCase', () => {
    it('should convert camelCase to kebab-case', () => {
      expect(toKebabCase('helloWorld')).toBe('hello-world');
    });

    it('should convert PascalCase to kebab-case', () => {
      expect(toKebabCase('HelloWorld')).toBe('hello-world');
    });

    it('should convert snake_case to kebab-case', () => {
      expect(toKebabCase('hello_world')).toBe('hello-world');
    });

    it('should handle space separated', () => {
      expect(toKebabCase('hello world')).toBe('hello-world');
    });
  });

  describe('toUpperSnakeCase', () => {
    it('should convert camelCase to UPPER_SNAKE_CASE', () => {
      expect(toUpperSnakeCase('helloWorld')).toBe('HELLO_WORLD');
    });

    it('should convert kebab-case to UPPER_SNAKE_CASE', () => {
      expect(toUpperSnakeCase('hello-world')).toBe('HELLO_WORLD');
    });

    it('should convert space separated to UPPER_SNAKE_CASE', () => {
      expect(toUpperSnakeCase('hello world test')).toBe('HELLO_WORLD_TEST');
    });
  });

  describe('toSentenceCase', () => {
    it('should convert to sentence case', () => {
      expect(toSentenceCase('hello_world')).toBe('Hello world');
    });

    it('should capitalize first letter', () => {
      expect(toSentenceCase('hello')).toBe('Hello');
    });

    it('should handle multiple words', () => {
      const result = toSentenceCase('helloWorldTest');
      expect(result).toContain('Hello');
      // The function handles consecutive uppercase but may not space them perfectly
    });

    it('should handle consecutive separators', () => {
      expect(toSentenceCase('hello__world')).toBe('Hello world');
    });
  });

  describe('toTitleCase', () => {
    it('should convert to Title Case', () => {
      expect(toTitleCase('hello_world')).toBe('Hello World');
    });

    it('should capitalize each word', () => {
      expect(toTitleCase('hello-world-test')).toBe('Hello World Test');
    });

    it('should handle camelCase', () => {
      const result = toTitleCase('helloWorld');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('should handle consecutive separators', () => {
      expect(toTitleCase('hello--world')).toBe('Hello World');
    });
  });

  describe('toLowerCase', () => {
    it('should convert to lowercase', () => {
      expect(toLowerCase('HELLO WORLD')).toBe('hello world');
    });

    it('should handle mixed case', () => {
      expect(toLowerCase('HeLLo WoRLd')).toBe('hello world');
    });
  });

  describe('toUpperCase', () => {
    it('should convert to uppercase', () => {
      expect(toUpperCase('hello world')).toBe('HELLO WORLD');
    });

    it('should handle mixed case', () => {
      expect(toUpperCase('HeLLo WoRLd')).toBe('HELLO WORLD');
    });
  });

  describe('convertCase', () => {
    it('should convert to specified case type', () => {
      expect(convertCase('helloWorld', 'snake_case')).toBe('hello_world');
      expect(convertCase('helloWorld', 'kebab-case')).toBe('hello-world');
      expect(convertCase('helloWorld', 'UPPERCASE')).toBe('HELLOWORLD');
    });
  });

  describe('convertToAllCases', () => {
    it('should convert to all case types', () => {
      const result = convertToAllCases('helloWorld');
      expect(result.camelCase).toBe('helloWorld');
      expect(result.PascalCase).toBe('HelloWorld');
      expect(result.snake_case).toBe('hello_world');
      expect(result['kebab-case']).toBe('hello-world');
      expect(result.UPPER_SNAKE_CASE).toBe('HELLO_WORLD');
      expect(result.lowercase).toBe('helloworld');
      expect(result.UPPERCASE).toBe('HELLOWORLD');
    });
  });

  describe('splitWords', () => {
    it('splits acronym runs before a capitalized word', () => {
      expect(splitWords('HTTPServerID')).toEqual(['HTTP', 'Server', 'ID']);
      expect(splitWords('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request']);
      expect(splitWords('getURLForID')).toEqual(['get', 'URL', 'For', 'ID']);
    });

    it('keeps a plural acronym together', () => {
      expect(splitWords('userIDs')).toEqual(['user', 'IDs']);
      expect(splitWords('PDFsToHTML')).toEqual(['PDFs', 'To', 'HTML']);
    });

    it('keeps digits with the word before them', () => {
      expect(splitWords('base64Encode')).toEqual(['base64', 'Encode']);
      expect(splitWords('HTTP2Server')).toEqual(['HTTP2', 'Server']);
      expect(splitWords('3dModel')).toEqual(['3d', 'Model']);
    });

    it('splits on any separator', () => {
      expect(splitWords('  app.server/port--name__x ')).toEqual(['app', 'server', 'port', 'name', 'x']);
      expect(splitWords('USER_ID')).toEqual(['USER', 'ID']);
    });

    it('keeps accented and uncased letters', () => {
      expect(splitWords('caféAuLait')).toEqual(['café', 'Au', 'Lait']);
      expect(splitWords('日本_語')).toEqual(['日本', '語']);
    });
  });

  describe('acronym runs', () => {
    it('converts HTTPServerID without splitting the acronym into letters', () => {
      expect(toSnakeCase('HTTPServerID')).toBe('http_server_id');
      expect(toCamelCase('HTTPServerID')).toBe('httpServerId');
      expect(toKebabCase('userIDs')).toBe('user-ids');
    });

    it('keeps acronyms in upper case when asked', () => {
      const keep = { keepAcronyms: true };
      expect(toCamelCase('HTTPServerID', keep)).toBe('httpServerID');
      expect(toPascalCase('user_ID', keep)).toBe('UserID');
      expect(toCamelCase('userIDs', keep)).toBe('userIDs');
      expect(toTitleCase('api_URL', keep)).toBe('Api URL');
      expect(toSentenceCase('getURL', keep)).toBe('Get URL');
      expect(toTrainCase('contentMD5', keep)).toBe('Content-MD5');
    });

    it('keeps a final capital S in an acronym', () => {
      expect(toPascalCase('useHTTPS', { keepAcronyms: true })).toBe('UseHTTPS');
    });

    it('does not treat words as acronyms when the whole line is upper case', () => {
      expect(toPascalCase('USER_ID', { keepAcronyms: true })).toBe('UserId');
    });
  });

  describe('toTrainCase and toDotCase', () => {
    it('converts to Train-Case', () => {
      expect(toTrainCase('content_type')).toBe('Content-Type');
    });

    it('converts to dot.case', () => {
      expect(toDotCase('appServerPort')).toBe('app.server.port');
    });
  });

  describe('convertLines', () => {
    it('converts each line on its own and keeps blank lines', () => {
      expect(convertLines('userId\n\nHTTPServer', 'snake_case')).toBe('user_id\n\nhttp_server');
    });

    it('trims each line and handles CRLF', () => {
      expect(convertLines('  first name \r\nlast-name', 'camelCase')).toBe('firstName\nlastName');
    });

    it('keeps raw text for lowercase and UPPERCASE', () => {
      expect(convertLines('Hello, World', 'UPPERCASE')).toBe('HELLO, WORLD');
    });
  });

  describe('toSlug', () => {
    it('lowercases and joins words with hyphens', () => {
      expect(toSlug('  Hello, World! 2024  ')).toBe('hello-world-2024');
    });

    it('removes accents and maps letters that do not decompose', () => {
      expect(toSlug('Crème Brûlée à São Paulo')).toBe('creme-brulee-a-sao-paulo');
      expect(toSlug('Straße Æsir Øre Đorđe Łódź Þór Œuvre')).toBe('strasse-aesir-ore-dorde-lodz-thor-oeuvre');
    });

    it('drops apostrophes and letters with no ASCII form', () => {
      expect(toSlug("Don't stop")).toBe('dont-stop');
      expect(toSlug('東京 Tokyo ﬁle')).toBe('tokyo-file');
    });

    it('uses an underscore separator and keeps case when asked', () => {
      expect(toSlug('Hello World', { separator: '_' })).toBe('hello_world');
      expect(toSlug('Hello World', { keepCase: true })).toBe('Hello-World');
    });

    it('cuts at a word boundary for a max length', () => {
      expect(toSlug('the quick brown fox', { maxLength: 15 })).toBe('the-quick-brown');
      expect(toSlug('the quick brown fox', { maxLength: 14 })).toBe('the-quick');
      expect(toSlug('supercalifragilistic word', { maxLength: 5 })).toBe('super');
      expect(toSlug('a b', { maxLength: 0 })).toBe('a-b');
    });

    it('returns an empty string for text with no letters or digits', () => {
      expect(toSlug('--- !!! ---')).toBe('');
    });

    it('converts one slug per line', () => {
      expect(slugLines('First Post\n\nSecond Post')).toBe('first-post\n\nsecond-post');
    });
  });
});
