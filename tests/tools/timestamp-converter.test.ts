/**
 * Test for Timestamp Converter utilities
 */

import { describe, it, expect } from 'vitest';
import {
  timestampToDate,
  dateToTimestamp,
  timestampToFormattedString,
  dateStringToTimestamp,
  getCurrentTimestamp,
  getCurrentDateString,
  isValidTimestamp,
  formatDateFormats,
} from '@/utils/timestamp';

describe('Timestamp Utils', () => {
  describe('timestampToDate', () => {
    it('should convert timestamp to Date object', () => {
      const timestamp = 1609459200; // 2021-01-01 00:00:00 UTC
      const date = timestampToDate(timestamp);
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2021);
    });

    it('should handle zero timestamp', () => {
      const date = timestampToDate(0);
      expect(date.getTime()).toBe(0);
    });

    it('should handle negative timestamps (pre-1970)', () => {
      const date = timestampToDate(-86400); // One day before epoch
      expect(date).toBeInstanceOf(Date);
    });
  });

  describe('dateToTimestamp', () => {
    it('should convert Date to Unix timestamp', () => {
      const date = new Date('2021-01-01T00:00:00Z');
      const timestamp = dateToTimestamp(date);
      expect(timestamp).toBe(1609459200);
    });

    it('should handle current date', () => {
      const date = new Date();
      const timestamp = dateToTimestamp(date);
      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);
    });
  });

  describe('timestampToFormattedString', () => {
    it('should format timestamp to string', () => {
      const timestamp = 1609459200;
      const result = timestampToFormattedString(timestamp);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should include date and time', () => {
      const timestamp = 1609459200;
      const result = timestampToFormattedString(timestamp);
      expect(result).toMatch(/\d/); // Should contain digits
    });
  });

  describe('dateStringToTimestamp', () => {
    it('should convert date string to timestamp', () => {
      const dateString = '2021-01-01T00:00:00Z';
      const timestamp = dateStringToTimestamp(dateString);
      expect(timestamp).toBe(1609459200);
    });

    it('should handle different date formats', () => {
      const timestamp1 = dateStringToTimestamp('2021-01-01');
      const timestamp2 = dateStringToTimestamp('January 1, 2021');
      expect(timestamp1).toBeGreaterThan(0);
      expect(timestamp2).toBeGreaterThan(0);
    });

    it('should handle ISO strings', () => {
      const timestamp = dateStringToTimestamp('2021-06-15T12:00:00Z');
      expect(timestamp).toBeGreaterThan(1623700000);
      expect(timestamp).toBeLessThan(1623800000);
    });
  });

  describe('getCurrentTimestamp', () => {
    it('should return current Unix timestamp', () => {
      const timestamp = getCurrentTimestamp();
      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(1609459200); // After 2021
    });

    it('should return integer timestamp', () => {
      const timestamp = getCurrentTimestamp();
      expect(Number.isInteger(timestamp)).toBe(true);
    });
  });

  describe('getCurrentDateString', () => {
    it('should return current date as string', () => {
      const dateString = getCurrentDateString();
      expect(typeof dateString).toBe('string');
      expect(dateString.length).toBeGreaterThan(0);
    });
  });

  describe('isValidTimestamp', () => {
    it('should validate positive timestamps', () => {
      expect(isValidTimestamp(1609459200)).toBe(true);
      expect(isValidTimestamp(0)).toBe(false);
      expect(isValidTimestamp(-1)).toBe(false);
    });

    it('should reject invalid timestamps', () => {
      expect(isValidTimestamp(NaN)).toBe(false);
      expect(isValidTimestamp(Infinity)).toBe(false);
    });

    it('should handle reasonable timestamp range', () => {
      // Year 2038 problem (32-bit overflow)
      expect(isValidTimestamp(2147483647)).toBe(true);
    });
  });

  describe('formatDateFormats', () => {
    it('should return various date formats', () => {
      const date = new Date('2021-01-01T12:00:00Z');
      const formats = formatDateFormats(date);

      expect(formats).toHaveProperty('iso');
      expect(formats).toHaveProperty('locale');
      expect(formats).toHaveProperty('utc');
      expect(formats).toHaveProperty('date');
      expect(formats).toHaveProperty('time');

      expect(formats.iso).toBe('2021-01-01T12:00:00.000Z');
    });

    it('should include ISO format', () => {
      const date = new Date('2021-06-15T08:30:00Z');
      const formats = formatDateFormats(date);
      expect(formats.iso).toContain('2021-06-15');
    });

    it('should include locale format', () => {
      const date = new Date('2021-06-15T08:30:00Z');
      const formats = formatDateFormats(date);
      expect(formats.locale).toBeTruthy();
    });

    it('should include UTC format', () => {
      const date = new Date('2021-06-15T08:30:00Z');
      const formats = formatDateFormats(date);
      expect(formats.utc).toContain('GMT');
    });
  });
});
