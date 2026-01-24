/**
 * Number Base Converter utility functions
 */

export type NumberBase = 2 | 8 | 10 | 16;

export interface ConversionResult {
  value: string;
  valid: boolean;
  error?: string;
}

/**
 * Convert a number from one base to another
 */
export function convertBase(
  value: string,
  fromBase: NumberBase,
  toBase: NumberBase
): ConversionResult {
  try {
    // Trim whitespace
    const trimmed = value.trim();

    if (!trimmed) {
      return { value: '', valid: false, error: 'Empty input' };
    }

    // Parse the number from the source base
    const decimalValue = parseInt(trimmed, fromBase);

    if (isNaN(decimalValue)) {
      return {
        value: '',
        valid: false,
        error: `Invalid number for base ${fromBase}`,
      };
    }

    // Convert to the target base
    const result = decimalValue.toString(toBase).toUpperCase();

    return { value: result, valid: true };
  } catch (error) {
    return {
      value: '',
      valid: false,
      error: `Conversion error: ${(error as Error).message}`,
    };
  }
}

/**
 * Convert to all supported bases
 */
export function convertToAllBases(value: string, fromBase: NumberBase): Record<
  NumberBase,
  ConversionResult
> {
  return {
    2: convertBase(value, fromBase, 2),
    8: convertBase(value, fromBase, 8),
    10: convertBase(value, fromBase, 10),
    16: convertBase(value, fromBase, 16),
  };
}

/**
 * Validate a number string for a specific base
 */
export function isValidNumberForBase(value: string, base: NumberBase): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Remove prefix (0x, 0o, 0b) for validation
  const cleanValue = trimmed.replace(/^(0x|0o|0b)/i, '');

  // Define valid characters for each base
  const validChars: Record<NumberBase, RegExp> = {
    2: /^[01]+$/,
    8: /^[0-7]+$/,
    10: /^[0-9]+$/,
    16: /^[0-9A-Fa-f]+$/,
  };

  return validChars[base].test(cleanValue);
}

/**
 * Get the prefix for a base
 */
export function getBasePrefix(base: NumberBase): string {
  const prefixes: Record<NumberBase, string> = {
    2: '0b',
    8: '0o',
    10: '',
    16: '0x',
  };
  return prefixes[base];
}

/**
 * Format a number with base prefix
 */
export function formatWithPrefix(value: string, base: NumberBase): string {
  const prefix = getBasePrefix(base);
  const prefixInValue = value.match(/^(0x|0o|0b)/i)?.[0];

  // Remove existing prefix if present
  const cleanValue = value.replace(/^(0x|0o|0b)/i, '');

  return prefix + cleanValue.toUpperCase();
}

/**
 * Get the name of a base
 */
export function getBaseName(base: NumberBase): string {
  const names: Record<NumberBase, string> = {
    2: 'Binary',
    8: 'Octal',
    10: 'Decimal',
    16: 'Hexadecimal',
  };
  return names[base];
}
