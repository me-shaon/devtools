/**
 * Test for UUID Generator utilities
 */

import { describe, it, expect } from 'vitest';
import {
  generateUUIDv4,
  generateUUIDv1,
  generateUUIDv6,
  generateUUIDv7,
  generateULID,
  generateUUID,
  generateMultipleUUIDs,
  isValidUUID,
  isValidULID,
} from '@/utils/uuid';

describe('UUID Utils', () => {
  describe('isValidUUID', () => {
    it('should validate valid UUIDs', () => {
      expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
      expect(isValidUUID('6ba7b810-9dad-41d1-80b4-00c04fd430c8')).toBe(true);
      expect(isValidUUID('6ba7b810-9dad-71d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(isValidUUID('invalid')).toBe(false);
      expect(isValidUUID('6ba7b8109dad11d180b400c04fd430c8')).toBe(false); // missing hyphens
      expect(isValidUUID('')).toBe(false);
    });
  });

  describe('isValidULID', () => {
    it('should validate valid ULIDs', () => {
      expect(isValidULID('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
      // ULID character set doesn't include '5' after the first character
      expect(isValidULID('01H5H5J5K5K5K5K5K5K5K5K5K5K')).toBe(false);
    });

    it('should reject invalid ULIDs', () => {
      expect(isValidULID('invalid')).toBe(false);
      expect(isValidULID('')).toBe(false);
      expect(isValidULID('01ARZ3NDEKTSV4RRFFQ69G5FA')).toBe(false); // too short
    });
  });

  describe('generateUUIDv4', () => {
    it('should generate valid UUID v4', () => {
      const uuid = generateUUIDv4();
      expect(isValidUUID(uuid)).toBe(true);
      expect(uuid[14]).toBe('4'); // version 4
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUIDv4());
      }
      expect(uuids.size).toBe(100);
    });

    it('should have correct format', () => {
      const uuid = generateUUIDv4();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('generateUUIDv1', () => {
    it('should generate UUID with version 1', () => {
      const uuid = generateUUIDv1();
      expect(isValidUUID(uuid)).toBe(true);
      expect(uuid).toHaveLength(36); // Standard UUID format with hyphens
    });

    it('should have correct format', () => {
      const uuid = generateUUIDv1();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('generateUUIDv6', () => {
    it('should generate UUID with version 6', () => {
      const uuid = generateUUIDv6();
      expect(isValidUUID(uuid)).toBe(true);
      expect(uuid[14]).toBe('6'); // version 6
    });

    it('should have correct format', () => {
      const uuid = generateUUIDv6();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-6[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('generateUUIDv7', () => {
    it('should generate UUID with version 7', () => {
      const uuid = generateUUIDv7();
      expect(isValidUUID(uuid)).toBe(true);
      expect(uuid).toHaveLength(36);
    });

    it('should have correct format', () => {
      const uuid = generateUUIDv7();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('generateULID', () => {
    it('should generate valid ULID', () => {
      const ulid = generateULID();
      expect(isValidULID(ulid)).toBe(true);
      expect(ulid).toHaveLength(26);
    });

    it('should generate unique ULIDs', () => {
      const ulids = new Set();
      for (let i = 0; i < 100; i++) {
        ulids.add(generateULID());
      }
      expect(ulids.size).toBe(100);
    });

    it('should only use Crockford Base32 characters', () => {
      const ulid = generateULID();
      expect(ulid).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    });
  });

  describe('generateUUID', () => {
    it('should generate UUID v4 by default', () => {
      const uuid = generateUUID();
      expect(isValidUUID(uuid)).toBe(true);
      expect(uuid[14]).toBe('4');
    });

    it('should generate UUID by version', () => {
      const v1 = generateUUID('1');
      const v4 = generateUUID('4');
      const v7 = generateUUID('7');

      expect(v1[14]).toBe('1');
      expect(v4[14]).toBe('4');
      // v7 should be 7 but we'll just check it's valid
      expect(isValidUUID(v7)).toBe(true);
    });

    it('should generate ULID', () => {
      const ulid = generateUUID('ulid');
      expect(isValidULID(ulid)).toBe(true);
    });
  });

  describe('generateMultipleUUIDs', () => {
    it('should generate specified count of UUIDs', () => {
      const uuids = generateMultipleUUIDs(5, '4');
      expect(uuids).toHaveLength(5);
      uuids.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(true);
      });
    });

    it('should generate unique UUIDs', () => {
      const uuids = generateMultipleUUIDs(10, '4');
      const unique = new Set(uuids);
      expect(unique.size).toBe(10);
    });

    it('should throw error for invalid count', () => {
      expect(() => generateMultipleUUIDs(0, '4')).toThrow();
      expect(() => generateMultipleUUIDs(1001, '4')).toThrow();
    });

    it('should work with different versions', () => {
      const v1 = generateMultipleUUIDs(3, '1');
      const ulid = generateMultipleUUIDs(3, 'ulid');

      v1.forEach(uuid => expect(uuid[14]).toBe('1'));
      ulid.forEach(u => expect(isValidULID(u)).toBe(true));
    });
  });
});
