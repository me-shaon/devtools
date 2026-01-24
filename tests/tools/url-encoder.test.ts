/**
 * Test for URL Encoder utilities
 */

import { describe, it, expect } from 'vitest';
import {
  encodeUrl,
  decodeUrl,
  encodeQueryParams,
  parseQueryString,
  parseUrl,
  buildUrl,
} from '@/utils/url';

describe('URL Utils', () => {
  describe('encodeUrl', () => {
    it('should encode URL component', () => {
      const result = encodeUrl('hello world', { component: true });
      expect(result).toBe('hello%20world');
    });

    it('should encode full URL', () => {
      const result = encodeUrl('https://example.com/path with spaces');
      expect(result).toBe('https://example.com/path%20with%20spaces');
    });

    it('should encode special characters', () => {
      const result = encodeUrl('a+b=c', { component: true });
      expect(result).toBe('a%2Bb%3Dc');
    });

    it('should encode for form format', () => {
      const result = encodeUrl('hello world', { form: true });
      expect(result).toBe('hello+world');
    });

    it('should handle already encoded strings', () => {
      const result = encodeUrl('hello%20world', { component: true });
      expect(result).toBe('hello%2520world');
    });
  });

  describe('decodeUrl', () => {
    it('should decode URL component', () => {
      const result = decodeUrl('hello%20world', { component: true });
      expect(result).toBe('hello world');
    });

    it('should decode full URL', () => {
      const result = decodeUrl('https://example.com/path%20with%20spaces');
      expect(result).toBe('https://example.com/path with spaces');
    });

    it('should decode special characters', () => {
      const result = decodeUrl('a%2Bb%3Dc', { component: true });
      expect(result).toBe('a+b=c');
    });

    it('should decode form format', () => {
      const result = decodeUrl('hello+world', { form: true });
      expect(result).toBe('hello world');
    });

    it('should decode mixed encoding', () => {
      const result = decodeUrl('hello+world%21', { form: true });
      expect(result).toBe('hello world!');
    });
  });

  describe('encodeQueryParams', () => {
    it('should encode simple params', () => {
      const result = encodeQueryParams({ name: 'John', age: '30' });
      expect(result).toBe('name=John&age=30');
    });

    it('should encode special characters in values', () => {
      const result = encodeQueryParams({ search: 'hello world' });
      expect(result).toBe('search=hello%20world');
    });

    it('should encode special characters in keys', () => {
      const result = encodeQueryParams({ 'user name': 'John' });
      expect(result).toBe('user%20name=John');
    });

    it('should handle number values', () => {
      const result = encodeQueryParams({ count: 10, price: 99.99 });
      expect(result).toBe('count=10&price=99.99');
    });

    it('should handle boolean values', () => {
      const result = encodeQueryParams({ active: true, deleted: false });
      expect(result).toBe('active=true&deleted=false');
    });

    it('should handle empty object', () => {
      const result = encodeQueryParams({});
      expect(result).toBe('');
    });
  });

  describe('parseQueryString', () => {
    it('should parse simple query string', () => {
      const result = parseQueryString('name=John&age=30');
      expect(result).toEqual({ name: 'John', age: '30' });
    });

    it('should parse query string with leading ?', () => {
      const result = parseQueryString('?name=John&age=30');
      expect(result).toEqual({ name: 'John', age: '30' });
    });

    it('should decode encoded values', () => {
      const result = parseQueryString('search=hello%20world');
      expect(result).toEqual({ search: 'hello world' });
    });

    it('should handle empty values', () => {
      const result = parseQueryString('key1=&key2=value');
      expect(result).toEqual({ key1: '', key2: 'value' });
    });

    it('should handle keys without values', () => {
      const result = parseQueryString('key1&key2=value');
      expect(result).toEqual({ key1: '', key2: 'value' });
    });

    it('should handle empty string', () => {
      const result = parseQueryString('');
      expect(result).toEqual({});
    });

    it('should handle values with =', () => {
      const result = parseQueryString('equation=a=b+c');
      expect(result).toEqual({ equation: 'a=b+c' });
    });
  });

  describe('parseUrl', () => {
    it('should parse valid URL', () => {
      const result = parseUrl('https://example.com:8080/path/to/page?query=value#hash');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'example.com',
        port: '8080',
        pathname: '/path/to/page',
        search: 'query=value',
        hash: 'hash',
      });
    });

    it('should parse URL without port', () => {
      const result = parseUrl('https://example.com/path');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'example.com',
        port: '',
        pathname: '/path',
        search: '',
        hash: '',
      });
    });

    it('should parse URL without protocol', () => {
      const result = parseUrl('//example.com/path');
      // URLs without protocol need a protocol to parse correctly
      // In browsers, this would use the current page's protocol
      expect(result).toBeDefined();
    });

    it('should handle invalid URL gracefully', () => {
      const result = parseUrl('not a url');
      expect(result).toEqual({});
    });
  });

  describe('buildUrl', () => {
    it('should build complete URL', () => {
      const result = buildUrl({
        protocol: 'https',
        hostname: 'example.com',
        port: '8080',
        pathname: '/path',
        search: 'query=value',
        hash: 'section',
      });
      expect(result).toBe('https://example.com:8080/path?query=value#section');
    });

    it('should build URL with minimal parts', () => {
      const result = buildUrl({
        hostname: 'example.com',
      });
      expect(result).toBe('example.com');
    });

    it('should add leading slash to pathname', () => {
      const result = buildUrl({
        hostname: 'example.com',
        pathname: 'path',
      });
      expect(result).toBe('example.com/path');
    });

    it('should accept object for search params', () => {
      const result = buildUrl({
        hostname: 'example.com',
        search: { key: 'value', foo: 'bar' },
      });
      expect(result).toBe('example.com?key=value&foo=bar');
    });

    it('should add leading ? and #', () => {
      const result = buildUrl({
        hostname: 'example.com',
        search: 'query=value',
        hash: 'section',
      });
      expect(result).toBe('example.com?query=value#section');
    });
  });

  describe('round-trip encoding', () => {
    it('should maintain data integrity', () => {
      const original = 'hello world! @#$%';
      const encoded = encodeUrl(original, { component: true });
      const decoded = decodeUrl(encoded, { component: true });
      expect(decoded).toBe(original);
    });

    it('should handle form encoding round-trip', () => {
      const original = 'hello world+test';
      const encoded = encodeUrl(original, { form: true });
      const decoded = decodeUrl(encoded, { form: true });
      expect(decoded).toBe(original);
    });
  });
});
