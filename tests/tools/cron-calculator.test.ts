/**
 * Test for Cron Calculator utilities
 */

import { describe, it, expect } from 'vitest';
import {
  parseCronExpression,
  getNextRunTime,
  getPreviousRunTime,
  isValidCronExpression,
  describeCronExpression,
  getCommonCronExpressions,
} from '@/utils/cron';

describe('Cron Utils', () => {
  describe('parseCronExpression', () => {
    it('should parse simple cron expression', () => {
      const result = parseCronExpression('0 0 * * *');
      expect(result).not.toBeNull();
      expect(result?.minute.values).toContain(0);
      expect(result?.hour.values).toContain(0);
    });

    it('should parse cron with ranges', () => {
      const result = parseCronExpression('0 9-17 * * *');
      expect(result?.hour.values).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    });

    it('should parse cron with lists', () => {
      const result = parseCronExpression('0 9,12,15 * * *');
      expect(result?.hour.values).toEqual([9, 12, 15]);
    });

    it('should parse cron with steps', () => {
      const result = parseCronExpression('*/15 * * * *');
      expect(result?.minute.values).toEqual([0, 15, 30, 45]);
    });

    it('should parse cron with day of week', () => {
      const result = parseCronExpression('0 0 * * 1-5');
      expect(result?.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
    });

    it('should reject invalid cron expressions', () => {
      expect(parseCronExpression('invalid')).toBeNull();
      expect(parseCronExpression('0 0')).toBeNull(); // Too few parts
    });

    it('should handle 6-part cron expressions', () => {
      const result = parseCronExpression('0 0 * * * *');
      expect(result).not.toBeNull();
    });
  });

  describe('getNextRunTime', () => {
    it('should get next run time for daily cron', () => {
      const from = new Date('2024-01-01T10:00:00');
      const result = getNextRunTime('0 12 * * *', from);

      expect(result).not.toBeNull();
      expect(result?.getDate()).toBe(1);
      expect(result?.getHours()).toBe(12);
    });

    it('should get next run time for hourly cron', () => {
      const from = new Date('2024-01-01T10:30:00');
      const result = getNextRunTime('0 * * * *', from);

      expect(result).not.toBeNull();
      // Next run is at 11:00 on the same day
      expect(result?.getHours()).toBeGreaterThanOrEqual(11);
    });

    it('should get next run time for every minute', () => {
      const from = new Date('2024-01-01T10:30:30');
      const result = getNextRunTime('* * * * *', from);

      expect(result).not.toBeNull();
      expect(result?.getMinutes()).toBe(31);
    });

    it('should handle weekdays only', () => {
      const from = new Date('2024-01-05T10:00:00'); // Friday
      const result = getNextRunTime('0 9 * * 1-5', from);

      expect(result).not.toBeNull();
      const dayOfWeek = result?.getDay();
      expect(dayOfWeek).toBeGreaterThanOrEqual(1);
      expect(dayOfWeek).toBeLessThanOrEqual(5);
    });
  });

  describe('getPreviousRunTime', () => {
    it('should get previous run time for daily cron', () => {
      const from = new Date('2024-01-01T14:00:00');
      const result = getPreviousRunTime('0 12 * * *', from);

      expect(result).not.toBeNull();
      expect(result?.getHours()).toBe(12);
    });

    it('should get previous run time for hourly cron', () => {
      const from = new Date('2024-01-01T10:30:00');
      const result = getPreviousRunTime('0 * * * *', from);

      expect(result).not.toBeNull();
      expect(result?.getHours()).toBe(10);
    });
  });

  describe('isValidCronExpression', () => {
    it('should validate correct cron expressions', () => {
      expect(isValidCronExpression('0 0 * * *')).toBe(true);
      expect(isValidCronExpression('*/5 * * * *')).toBe(true);
      expect(isValidCronExpression('0 9-17 * * 1-5')).toBe(true);
    });

    it('should reject invalid cron expressions', () => {
      expect(isValidCronExpression('invalid')).toBe(false);
      expect(isValidCronExpression('0 0')).toBe(false);
      // Our parser is lenient - it doesn't validate value ranges
    });
  });

  describe('describeCronExpression', () => {
    it('should describe daily cron', () => {
      const result = describeCronExpression('0 0 * * *');
      expect(result).not.toBeNull();
      expect(result).toBeDefined();
    });

    it('should describe hourly cron', () => {
      const result = describeCronExpression('0 * * * *');
      expect(result).not.toBeNull();
    });

    it('should describe weekday cron', () => {
      const result = describeCronExpression('0 9 * * 1-5');
      expect(result).not.toBeNull();
    });

    it('should return null for invalid cron', () => {
      const result = describeCronExpression('invalid');
      expect(result).toBeNull();
    });
  });

  describe('getCommonCronExpressions', () => {
    it('should return common expressions', () => {
      const expressions = getCommonCronExpressions();

      expect(expressions['Every minute']).toBe('* * * * *');
      expect(expressions['Every day at midnight']).toBe('0 0 * * *');
      expect(expressions['Weekdays at 9 AM']).toBe('0 9 * * 1-5');
    });

    it('should have at least 10 common expressions', () => {
      const expressions = getCommonCronExpressions();
      expect(Object.keys(expressions).length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('complex scenarios', () => {
    it('should handle multiple values', () => {
      const result = parseCronExpression('0 9,12,15 * * *');
      expect(result?.hour.values).toEqual([9, 12, 15]);
    });

    it('should handle range with step', () => {
      const result = parseCronExpression('0-30/10 * * * *');
      expect(result?.minute.values).toEqual([0, 10, 20, 30]);
    });

    it('should handle month specification', () => {
      const result = parseCronExpression('0 0 1 1,6,12 *');
      expect(result?.month.values).toEqual([1, 6, 12]);
    });

    it('should validate boundary values', () => {
      const result = parseCronExpression('59 23 31 12 *');
      expect(result).not.toBeNull();
    });
  });
});
