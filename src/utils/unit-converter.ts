/**
 * Unit converter utility functions
 */

export interface ConversionUnit {
  name: string;
  symbol: string;
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
}

export interface ConversionCategory {
  category: string;
  units: Record<string, ConversionUnit>;
}

export const conversions: Record<string, ConversionCategory> = {
  length: {
    category: "Length",
    units: {
      meter: { name: "Meter", symbol: "m", toBase: (v) => v, fromBase: (v) => v },
      kilometer: { name: "Kilometer", symbol: "km", toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      centimeter: { name: "Centimeter", symbol: "cm", toBase: (v) => v / 100, fromBase: (v) => v * 100 },
      millimeter: { name: "Millimeter", symbol: "mm", toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      mile: { name: "Mile", symbol: "mi", toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },
      yard: { name: "Yard", symbol: "yd", toBase: (v) => v * 0.9144, fromBase: (v) => v / 0.9144 },
      foot: { name: "Foot", symbol: "ft", toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
      inch: { name: "Inch", symbol: "in", toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
    },
  },
  weight: {
    category: "Weight",
    units: {
      kilogram: { name: "Kilogram", symbol: "kg", toBase: (v) => v, fromBase: (v) => v },
      gram: { name: "Gram", symbol: "g", toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      milligram: { name: "Milligram", symbol: "mg", toBase: (v) => v / 1000000, fromBase: (v) => v * 1000000 },
      pound: { name: "Pound", symbol: "lb", toBase: (v) => v * 0.453592, fromBase: (v) => v / 0.453592 },
      ounce: { name: "Ounce", symbol: "oz", toBase: (v) => v * 0.0283495, fromBase: (v) => v / 0.0283495 },
    },
  },
  temperature: {
    category: "Temperature",
    units: {
      celsius: { name: "Celsius", symbol: "°C", toBase: (v) => v, fromBase: (v) => v },
      fahrenheit: {
        name: "Fahrenheit",
        symbol: "°F",
        toBase: (v) => (v - 32) * 5 / 9,
        fromBase: (v) => v * 9 / 5 + 32,
      },
      kelvin: { name: "Kelvin", symbol: "K", toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
    },
  },
  data: {
    category: "Data",
    units: {
      byte: { name: "Byte", symbol: "B", toBase: (v) => v, fromBase: (v) => v },
      kilobyte: { name: "Kilobyte", symbol: "KB", toBase: (v) => v * 1024, fromBase: (v) => v / 1024 },
      megabyte: { name: "Megabyte", symbol: "MB", toBase: (v) => v * 1024 * 1024, fromBase: (v) => v / (1024 * 1024) },
      gigabyte: { name: "Gigabyte", symbol: "GB", toBase: (v) => v * 1024 * 1024 * 1024, fromBase: (v) => v / (1024 * 1024 * 1024) },
    },
  },
};

/**
 * Get all available categories
 */
export function getCategories(): string[] {
  return Object.keys(conversions);
}

/**
 * Get units for a specific category
 */
export function getUnits(category: string): Record<string, ConversionUnit> {
  return conversions[category]?.units || {};
}

/**
 * Convert a value from one unit to another
 */
export function convert(value: number, category: string, fromUnit: string, toUnit: string): number {
  const conversion = conversions[category];
  if (!conversion) {
    throw new Error(`Unknown category: ${category}`);
  }

  const from = conversion.units[fromUnit];
  const to = conversion.units[toUnit];

  if (!from || !to) {
    throw new Error(`Unknown unit: ${from || toUnit} or ${to || toUnit}`);
  }

  // Convert to base unit, then to target unit
  const baseValue = from.toBase(value);
  return to.fromBase(baseValue);
}

/**
 * Format a conversion result
 */
export function formatResult(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(6).replace(/\.?0+$/, "");
}
