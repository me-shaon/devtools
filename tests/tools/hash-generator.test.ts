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
  generateHmac,
  generateAllHmacs,
  HASH_TYPES,
  HMAC_TYPES,
  formatBytes,
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

describe('Hash vectors', () => {
  const abc = 'abc';
  it('matches known digests of the empty string', async () => {
    expect(await generateHash('', 'md5')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(await generateHash('', 'sha1')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(await generateHash('', 'sha256')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(await generateHash('', 'sha3-256')).toBe(
      'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a'
    );
    expect(await generateHash('', 'keccak256')).toBe(
      'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
    );
  });

  it('matches known digests of "abc"', async () => {
    expect(md5(abc)).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(await generateHash(abc, 'sha384')).toBe(
      'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7'
    );
    expect(await generateHash(abc, 'sha3-256')).toBe(
      '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532'
    );
    expect(await generateHash(abc, 'sha3-512')).toBe(
      'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0'
    );
  });

  it('hashes UTF-8 bytes and Uint8Array input the same way', async () => {
    const bytes = new TextEncoder().encode('héllo 🌟');
    expect(await generateHash(bytes, 'sha256')).toBe(await generateHash('héllo 🌟', 'sha256'));
    expect(md5(bytes)).toBe(md5('héllo 🌟'));
  });

  it('computes HMAC (RFC 4231 test case 2)', async () => {
    const data = 'what do ya want for nothing?';
    expect(await generateHmac(data, 'Jefe', 'sha256')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
    );
    expect(await generateHmac(data, 'Jefe', 'sha384')).toBe(
      'af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649'
    );
    expect(await generateHmac(data, 'Jefe', 'sha512')).toBe(
      '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737'
    );
  });

  it('generates every hash and HMAC type', async () => {
    const all = await generateAllHashes('x');
    expect(Object.keys(all)).toEqual(HASH_TYPES.map((h) => h.type));
    const macs = await generateAllHmacs('x', 'k');
    expect(Object.keys(macs)).toEqual(HMAC_TYPES.map((h) => h.type));
  });

  it('formats byte sizes', () => {
    expect(formatBytes(12)).toBe('12 B');
    expect(formatBytes(2048)).toBe('2.00 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
  });
});
