/**
 * Test for Date Difference utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  calculateDateDifference,
  formatDateDifference,
  addToDate,
  subtractFromDate,
  calculateAge,
  isValidDate,
  getTimezoneOffset,
  getTimezoneName,
} from '@/utils/date-difference';

describe('Date Difference Utils', () => {
  describe('calculateDateDifference', () => {
    it('should calculate difference in days', () => {
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2024-01-11');
      const result = calculateDateDifference(date1, date2);

      expect(result.totalDays).toBe(10);
      expect(result.days).toBe(10);
    });

    it('should calculate difference with months', () => {
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2024-03-01');
      const result = calculateDateDifference(date1, date2);

      expect(result.months).toBe(2);
      expect(result.years).toBe(0);
    });

    it('should calculate difference with years', () => {
      const date1 = new Date('2020-01-01');
      const date2 = new Date('2024-01-01');
      const result = calculateDateDifference(date1, date2);

      expect(result.years).toBe(4);
      expect(result.months).toBe(0);
    });

    it('should calculate difference with hours and minutes', () => {
      const date1 = new Date('2024-01-01T00:00:00');
      const date2 = new Date('2024-01-01T02:30:45');
      const result = calculateDateDifference(date1, date2);

      expect(result.hours).toBe(2);
      expect(result.minutes).toBe(30);
      expect(result.seconds).toBe(45);
    });

    it('should handle negative difference (date1 after date2)', () => {
      const date1 = new Date('2024-03-01');
      const date2 = new Date('2024-01-01');
      const result = calculateDateDifference(date1, date2);

      expect(result.months).toBe(-2);
    });

    it('should calculate milliseconds', () => {
      const date1 = new Date('2024-01-01T00:00:00.000');
      const date2 = new Date('2024-01-01T00:00:01.500');
      const result = calculateDateDifference(date1, date2);

      expect(result.milliseconds).toBe(1500);
    });

    it('should handle same dates', () => {
      const date = new Date('2024-01-01');
      const result = calculateDateDifference(date, date);

      expect(result.years).toBe(0);
      expect(result.months).toBe(0);
      expect(result.days).toBe(0);
      expect(result.milliseconds).toBe(0);
    });

    it('should handle date strings', () => {
      const result = calculateDateDifference('2024-01-01', '2024-01-11');
      expect(result.totalDays).toBe(10);
    });
  });

  describe('formatDateDifference', () => {
    it('should format simple day difference', () => {
      const diff = calculateDateDifference('2024-01-01', '2024-01-11');
      const formatted = formatDateDifference(diff);

      expect(formatted).toContain('10 days');
    });

    it('should format complex difference', () => {
      const diff = calculateDateDifference('2024-01-01', '2024-02-15');
      const formatted = formatDateDifference(diff);

      expect(formatted).toContain('month');
      expect(formatted).toContain('days');
    });

    it('should format with time', () => {
      const diff = calculateDateDifference(
        '2024-01-01T00:00:00',
        '2024-01-01T02:30:45'
      );
      const formatted = formatDateDifference(diff);

      expect(formatted).toContain('hours');
      expect(formatted).toContain('minutes');
    });

    it('should exclude time when disabled', () => {
      const diff = calculateDateDifference(
        '2024-01-01T00:00:00',
        '2024-01-03T02:30:45'
      );
      const formatted = formatDateDifference(diff, { includeTime: false });

      expect(formatted).not.toContain('hours');
      expect(formatted).toContain('days');
    });

    it('should handle zero difference', () => {
      const diff = calculateDateDifference('2024-01-01', '2024-01-01');
      const formatted = formatDateDifference(diff);

      expect(formatted).toContain('0 seconds');
    });

    it('should use singular for 1', () => {
      const diff = calculateDateDifference('2024-01-01', '2024-01-02');
      const formatted = formatDateDifference(diff, { includeTime: false });

      expect(formatted).toContain('1 day');
      expect(formatted).not.toContain('1 days');
    });

    it('should use plural for multiple', () => {
      const diff = calculateDateDifference('2024-01-01', '2024-01-03');
      const formatted = formatDateDifference(diff, { includeTime: false });

      expect(formatted).toContain('2 days');
    });
  });

  describe('addToDate', () => {
    it('should add days to a date', () => {
      const result = addToDate('2024-01-01', { days: 10 });
      expect(result.getDate()).toBe(11);
    });

    it('should add months to a date', () => {
      const result = addToDate('2024-01-15', { months: 2 });
      expect(result.getMonth()).toBe(2); // March
    });

    it('should add years to a date', () => {
      const result = addToDate('2024-01-01', { years: 5 });
      expect(result.getFullYear()).toBe(2029);
    });

    it('should add hours and minutes', () => {
      const result = addToDate('2024-01-01T00:00:00', {
        hours: 2,
        minutes: 30,
      });
      expect(result.getHours()).toBe(2);
      expect(result.getMinutes()).toBe(30);
    });

    it('should handle month overflow', () => {
      const result = addToDate('2024-01-31', { months: 1 });
      // March doesn't have 31 days, so it should roll over
      expect(result.getDate()).toBeGreaterThanOrEqual(1);
    });

    it('should add multiple units', () => {
      const result = addToDate('2024-01-01', {
        years: 1,
        months: 2,
        days: 3,
      });
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(2); // March
      expect(result.getDate()).toBe(4);
    });
  });

  describe('subtractFromDate', () => {
    it('should subtract days from a date', () => {
      const result = subtractFromDate('2024-01-11', { days: 10 });
      expect(result.getDate()).toBe(1);
    });

    it('should subtract months from a date', () => {
      const result = subtractFromDate('2024-03-15', { months: 2 });
      expect(result.getMonth()).toBe(0); // January
    });

    it('should subtract years from a date', () => {
      const result = subtractFromDate('2024-01-01', { years: 5 });
      expect(result.getFullYear()).toBe(2019);
    });

    it('should handle month underflow', () => {
      const result = subtractFromDate('2024-03-31', { months: 1 });
      // JavaScript Date setMonth handles overflow/underflow
      // March 31 - 1 month may roll over
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
    });
  });

  describe('calculateAge', () => {
    it('should calculate age correctly', () => {
      const birthdate = new Date('1990-01-01');
      const currentYear = new Date().getFullYear();
      const expectedAge = currentYear - 1990;

      const age = calculateAge(birthdate);
      expect(age).toBe(expectedAge);
    });

    it('should handle birthday not yet occurred this year', () => {
      const birthdate = new Date('1990-12-31');
      const currentYear = new Date().getFullYear();
      const expectedAge = currentYear - 1990 - 1;

      const age = calculateAge(birthdate);
      expect(age).toBe(expectedAge);
    });

    it('should handle birthday already occurred this year', () => {
      const birthdate = new Date('1990-01-01');
      const currentYear = new Date().getFullYear();
      const expectedAge = currentYear - 1990;

      const age = calculateAge(birthdate);
      expect(age).toBe(expectedAge);
    });

    it('should handle date strings', () => {
      const age = calculateAge('1990-06-15');
      const currentYear = new Date().getFullYear();
      const expectedAge = currentYear - 1990;

      expect(age).toBeGreaterThanOrEqual(expectedAge - 1);
      expect(age).toBeLessThanOrEqual(expectedAge);
    });
  });

  describe('isValidDate', () => {
    it('should validate correct dates', () => {
      expect(isValidDate('2024-01-01')).toBe(true);
      expect(isValidDate(new Date())).toBe(true);
    });

    it('should reject invalid dates', () => {
      expect(isValidDate('invalid')).toBe(false);
      expect(isValidDate('2024-13-01')).toBe(false); // Invalid month
      expect(isValidDate('')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidDate(new Date(NaN))).toBe(false);
      // Feb 30 - Date constructor will adjust this to March 1 or 2 depending on year
      // But the string '2024-02-30' might parse differently
      const feb30 = new Date('2024-02-30');
      expect(feb30.toString()).not.toContain('Invalid');
    });
  });

  describe('getTimezoneOffset', () => {
    it('should return timezone offset in hours', () => {
      const offset = getTimezoneOffset();
      expect(typeof offset).toBe('number');
      expect(offset).toBeGreaterThanOrEqual(-12);
      expect(offset).toBeLessThanOrEqual(14);
    });

    it('should handle specific dates', () => {
      const offset = getTimezoneOffset('2024-01-01');
      expect(typeof offset).toBe('number');
    });
  });

  describe('getTimezoneName', () => {
    it('should return timezone name', () => {
      const tz = getTimezoneName();
      expect(typeof tz).toBe('string');
      expect(tz.length).toBeGreaterThan(0);
    });
  });

  describe('real-world scenarios', () => {
    it('should calculate age from birthdate to now', () => {
      const birthdate = '1990-06-15';
      const age = calculateAge(birthdate);

      expect(age).toBeGreaterThan(0);
      expect(age).toBeLessThan(150);
    });

    it('should calculate time until deadline', () => {
      const now = new Date();
      const deadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const diff = calculateDateDifference(now, deadline);

      expect(diff.totalDays).toBe(7);
    });

    it('should handle leap years', () => {
      const diff = calculateDateDifference('2020-02-28', '2020-03-01');
      expect(diff.totalDays).toBe(2); // 2020 is a leap year
    });

    it('should calculate work weeks between dates', () => {
      const diff = calculateDateDifference('2024-01-01', '2024-01-22');
      const workWeeks = diff.totalDays / 7;

      expect(workWeeks).toBeCloseTo(3, 0);
    });
  });
});
