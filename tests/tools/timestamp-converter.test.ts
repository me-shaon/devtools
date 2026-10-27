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
  parseTimeInput,
  formatInTimeZone,
  formatIsoWithOffset,
  formatRelativeTime,
  getCalendarInfo,
  isValidTimeZone,
} from '@/utils/timestamp';

const NOW = Date.UTC(2024, 0, 15, 12, 0, 0); // 2024-01-15T12:00:00Z

describe('parseTimeInput', () => {
  it('treats empty input as now', () => {
    expect(parseTimeInput('   ', NOW)).toMatchObject({ ok: true, ms: NOW, source: 'now' });
  });

  it('detects the epoch unit from the number of digits', () => {
    expect(parseTimeInput('1705320000', NOW)).toMatchObject({ ok: true, ms: NOW, source: 'seconds' });
    expect(parseTimeInput('1705320000123', NOW)).toMatchObject({ ok: true, ms: NOW + 123, source: 'milliseconds' });
    expect(parseTimeInput('1705320000123456', NOW)).toMatchObject({ ok: true, ms: NOW + 123, source: 'microseconds' });
    expect(parseTimeInput('1705320000123456789', NOW)).toMatchObject({ ok: true, ms: NOW + 123, source: 'nanoseconds' });
  });

  it('reads 12-digit numbers as milliseconds before 2001', () => {
    expect(parseTimeInput('946684800000', NOW)).toMatchObject({ ms: Date.UTC(2000, 0, 1), source: 'milliseconds' });
  });

  it('accepts negative and fractional seconds', () => {
    expect(parseTimeInput('-86400', NOW)).toMatchObject({ ms: -86400000, source: 'seconds' });
    expect(parseTimeInput('1705320000.5', NOW)).toMatchObject({ ms: NOW + 500, source: 'seconds' });
  });

  it('lets a unit suffix override detection', () => {
    expect(parseTimeInput('86400000 ms', NOW)).toMatchObject({ ms: 86400000, source: 'milliseconds' });
    expect(parseTimeInput('1705320000s', NOW)).toMatchObject({ ms: NOW, source: 'seconds' });
  });

  it('applies offsets to now and to numbers', () => {
    expect(parseTimeInput('now', NOW)).toMatchObject({ ms: NOW, source: 'now', offsetMs: 0 });
    expect(parseTimeInput('now + 3600', NOW)).toMatchObject({ ms: NOW + 3600000, offsetMs: 3600000 });
    expect(parseTimeInput('NOW - 1d', NOW)).toMatchObject({ ms: NOW - 86400000, source: 'now' });
    expect(parseTimeInput('now+1h30m', NOW)).toMatchObject({ ms: NOW + 5400000 });
    expect(parseTimeInput('1705320000 - 2w', NOW)).toMatchObject({ ms: NOW - 14 * 86400000, source: 'seconds' });
  });

  it('applies offsets to date strings when they have spaces and units', () => {
    expect(parseTimeInput('2024-01-15T12:00:00Z + 1d', NOW)).toMatchObject({ ms: NOW + 86400000, source: 'date' });
  });

  it('parses ISO 8601 and RFC 2822 dates', () => {
    expect(parseTimeInput('2024-01-15T12:00:00Z', NOW)).toMatchObject({ ms: NOW, source: 'date', zone: 'explicit' });
    expect(parseTimeInput('2024-01-15T14:00:00+0200', NOW)).toMatchObject({ ms: NOW, zone: 'explicit' });
    expect(parseTimeInput('2024-01-15 12:00:00 UTC', NOW)).toMatchObject({ ms: NOW, zone: 'explicit' });
    expect(parseTimeInput('Mon, 15 Jan 2024 12:00:00 GMT', NOW)).toMatchObject({ ms: NOW, zone: 'explicit' });
    expect(parseTimeInput('Mon, 15 Jan 2024 07:00:00 -0500', NOW)).toMatchObject({ ms: NOW });
  });

  it('reads a date-only ISO string as UTC and a zoneless date-time as local', () => {
    expect(parseTimeInput('2024-01-15', NOW)).toMatchObject({ ms: Date.UTC(2024, 0, 15), zone: 'utc' });
    const local = parseTimeInput('2024-01-15 12:00:00', NOW);
    expect(local).toMatchObject({ ok: true, zone: 'local', ms: new Date(2024, 0, 15, 12).getTime() });
  });

  it('reports input it cannot read', () => {
    expect(parseTimeInput('hello', NOW)).toMatchObject({ ok: false });
    expect(parseTimeInput('99999999999999999999999', NOW)).toMatchObject({ ok: false });
  });
});

describe('formatInTimeZone', () => {
  it('formats wall-clock time and the UTC offset', () => {
    expect(formatInTimeZone(NOW, 'UTC')).toEqual({ dateTime: '2024-01-15 12:00:00', offset: '+00:00' });
    expect(formatInTimeZone(NOW, 'Asia/Kolkata')).toEqual({ dateTime: '2024-01-15 17:30:00', offset: '+05:30' });
    expect(formatInTimeZone(NOW, 'America/New_York')).toEqual({ dateTime: '2024-01-15 07:00:00', offset: '-05:00' });
  });

  it('formats years before 1970', () => {
    expect(formatInTimeZone(-86400000, 'UTC').dateTime).toBe('1969-12-31 00:00:00');
  });
});

describe('formatIsoWithOffset', () => {
  it('formats ISO 8601 with the zone offset', () => {
    expect(formatIsoWithOffset(NOW + 5, 'Asia/Kolkata')).toBe('2024-01-15T17:30:00.005+05:30');
    expect(formatIsoWithOffset(NOW, 'UTC')).toBe('2024-01-15T12:00:00.000+00:00');
  });
});

describe('formatRelativeTime', () => {
  it('uses the largest whole unit', () => {
    expect(formatRelativeTime(NOW - 3 * 3600000 - 5000, NOW)).toBe('3 hours ago');
    expect(formatRelativeTime(NOW + 2 * 86400000, NOW)).toBe('in 2 days');
    expect(formatRelativeTime(NOW - 400 * 86400000, NOW)).toBe('last year');
    expect(formatRelativeTime(NOW - 30000, NOW)).toBe('30 seconds ago');
    expect(formatRelativeTime(NOW, NOW)).toBe('now');
  });
});

describe('getCalendarInfo', () => {
  it('reports weekday, day of year, and ISO week', () => {
    expect(getCalendarInfo(NOW, 'UTC')).toEqual({ weekday: 'Monday', dayOfYear: 15, daysInYear: 366, isoWeek: 3, isoWeekYear: 2024 });
  });

  it('uses the ISO week year at year boundaries', () => {
    expect(getCalendarInfo(Date.UTC(2021, 0, 1), 'UTC')).toMatchObject({ isoWeek: 53, isoWeekYear: 2020, daysInYear: 365 });
    expect(getCalendarInfo(Date.UTC(2024, 11, 30), 'UTC')).toMatchObject({ isoWeek: 1, isoWeekYear: 2025 });
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects others', () => {
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

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
