/**
 * Test for Unit Converter utilities
 */

import { describe, it, expect } from 'vitest';
import {
  convert,
  getCategories,
  getUnits,
  formatResult,
  conversions,
} from '@/utils/unit-converter';

describe('Unit Converter Utils', () => {
  describe('getCategories', () => {
    it('should return all available categories', () => {
      const categories = getCategories();
      expect(categories).toEqual(['length', 'weight', 'temperature', 'data']);
    });

    it('should return array with expected length', () => {
      const categories = getCategories();
      expect(categories).toHaveLength(4);
    });
  });

  describe('getUnits', () => {
    it('should return units for length category', () => {
      const units = getUnits('length');
      expect(units).toBeDefined();
      expect(units.meter).toBeDefined();
      expect(units.kilometer).toBeDefined();
      expect(units.mile).toBeDefined();
    });

    it('should return units for weight category', () => {
      const units = getUnits('weight');
      expect(units).toBeDefined();
      expect(units.kilogram).toBeDefined();
      expect(units.pound).toBeDefined();
    });

    it('should return units for temperature category', () => {
      const units = getUnits('temperature');
      expect(units).toBeDefined();
      expect(units.celsius).toBeDefined();
      expect(units.fahrenheit).toBeDefined();
      expect(units.kelvin).toBeDefined();
    });

    it('should return empty object for unknown category', () => {
      const units = getUnits('unknown');
      expect(units).toEqual({});
    });
  });

  describe('convert - Length', () => {
    it('should convert meters to kilometers', () => {
      const result = convert(1000, 'length', 'meter', 'kilometer');
      expect(result).toBeCloseTo(1);
    });

    it('should convert kilometers to meters', () => {
      const result = convert(1, 'length', 'kilometer', 'meter');
      expect(result).toBeCloseTo(1000);
    });

    it('should convert miles to kilometers', () => {
      const result = convert(1, 'length', 'mile', 'kilometer');
      expect(result).toBeCloseTo(1.60934, 4);
    });

    it('should convert feet to meters', () => {
      const result = convert(1, 'length', 'foot', 'meter');
      expect(result).toBeCloseTo(0.3048, 4);
    });

    it('should convert inches to centimeters', () => {
      const result = convert(1, 'length', 'inch', 'centimeter');
      expect(result).toBeCloseTo(2.54, 2);
    });
  });

  describe('convert - Weight', () => {
    it('should convert kilograms to grams', () => {
      const result = convert(1, 'weight', 'kilogram', 'gram');
      expect(result).toBeCloseTo(1000);
    });

    it('should convert pounds to kilograms', () => {
      const result = convert(1, 'weight', 'pound', 'kilogram');
      expect(result).toBeCloseTo(0.453592, 4);
    });

    it('should convert ounces to grams', () => {
      const result = convert(1, 'weight', 'ounce', 'gram');
      expect(result).toBeCloseTo(28.3495, 2);
    });
  });

  describe('convert - Temperature', () => {
    it('should convert celsius to fahrenheit', () => {
      const result = convert(0, 'temperature', 'celsius', 'fahrenheit');
      expect(result).toBe(32);
    });

    it('should convert fahrenheit to celsius', () => {
      const result = convert(32, 'temperature', 'fahrenheit', 'celsius');
      expect(result).toBeCloseTo(0);
    });

    it('should convert celsius to kelvin', () => {
      const result = convert(0, 'temperature', 'celsius', 'kelvin');
      expect(result).toBeCloseTo(273.15);
    });

    it('should convert kelvin to celsius', () => {
      const result = convert(273.15, 'temperature', 'kelvin', 'celsius');
      expect(result).toBeCloseTo(0);
    });

    it('should handle boiling point conversion', () => {
      const result = convert(100, 'temperature', 'celsius', 'fahrenheit');
      expect(result).toBeCloseTo(212);
    });
  });

  describe('convert - Data', () => {
    it('should convert bytes to kilobytes', () => {
      const result = convert(1024, 'data', 'byte', 'kilobyte');
      expect(result).toBeCloseTo(1);
    });

    it('should convert kilobytes to megabytes', () => {
      const result = convert(1024, 'data', 'kilobyte', 'megabyte');
      expect(result).toBeCloseTo(1);
    });

    it('should convert megabytes to gigabytes', () => {
      const result = convert(1024, 'data', 'megabyte', 'gigabyte');
      expect(result).toBeCloseTo(1);
    });
  });

  describe('convert error handling', () => {
    it('should throw error for unknown category', () => {
      expect(() => convert(1, 'unknown', 'meter', 'kilometer')).toThrow('Unknown category');
    });

    it('should throw error for unknown unit', () => {
      expect(() => convert(1, 'length', 'unknown', 'meter')).toThrow('Unknown unit');
    });
  });

  describe('formatResult', () => {
    it('should format integer values without decimals', () => {
      expect(formatResult(100)).toBe('100');
    });

    it('should format decimal values correctly', () => {
      expect(formatResult(1.23456789)).toBe('1.234568');
    });

    it('should remove trailing zeros', () => {
      expect(formatResult(1.5000)).toBe('1.5');
    });

    it('should handle very small decimals', () => {
      expect(formatResult(0.000001)).toBe('0.000001');
    });

    it('should handle zero', () => {
      expect(formatResult(0)).toBe('0');
    });
  });
});
