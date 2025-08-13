const APIFormatterUtils = require('../../src/utils/api-formatter-utils');

describe('APIFormatterUtils', () => {
  // Mock DOM for testing
  beforeAll(() => {
    global.document = {
      createElement: jest.fn(() => {
        const div = {
          textContent: '',
          innerHTML: '',
        };
        Object.defineProperty(div, 'textContent', {
          set: function (value) {
            // Simulate browser HTML escaping
            this.innerHTML = value
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          },
          get: function () {
            return this._textContent || '';
          },
        });
        return div;
      }),
    };
  });

  afterAll(() => {
    delete global.document;
  });
  describe('parseResponse', () => {
    test('should parse valid JSON', () => {
      const input = '{"name": "John", "age": 30}';
      const result = APIFormatterUtils.parseResponse(input, 'json');
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    test('should parse valid GraphQL response', () => {
      const input = '{"data": {"user": {"name": "John"}}}';
      const result = APIFormatterUtils.parseResponse(input, 'graphql');
      expect(result).toEqual({ data: { user: { name: 'John' } } });
    });

    test('should parse GraphQL response with errors', () => {
      const input = '{"errors": [{"message": "Field not found"}]}';
      const result = APIFormatterUtils.parseResponse(input, 'graphql');
      expect(result).toEqual({ errors: [{ message: 'Field not found' }] });
    });

    test('should parse GraphQL response with both data and errors', () => {
      const input =
        '{"data": {"user": null}, "errors": [{"message": "User not found"}]}';
      const result = APIFormatterUtils.parseResponse(input, 'graphql');
      expect(result).toEqual({
        data: { user: null },
        errors: [{ message: 'User not found' }],
      });
    });

    test('should throw error for empty input', () => {
      expect(() => APIFormatterUtils.parseResponse('', 'json')).toThrow(
        'Input cannot be empty'
      );
      expect(() => APIFormatterUtils.parseResponse('   ', 'json')).toThrow(
        'Input cannot be empty'
      );
      expect(() => APIFormatterUtils.parseResponse(null, 'json')).toThrow(
        'Input cannot be empty'
      );
    });

    test('should throw error for invalid JSON', () => {
      const input = '{"name": "John", age: 30}'; // Missing quotes around 'age'
      expect(() => APIFormatterUtils.parseResponse(input, 'json')).toThrow(
        /Invalid JSON format/
      );
    });

    test('should throw error for invalid GraphQL response structure', () => {
      const input = '{"user": {"name": "John"}}'; // Missing data or errors field
      expect(() => APIFormatterUtils.parseResponse(input, 'graphql')).toThrow(
        'GraphQL response must contain either "data" or "errors" field'
      );
    });

    test('should throw error for unsupported response type', () => {
      const input = '{"name": "John"}';
      expect(() => APIFormatterUtils.parseResponse(input, 'xml')).toThrow(
        'Unsupported response type'
      );
    });
  });

  describe('validateGraphQLResponse', () => {
    test('should validate response with data field', () => {
      const response = { data: { user: { name: 'John' } } };
      expect(() =>
        APIFormatterUtils.validateGraphQLResponse(response)
      ).not.toThrow();
    });

    test('should validate response with errors field', () => {
      const response = { errors: [{ message: 'Error' }] };
      expect(() =>
        APIFormatterUtils.validateGraphQLResponse(response)
      ).not.toThrow();
    });

    test('should validate response with both fields', () => {
      const response = {
        data: { user: null },
        errors: [{ message: 'Error' }],
      };
      expect(() =>
        APIFormatterUtils.validateGraphQLResponse(response)
      ).not.toThrow();
    });

    test('should throw error for non-object response', () => {
      expect(() => APIFormatterUtils.validateGraphQLResponse('string')).toThrow(
        'GraphQL response must be an object'
      );
      expect(() => APIFormatterUtils.validateGraphQLResponse(null)).toThrow(
        'GraphQL response must be an object'
      );
      expect(() => APIFormatterUtils.validateGraphQLResponse(123)).toThrow(
        'GraphQL response must be an object'
      );
    });

    test('should throw error for response without required fields', () => {
      const response = { user: { name: 'John' } };
      expect(() => APIFormatterUtils.validateGraphQLResponse(response)).toThrow(
        'GraphQL response must contain either "data" or "errors" field'
      );
    });
  });

  describe('generateTreeHTML', () => {
    test('should generate HTML for null value', () => {
      const result = APIFormatterUtils.generateTreeHTML(null);
      expect(result).toContain('tree-null');
      expect(result).toContain('null');
    });

    test('should generate HTML for undefined value', () => {
      const result = APIFormatterUtils.generateTreeHTML(undefined);
      expect(result).toContain('tree-undefined');
      expect(result).toContain('undefined');
    });

    test('should generate HTML for string value', () => {
      const result = APIFormatterUtils.generateTreeHTML('hello');
      expect(result).toContain('tree-string');
      expect(result).toContain('"hello"');
    });

    test('should generate HTML for number value', () => {
      const result = APIFormatterUtils.generateTreeHTML(42);
      expect(result).toContain('tree-number');
      expect(result).toContain('42');
    });

    test('should generate HTML for boolean value', () => {
      const result = APIFormatterUtils.generateTreeHTML(true);
      expect(result).toContain('tree-boolean');
      expect(result).toContain('true');
    });

    test('should generate HTML for empty array', () => {
      const result = APIFormatterUtils.generateTreeHTML([]);
      expect(result).toContain('tree-array');
      expect(result).toContain('[]');
    });

    test('should generate HTML for empty object', () => {
      const result = APIFormatterUtils.generateTreeHTML({});
      expect(result).toContain('tree-object');
      expect(result).toContain('{}');
    });

    test('should generate HTML for simple array', () => {
      const result = APIFormatterUtils.generateTreeHTML([1, 2, 3]);
      expect(result).toContain('tree-toggle');
      expect(result).toContain('tree-array-bracket');
      expect(result).toContain('3 items');
      expect(result).toContain('tree-number');
    });

    test('should generate HTML for simple object', () => {
      const result = APIFormatterUtils.generateTreeHTML({
        name: 'John',
        age: 30,
      });
      expect(result).toContain('tree-toggle');
      expect(result).toContain('tree-object-bracket');
      expect(result).toContain('2 keys');
      expect(result).toContain('tree-key');
      expect(result).toContain('"name"');
      expect(result).toContain('"age"');
    });

    test('should escape HTML in string values', () => {
      const result = APIFormatterUtils.generateTreeHTML(
        "<script>alert('xss')</script>"
      );
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    test('should handle nested objects and arrays', () => {
      const data = {
        users: [
          { name: 'John', active: true },
          { name: 'Jane', active: false },
        ],
        meta: {
          total: 2,
          page: 1,
        },
      };
      const result = APIFormatterUtils.generateTreeHTML(data);
      expect(result).toContain('tree-toggle');
      expect(result).toContain('"users"');
      expect(result).toContain('"meta"');
      expect(result).toContain('2 items');
      expect(result).toContain('2 keys');
    });
  });

  describe('escapeHtml', () => {
    test('should escape HTML entities', () => {
      const result = APIFormatterUtils.escapeHtml(
        '<script>alert("xss")</script>'
      );
      expect(result).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    test('should escape ampersands', () => {
      const result = APIFormatterUtils.escapeHtml('Tom & Jerry');
      expect(result).toBe('Tom &amp; Jerry');
    });

    test('should handle empty string', () => {
      const result = APIFormatterUtils.escapeHtml('');
      expect(result).toBe('');
    });
  });

  describe('getResponseInfo', () => {
    test('should return info for object', () => {
      const data = { name: 'John', age: 30 };
      const info = APIFormatterUtils.getResponseInfo(data);
      expect(info.type).toBe('object');
      expect(info.keys).toBe(2);
      expect(info.depth).toBe(1);
      expect(typeof info.size).toBe('string');
      expect(typeof info.charactersCount).toBe('number');
    });

    test('should return info for array', () => {
      const data = [1, 2, 3];
      const info = APIFormatterUtils.getResponseInfo(data);
      expect(info.type).toBe('Array');
      expect(info.keys).toBe(3);
      expect(info.depth).toBe(1);
    });

    test('should return info for primitive value', () => {
      const data = 'hello';
      const info = APIFormatterUtils.getResponseInfo(data);
      expect(info.type).toBe('string');
      expect(info.keys).toBe(0);
      expect(info.depth).toBe(0);
    });
  });

  describe('countKeys', () => {
    test('should count keys in object', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(APIFormatterUtils.countKeys(obj)).toBe(3);
    });

    test('should count items in array', () => {
      const arr = [1, 2, 3, 4];
      expect(APIFormatterUtils.countKeys(arr)).toBe(4);
    });

    test('should count nested keys recursively', () => {
      const obj = {
        a: 1,
        b: { c: 2, d: 3 },
        e: [4, 5],
      };
      // a(1) + b(1) + c,d(2) + e(1) + array items(2) = 7
      expect(APIFormatterUtils.countKeys(obj)).toBe(7);
    });

    test('should return 0 for primitives', () => {
      expect(APIFormatterUtils.countKeys('string')).toBe(0);
      expect(APIFormatterUtils.countKeys(42)).toBe(0);
      expect(APIFormatterUtils.countKeys(true)).toBe(0);
      expect(APIFormatterUtils.countKeys(null)).toBe(0);
    });
  });

  describe('getMaxDepth', () => {
    test('should return correct depth for flat object', () => {
      const obj = { a: 1, b: 2 };
      expect(APIFormatterUtils.getMaxDepth(obj)).toBe(1);
    });

    test('should return correct depth for nested object', () => {
      const obj = {
        a: {
          b: {
            c: 1,
          },
        },
      };
      expect(APIFormatterUtils.getMaxDepth(obj)).toBe(3);
    });

    test('should return correct depth for mixed nested structure', () => {
      const obj = {
        a: 1,
        b: {
          c: 2,
          d: {
            e: 3,
          },
        },
        f: [4, { g: 5 }],
      };
      expect(APIFormatterUtils.getMaxDepth(obj)).toBe(3);
    });

    test('should return 0 for primitives', () => {
      expect(APIFormatterUtils.getMaxDepth('string')).toBe(0);
      expect(APIFormatterUtils.getMaxDepth(42)).toBe(0);
      expect(APIFormatterUtils.getMaxDepth(null)).toBe(0);
    });
  });

  describe('formatBytes', () => {
    test('should format bytes correctly', () => {
      expect(APIFormatterUtils.formatBytes(0)).toBe('0 B');
      expect(APIFormatterUtils.formatBytes(1024)).toBe('1 KB');
      expect(APIFormatterUtils.formatBytes(1536)).toBe('1.5 KB');
      expect(APIFormatterUtils.formatBytes(1048576)).toBe('1 MB');
      expect(APIFormatterUtils.formatBytes(1073741824)).toBe('1 GB');
    });

    test('should handle decimal places', () => {
      expect(APIFormatterUtils.formatBytes(1234)).toBe('1.21 KB');
      expect(APIFormatterUtils.formatBytes(1234567)).toBe('1.18 MB');
    });
  });

  describe('searchInData', () => {
    const testData = {
      name: 'John Doe',
      age: 30,
      address: {
        street: 'Main Street',
        city: 'New York',
      },
      hobbies: ['reading', 'swimming', 'coding'],
    };

    test('should find string matches in values', () => {
      const results = APIFormatterUtils.searchInData(testData, 'john');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.match === 'content')).toBe(true);
    });

    test('should find matches in keys', () => {
      const results = APIFormatterUtils.searchInData(testData, 'name');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.match === 'key')).toBe(true);
    });

    test('should find matches in nested objects', () => {
      const results = APIFormatterUtils.searchInData(testData, 'street');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.path.includes('address'))).toBe(true);
    });

    test('should find matches in arrays', () => {
      const results = APIFormatterUtils.searchInData(testData, 'coding');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.path.includes('hobbies'))).toBe(true);
    });

    test('should return empty array for no matches', () => {
      const results = APIFormatterUtils.searchInData(testData, 'nonexistent');
      expect(results).toEqual([]);
    });

    test('should return empty array for empty search term', () => {
      const results = APIFormatterUtils.searchInData(testData, '');
      expect(results).toEqual([]);
      const results2 = APIFormatterUtils.searchInData(testData, '   ');
      expect(results2).toEqual([]);
    });

    test('should be case insensitive', () => {
      const results = APIFormatterUtils.searchInData(testData, 'JOHN');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('highlightSearchResults', () => {
    test('should highlight search term in HTML', () => {
      const html = '<div>Hello World</div>';
      const result = APIFormatterUtils.highlightSearchResults(html, 'world');
      expect(result).toContain('<mark class="search-highlight">World</mark>');
    });

    test('should handle case insensitive highlighting', () => {
      const html = '<div>Hello WORLD world</div>';
      const result = APIFormatterUtils.highlightSearchResults(html, 'world');
      expect(result).toContain('<mark class="search-highlight">WORLD</mark>');
      expect(result).toContain('<mark class="search-highlight">world</mark>');
    });

    test('should return original HTML for empty search term', () => {
      const html = '<div>Hello World</div>';
      const result = APIFormatterUtils.highlightSearchResults(html, '');
      expect(result).toBe(html);
    });

    test('should escape special regex characters in search term', () => {
      const html = '<div>Price: $10.50</div>';
      const result = APIFormatterUtils.highlightSearchResults(html, '$10.50');
      expect(result).toContain('<mark class="search-highlight">$10.50</mark>');
    });
  });
});
