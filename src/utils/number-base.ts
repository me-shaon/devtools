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
 * Parse a string in the given base into a BigInt.
 * Mirrors parseInt: optional sign, optional 0x prefix for base 16,
 * and parsing stops at the first invalid character.
 * Returns null when no valid digit is found.
 */
export function parseBigIntFromBase(value: string, base: NumberBase): bigint | null {
  let text = value.trim();
  let negative = false;
  if (text[0] === '-' || text[0] === '+') {
    negative = text[0] === '-';
    text = text.slice(1);
  }
  if (base === 16 && /^0x/i.test(text)) {
    text = text.slice(2);
  }

  let result = 0n;
  const bigBase = BigInt(base);
  let digits = 0;
  for (const ch of text) {
    const digit = parseInt(ch, 36);
    if (Number.isNaN(digit) || digit >= base) break;
    result = result * bigBase + BigInt(digit);
    digits++;
  }

  if (digits === 0) return null;
  return negative ? -result : result;
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

    // Parse the number from the source base (exact, BigInt based)
    const parsed = parseBigIntFromBase(trimmed, fromBase);

    if (parsed === null) {
      return {
        value: '',
        valid: false,
        error: `Invalid number for base ${fromBase}`,
      };
    }

    // Convert to the target base
    const result = parsed.toString(toBase).toUpperCase();

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

export type ParsedNumber =
  | { ok: true; value: bigint; base: number }
  | { ok: false; error: string };

const PREFIX_BASES: Record<string, number> = { x: 16, o: 8, b: 2 };

/**
 * Strictly parse an integer for the live converter.
 * In auto mode a 0x, 0o or 0b prefix picks the base. Without a prefix, plain
 * digits are decimal and digits with A to F are hex. Underscores and spaces
 * are digit separators. Any other invalid character is an error.
 */
export function parseNumber(input: string, base: 'auto' | number = 'auto'): ParsedNumber {
  let text = input.trim().replace(/[_\s]/g, '');
  if (!text) return { ok: false, error: 'Enter a number.' };

  let negative = false;
  if (text[0] === '-' || text[0] === '+') {
    negative = text[0] === '-';
    text = text.slice(1);
  }

  let radix = base === 'auto' ? 10 : base;
  const prefix = /^0([xob])/i.exec(text);
  if (prefix) {
    const prefixBase = PREFIX_BASES[prefix[1].toLowerCase()];
    // With an explicit base, "0b1" can be valid hex digits, so strip only the matching prefix.
    if (base === 'auto' || base === prefixBase) {
      radix = prefixBase;
      text = text.slice(2);
    }
  } else if (base === 'auto' && /^[0-9a-f]+$/i.test(text) && /[a-f]/i.test(text)) {
    radix = 16;
  }

  if (!text) return { ok: false, error: 'Enter digits after the prefix.' };

  let value = 0n;
  const bigRadix = BigInt(radix);
  for (const ch of text) {
    const digit = parseInt(ch, 36);
    if (Number.isNaN(digit) || digit >= radix) {
      return { ok: false, error: `"${ch}" is not a valid base ${radix} digit.` };
    }
    value = value * bigRadix + BigInt(digit);
  }

  return { ok: true, value: negative ? -value : value, base: radix };
}

/** Format a BigInt in any base from 2 to 36, with upper-case letters. */
export function toBase(value: bigint, base: number): string {
  return value.toString(base).toUpperCase();
}

/** Split digits into groups of `size` from the right, for example nibbles or thousands. */
export function groupDigits(digits: string, size: number, separator = ' '): string {
  const sign = digits.startsWith('-') ? '-' : '';
  const body = sign ? digits.slice(1) : digits;
  const groups: string[] = [];
  for (let end = body.length; end > 0; end -= size) {
    groups.unshift(body.slice(Math.max(0, end - size), end));
  }
  return sign + groups.join(separator);
}

export interface FixedWidthView {
  /** False when the value is outside both the signed and the unsigned range. */
  fits: boolean;
  signed: bigint;
  unsigned: bigint;
  hex: string;
  binary: string;
}

/**
 * Show a value as a fixed-width integer, as C, Rust or Go store it.
 * Negative values use two's complement. Values from 2^(bits-1) to 2^bits - 1
 * read as negative signed values.
 */
export function fixedWidth(value: bigint, bits: number): FixedWidthView {
  const width = BigInt(bits);
  const fits = value >= -(1n << (width - 1n)) && value < 1n << width;
  const unsigned = BigInt.asUintN(bits, value);
  return {
    fits,
    signed: BigInt.asIntN(bits, value),
    unsigned,
    hex: toBase(unsigned, 16).padStart(bits / 4, '0'),
    binary: unsigned.toString(2).padStart(bits, '0'),
  };
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
