/**
 * Test for Hash Generator utilities
 */

import { describe, it, expect } from 'vitest';
import {
  md5,
  sha1,
  sha256,
  sha512,
  generateHash,
  generateAllHashes,
  bufferToHex,
} from '@/utils/hash';

describe('Hash Utils', () => {
  describe('bufferToHex', () => {
    it('should convert ArrayBuffer to hex string', () => {
      const buffer = new Uint8Array([0xff, 0x00, 0xab, 0xcd]).buffer;
      const result = bufferToHex(buffer);
      expect(result).toBe('ff00abcd');
    });

    it('should handle empty buffer', () => {
      const buffer = new Uint8Array([]).buffer;
      const result = bufferToHex(buffer);
      expect(result).toBe('');
    });
  });

  describe('md5', () => {
    it('should generate consistent hash for same input', () => {
      const hash1 = md5('test');
      const hash2 = md5('test');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = md5('hello');
      const hash2 = md5('world');
      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for different cases', () => {
      const hash1 = md5('Hello');
      const hash2 = md5('hello');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash1 = md5('');
      const hash2 = md5('');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(32); // MD5 is 128 bits = 32 hex chars
    });

    it('should be lowercase hex string', () => {
      const result = md5('test');
      expect(result).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('sha1', () => {
    it('should generate SHA-1 hash', async () => {
      const result = await sha1('hello');
      expect(result).toHaveLength(40); // SHA-1 is 160 bits = 40 hex chars
      expect(result).toMatch(/^[0-9a-f]{40}$/);
    });

    it('should generate consistent hashes', async () => {
      const hash1 = await sha1('test');
      const hash2 = await sha1('test');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', async () => {
      const hash1 = await sha1('hello');
      const hash2 = await sha1('world');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('sha256', () => {
    it('should generate SHA-256 hash', async () => {
      const result = await sha256('hello');
      expect(result).toHaveLength(64); // SHA-256 is 256 bits = 64 hex chars
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate consistent hashes', async () => {
      const hash1 = await sha256('test');
      const hash2 = await sha256('test');
      expect(hash1).toBe(hash2);
    });
  });

  describe('sha512', () => {
    it('should generate SHA-512 hash', async () => {
      const result = await sha512('hello');
      expect(result).toHaveLength(128); // SHA-512 is 512 bits = 128 hex chars
      expect(result).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should generate consistent hashes', async () => {
      const hash1 = await sha512('test');
      const hash2 = await sha512('test');
      expect(hash1).toBe(hash2);
    });
  });

  describe('generateHash', () => {
    it('should generate MD5 hash', async () => {
      const result = await generateHash('test', 'md5');
      expect(result).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should generate SHA-1 hash', async () => {
      const result = await generateHash('test', 'sha1');
      expect(result).toHaveLength(40);
    });

    it('should generate SHA-256 hash', async () => {
      const result = await generateHash('test', 'sha256');
      expect(result).toHaveLength(64);
    });

    it('should generate SHA-512 hash', async () => {
      const result = await generateHash('test', 'sha512');
      expect(result).toHaveLength(128);
    });
  });

  describe('generateAllHashes', () => {
    it('should generate all hash types', async () => {
      const result = await generateAllHashes('test');

      expect(result.md5).toHaveLength(32);
      expect(result.sha1).toHaveLength(40);
      expect(result.sha256).toHaveLength(64);
      expect(result.sha512).toHaveLength(128);
    });

    it('should return object with all hash types', async () => {
      const result = await generateAllHashes('hello');

      expect(result).toHaveProperty('md5');
      expect(result).toHaveProperty('sha1');
      expect(result).toHaveProperty('sha256');
      expect(result).toHaveProperty('sha512');
    });

    it('should generate consistent results across calls', async () => {
      const result1 = await generateAllHashes('test');
      const result2 = await generateAllHashes('test');

      expect(result1.md5).toBe(result2.md5);
      expect(result1.sha1).toBe(result2.sha1);
      expect(result1.sha256).toBe(result2.sha256);
      expect(result1.sha512).toBe(result2.sha512);
    });
  });
});
