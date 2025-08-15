/**
 * Unit tests for UnitConverterUtils
 */

const UnitConverterUtils = require('../../src/utils/unit-converter-utils');

describe('UnitConverterUtils', () => {
  describe('Length Conversions', () => {
    it('should convert meters to kilometers correctly', () => {
      const result = UnitConverterUtils.convertLength(1000, 'm', 'km');
      expect(result).toBe(1);
    });

    it('should convert inches to centimeters correctly', () => {
      const result = UnitConverterUtils.convertLength(1, 'in', 'cm');
      expect(result).toBeCloseTo(2.54, 2);
    });

    it('should convert feet to meters correctly', () => {
      const result = UnitConverterUtils.convertLength(1, 'ft', 'm');
      expect(result).toBeCloseTo(0.3048, 4);
    });

    it('should handle same unit conversion', () => {
      const result = UnitConverterUtils.convertLength(100, 'cm', 'cm');
      expect(result).toBe(100);
    });

    it('should convert miles to kilometers correctly', () => {
      const result = UnitConverterUtils.convertLength(1, 'mi', 'km');
      expect(result).toBeCloseTo(1.609344, 4);
    });

    it('should throw error for invalid length unit', () => {
      expect(() => {
        UnitConverterUtils.convertLength(1, 'invalid', 'm');
      }).toThrow('Invalid length unit');
    });
  });

  describe('Weight Conversions', () => {
    it('should convert kilograms to pounds correctly', () => {
      const result = UnitConverterUtils.convertWeight(1, 'kg', 'lb');
      expect(result).toBeCloseTo(2.204623, 4);
    });

    it('should convert grams to ounces correctly', () => {
      const result = UnitConverterUtils.convertWeight(100, 'g', 'oz');
      expect(result).toBeCloseTo(3.5274, 3);
    });

    it('should convert pounds to kilograms correctly', () => {
      const result = UnitConverterUtils.convertWeight(1, 'lb', 'kg');
      expect(result).toBeCloseTo(0.453592, 4);
    });

    it('should convert tons to kilograms correctly', () => {
      const result = UnitConverterUtils.convertWeight(1, 't', 'kg');
      expect(result).toBe(1000);
    });

    it('should handle same unit conversion', () => {
      const result = UnitConverterUtils.convertWeight(500, 'g', 'g');
      expect(result).toBe(500);
    });

    it('should throw error for invalid weight unit', () => {
      expect(() => {
        UnitConverterUtils.convertWeight(1, 'invalid', 'kg');
      }).toThrow('Invalid weight unit');
    });
  });

  describe('Temperature Conversions', () => {
    it('should convert Celsius to Fahrenheit correctly', () => {
      const result = UnitConverterUtils.convertTemperature(0, 'C', 'F');
      expect(result).toBe(32);
    });

    it('should convert Fahrenheit to Celsius correctly', () => {
      const result = UnitConverterUtils.convertTemperature(32, 'F', 'C');
      expect(result).toBe(0);
    });

    it('should convert Celsius to Kelvin correctly', () => {
      const result = UnitConverterUtils.convertTemperature(0, 'C', 'K');
      expect(result).toBe(273.15);
    });

    it('should convert Kelvin to Celsius correctly', () => {
      const result = UnitConverterUtils.convertTemperature(273.15, 'K', 'C');
      expect(result).toBe(0);
    });

    it('should convert Fahrenheit to Kelvin correctly', () => {
      const result = UnitConverterUtils.convertTemperature(32, 'F', 'K');
      expect(result).toBe(273.15);
    });

    it('should handle same unit conversion', () => {
      const result = UnitConverterUtils.convertTemperature(25, 'C', 'C');
      expect(result).toBe(25);
    });

    it('should throw error for negative Kelvin input', () => {
      expect(() => {
        UnitConverterUtils.convertTemperature(-1, 'K', 'C');
      }).toThrow('Kelvin cannot be negative');
    });

    it('should throw error when result would be below absolute zero', () => {
      expect(() => {
        UnitConverterUtils.convertTemperature(-500, 'C', 'K');
      }).toThrow('Temperature below absolute zero');
    });

    it('should throw error for invalid temperature unit', () => {
      expect(() => {
        UnitConverterUtils.convertTemperature(25, 'invalid', 'C');
      }).toThrow('Invalid temperature unit');
    });
  });

  describe('Currency Conversions', () => {
    it('should convert USD to EUR correctly', () => {
      const result = UnitConverterUtils.convertCurrency(100, 'USD', 'EUR');
      expect(result).toBeCloseTo(85, 1);
    });

    it('should convert EUR to USD correctly', () => {
      const result = UnitConverterUtils.convertCurrency(85, 'EUR', 'USD');
      expect(result).toBeCloseTo(100, 1);
    });

    it('should convert USD to JPY correctly', () => {
      const result = UnitConverterUtils.convertCurrency(1, 'USD', 'JPY');
      expect(result).toBe(110);
    });

    it('should handle same currency conversion', () => {
      const result = UnitConverterUtils.convertCurrency(100, 'USD', 'USD');
      expect(result).toBe(100);
    });

    it('should throw error for invalid currency unit', () => {
      expect(() => {
        UnitConverterUtils.convertCurrency(100, 'INVALID', 'USD');
      }).toThrow('Invalid currency unit');
    });
  });

  describe('Main convert method', () => {
    it('should handle length conversions', () => {
      const result = UnitConverterUtils.convert(100, 'length', 'cm', 'm');
      expect(result).toBe(1);
    });

    it('should handle weight conversions', () => {
      const result = UnitConverterUtils.convert(1, 'weight', 'kg', 'g');
      expect(result).toBe(1000);
    });

    it('should handle temperature conversions', () => {
      const result = UnitConverterUtils.convert(0, 'temperature', 'C', 'F');
      expect(result).toBe(32);
    });

    it('should handle currency conversions with proper rounding', () => {
      const result = UnitConverterUtils.convert(100, 'currency', 'USD', 'EUR');
      expect(result).toBe(85.0);
    });

    it('should round non-currency results to 6 decimal places', () => {
      const result = UnitConverterUtils.convert(1, 'length', 'in', 'cm');
      expect(result).toBe(2.54);
    });

    it('should throw error for empty value', () => {
      expect(() => {
        UnitConverterUtils.convert('', 'length', 'm', 'km');
      }).toThrow('Please enter a value to convert');
    });

    it('should throw error for null value', () => {
      expect(() => {
        UnitConverterUtils.convert(null, 'length', 'm', 'km');
      }).toThrow('Please enter a value to convert');
    });

    it('should throw error for undefined value', () => {
      expect(() => {
        UnitConverterUtils.convert(undefined, 'length', 'm', 'km');
      }).toThrow('Please enter a value to convert');
    });

    it('should throw error for non-numeric value', () => {
      expect(() => {
        UnitConverterUtils.convert('abc', 'length', 'm', 'km');
      }).toThrow('Please enter a valid number');
    });

    it('should throw error for infinite value', () => {
      expect(() => {
        UnitConverterUtils.convert(Infinity, 'length', 'm', 'km');
      }).toThrow('Number is too large');
    });

    it('should throw error for negative weight', () => {
      expect(() => {
        UnitConverterUtils.convert(-5, 'weight', 'kg', 'lb');
      }).toThrow('Weight cannot be negative');
    });

    it('should throw error for negative length', () => {
      expect(() => {
        UnitConverterUtils.convert(-10, 'length', 'm', 'km');
      }).toThrow('Length cannot be negative');
    });

    it('should allow negative temperatures', () => {
      const result = UnitConverterUtils.convert(-10, 'temperature', 'C', 'F');
      expect(result).toBe(14);
    });

    it('should throw error for invalid category', () => {
      expect(() => {
        UnitConverterUtils.convert(100, 'invalid', 'unit1', 'unit2');
      }).toThrow('Invalid conversion category');
    });

    it('should handle zero values correctly', () => {
      const result = UnitConverterUtils.convert(0, 'length', 'm', 'km');
      expect(result).toBe(0);
    });

    it('should handle very small numbers', () => {
      const result = UnitConverterUtils.convert(0.001, 'length', 'm', 'mm');
      expect(result).toBe(1);
    });

    it('should handle large numbers within finite range', () => {
      const result = UnitConverterUtils.convert(1000000, 'length', 'm', 'km');
      expect(result).toBe(1000);
    });
  });

  describe('Utility methods', () => {
    it('should return correct units for length category', () => {
      const units = UnitConverterUtils.getUnitsForCategory('length');
      expect(units).toHaveProperty('m');
      expect(units).toHaveProperty('km');
      expect(units.m).toBe('Meters');
    });

    it('should return correct units for weight category', () => {
      const units = UnitConverterUtils.getUnitsForCategory('weight');
      expect(units).toHaveProperty('kg');
      expect(units).toHaveProperty('lb');
      expect(units.kg).toBe('Kilograms');
    });

    it('should return correct units for temperature category', () => {
      const units = UnitConverterUtils.getUnitsForCategory('temperature');
      expect(units).toHaveProperty('C');
      expect(units).toHaveProperty('F');
      expect(units).toHaveProperty('K');
    });

    it('should return correct units for currency category', () => {
      const units = UnitConverterUtils.getUnitsForCategory('currency');
      expect(units).toHaveProperty('USD');
      expect(units).toHaveProperty('EUR');
      expect(units.USD).toBe('US Dollar');
    });

    it('should return empty object for invalid category', () => {
      const units = UnitConverterUtils.getUnitsForCategory('invalid');
      expect(units).toEqual({});
    });

    it('should return all categories', () => {
      const categories = UnitConverterUtils.getCategories();
      expect(categories).toContain('length');
      expect(categories).toContain('weight');
      expect(categories).toContain('temperature');
      expect(categories).toContain('currency');
      expect(categories).toHaveLength(4);
    });

    it('should return correct category names', () => {
      expect(UnitConverterUtils.getCategoryName('length')).toBe('Length');
      expect(UnitConverterUtils.getCategoryName('weight')).toBe('Weight');
      expect(UnitConverterUtils.getCategoryName('temperature')).toBe(
        'Temperature'
      );
      expect(UnitConverterUtils.getCategoryName('currency')).toBe('Currency');
    });

    it('should return category itself for invalid category name', () => {
      expect(UnitConverterUtils.getCategoryName('invalid')).toBe('invalid');
    });
  });

  describe('Edge cases and precision', () => {
    it('should handle very precise decimal conversions', () => {
      const result = UnitConverterUtils.convert(
        1.23456789,
        'length',
        'm',
        'cm'
      );
      expect(result).toBe(123.456789);
    });

    it('should handle currency precision correctly', () => {
      const result = UnitConverterUtils.convert(
        99.999,
        'currency',
        'USD',
        'EUR'
      );
      expect(result).toBe(85.0); // Should round to 2 decimal places
    });

    it('should handle repeating decimal results', () => {
      const result = UnitConverterUtils.convert(1, 'length', 'ft', 'm');
      expect(result).toBeCloseTo(0.3048, 4);
    });

    it('should handle conversion chains correctly', () => {
      // Convert 1 mile to meters, then to kilometers
      const meters = UnitConverterUtils.convert(1, 'length', 'mi', 'm');
      const kilometers = UnitConverterUtils.convert(
        meters,
        'length',
        'm',
        'km'
      );
      expect(kilometers).toBeCloseTo(1.609344, 4);
    });
  });
});
