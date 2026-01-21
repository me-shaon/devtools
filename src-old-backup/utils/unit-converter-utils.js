/**
 * Unit conversion utilities with comprehensive conversion support
 * Supports Length, Weight, Temperature, and Currency conversions
 */

class UnitConverterUtils {
  // Length conversions (all to meters as base)
  static LENGTH_CONVERSIONS = {
    mm: 0.001,
    cm: 0.01,
    m: 1,
    km: 1000,
    in: 0.0254,
    ft: 0.3048,
    yd: 0.9144,
    mi: 1609.344,
  };

  // Weight conversions (all to grams as base)
  static WEIGHT_CONVERSIONS = {
    mg: 0.001,
    g: 1,
    kg: 1000,
    oz: 28.3495,
    lb: 453.592,
    st: 6350.29,
    t: 1000000,
  };

  // Currency rates (static rates for offline use - USD as base)
  static CURRENCY_RATES = {
    USD: 1,
    EUR: 0.85,
    GBP: 0.73,
    JPY: 110,
    CAD: 1.25,
    AUD: 1.35,
  };

  static UNIT_CATEGORIES = {
    length: {
      name: 'Length',
      units: {
        mm: 'Millimeters',
        cm: 'Centimeters',
        m: 'Meters',
        km: 'Kilometers',
        in: 'Inches',
        ft: 'Feet',
        yd: 'Yards',
        mi: 'Miles',
      },
    },
    weight: {
      name: 'Weight',
      units: {
        mg: 'Milligrams',
        g: 'Grams',
        kg: 'Kilograms',
        oz: 'Ounces',
        lb: 'Pounds',
        st: 'Stones',
        t: 'Metric Tons',
      },
    },
    temperature: {
      name: 'Temperature',
      units: {
        C: 'Celsius',
        F: 'Fahrenheit',
        K: 'Kelvin',
      },
    },
    currency: {
      name: 'Currency',
      units: {
        USD: 'US Dollar',
        EUR: 'Euro',
        GBP: 'British Pound',
        JPY: 'Japanese Yen',
        CAD: 'Canadian Dollar',
        AUD: 'Australian Dollar',
      },
    },
  };

  /**
   * Convert length units
   */
  static convertLength(value, fromUnit, toUnit) {
    if (
      !this.LENGTH_CONVERSIONS[fromUnit] ||
      !this.LENGTH_CONVERSIONS[toUnit]
    ) {
      throw new Error('Invalid length unit');
    }

    // Convert to base unit (meters) then to target unit
    const meters = value * this.LENGTH_CONVERSIONS[fromUnit];
    return meters / this.LENGTH_CONVERSIONS[toUnit];
  }

  /**
   * Convert weight units
   */
  static convertWeight(value, fromUnit, toUnit) {
    if (
      !this.WEIGHT_CONVERSIONS[fromUnit] ||
      !this.WEIGHT_CONVERSIONS[toUnit]
    ) {
      throw new Error('Invalid weight unit');
    }

    // Convert to base unit (grams) then to target unit
    const grams = value * this.WEIGHT_CONVERSIONS[fromUnit];
    return grams / this.WEIGHT_CONVERSIONS[toUnit];
  }

  /**
   * Convert temperature units
   */
  static convertTemperature(value, fromUnit, toUnit) {
    if (fromUnit === toUnit) return value;

    let celsius;

    // Convert to Celsius first
    switch (fromUnit) {
      case 'C':
        celsius = value;
        break;
      case 'F':
        celsius = ((value - 32) * 5) / 9;
        break;
      case 'K':
        if (value < 0) {
          throw new Error('Kelvin cannot be negative');
        }
        celsius = value - 273.15;
        break;
      default:
        throw new Error('Invalid temperature unit');
    }

    // Convert from Celsius to target unit
    switch (toUnit) {
      case 'C':
        return celsius;
      case 'F':
        return (celsius * 9) / 5 + 32;
      case 'K':
        const kelvin = celsius + 273.15;
        if (kelvin < 0) {
          throw new Error('Temperature below absolute zero');
        }
        return kelvin;
      default:
        throw new Error('Invalid temperature unit');
    }
  }

  /**
   * Convert currency units
   */
  static convertCurrency(value, fromUnit, toUnit) {
    if (!this.CURRENCY_RATES[fromUnit] || !this.CURRENCY_RATES[toUnit]) {
      throw new Error('Invalid currency unit');
    }

    // Convert to base currency (USD) then to target currency
    const usd = value / this.CURRENCY_RATES[fromUnit];
    return usd * this.CURRENCY_RATES[toUnit];
  }

  /**
   * Main conversion method that routes to appropriate converter
   */
  static convert(value, category, fromUnit, toUnit) {
    // Validate input
    if (value === '' || value === null || value === undefined) {
      throw new Error('Please enter a value to convert');
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      throw new Error('Please enter a valid number');
    }

    if (!isFinite(numValue)) {
      throw new Error('Number is too large');
    }

    // Check for negative values where inappropriate
    if (category === 'weight' && numValue < 0) {
      throw new Error('Weight cannot be negative');
    }

    if (category === 'length' && numValue < 0) {
      throw new Error('Length cannot be negative');
    }

    let result;
    switch (category) {
      case 'length':
        result = this.convertLength(numValue, fromUnit, toUnit);
        break;
      case 'weight':
        result = this.convertWeight(numValue, fromUnit, toUnit);
        break;
      case 'temperature':
        result = this.convertTemperature(numValue, fromUnit, toUnit);
        break;
      case 'currency':
        result = this.convertCurrency(numValue, fromUnit, toUnit);
        break;
      default:
        throw new Error('Invalid conversion category');
    }

    // Round to reasonable precision
    if (category === 'currency') {
      return Math.round(result * 100) / 100; // 2 decimal places for currency
    } else {
      return Math.round(result * 1000000) / 1000000; // 6 decimal places for others
    }
  }

  /**
   * Get units for a category
   */
  static getUnitsForCategory(category) {
    return this.UNIT_CATEGORIES[category]?.units || {};
  }

  /**
   * Get all categories
   */
  static getCategories() {
    return Object.keys(this.UNIT_CATEGORIES);
  }

  /**
   * Get category display name
   */
  static getCategoryName(category) {
    return this.UNIT_CATEGORIES[category]?.name || category;
  }
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnitConverterUtils;
}

// Export for browser
if (typeof window !== 'undefined') {
  window.UnitConverterUtils = UnitConverterUtils;
}
