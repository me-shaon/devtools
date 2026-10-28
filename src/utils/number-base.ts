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

/** Count the set bits of a non-negative value. */
export function popcount(value: bigint): number {
  let count = 0;
  for (let v = value; v > 0n; v &= v - 1n) count++;
  return count;
}

/** Index of the highest set bit of a non-negative value, or null for zero. */
export function highestSetBit(value: bigint): number | null {
  return value > 0n ? value.toString(2).length - 1 : null;
}

/** Index of the lowest set bit of a non-negative value, or null for zero. */
export function lowestSetBit(value: bigint): number | null {
  if (value <= 0n) return null;
  let index = 0;
  for (let v = value; (v & 1n) === 0n; v >>= 1n) index++;
  return index;
}

/** Reverse the byte order of an unsigned value of `bits` width, to change its endianness. */
export function byteSwap(value: bigint, bits: number): bigint {
  let source = BigInt.asUintN(bits, value);
  let result = 0n;
  for (let i = 0; i < bits / 8; i++) {
    result = (result << 8n) | (source & 0xffn);
    source >>= 8n;
  }
  return result;
}

/**
 * Flip one bit of a value at a fixed width.
 * A negative value stays signed and a non-negative value stays unsigned, so -1 with bit 0 flipped is -2.
 */
export function toggleBit(value: bigint, bit: number, bits: number): bigint {
  const flipped = BigInt.asUintN(bits, value) ^ (1n << BigInt(bit));
  return value < 0n ? BigInt.asIntN(bits, flipped) : flipped;
}

const ROMAN_SYMBOLS: [string, number][] = [
  ['M', 1000],
  ['CM', 900],
  ['D', 500],
  ['CD', 400],
  ['C', 100],
  ['XC', 90],
  ['L', 50],
  ['XL', 40],
  ['X', 10],
  ['IX', 9],
  ['V', 5],
  ['IV', 4],
  ['I', 1],
];

// The standard subtractive form: each decimal digit has exactly one spelling.
const ROMAN_PATTERN = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

/** Write a value from 1 to 3999 as a Roman numeral. Returns null for other values. */
export function toRoman(value: bigint): string | null {
  if (value < 1n || value > 3999n) return null;
  let rest = Number(value);
  let result = '';
  for (const [symbol, amount] of ROMAN_SYMBOLS) {
    while (rest >= amount) {
      result += symbol;
      rest -= amount;
    }
  }
  return result;
}

/** Strictly parse a Roman numeral in standard form, in any case. IIII, VX and IC are errors. */
export function parseRoman(input: string): { ok: true; value: bigint } | { ok: false; error: string } {
  const text = input.trim().toUpperCase();
  if (!text) return { ok: false, error: 'Enter a Roman numeral.' };
  if (!/^[MDCLXVI]+$/.test(text) || !ROMAN_PATTERN.test(text)) {
    return {
      ok: false,
      error: `"${input.trim()}" is not a valid Roman numeral. Use the standard form from I to MMMCMXCIX, such as IV for 4.`,
    };
  }
  let value = 0;
  let i = 0;
  for (const [symbol, amount] of ROMAN_SYMBOLS) {
    while (text.startsWith(symbol, i)) {
      value += amount;
      i += symbol.length;
    }
  }
  return { ok: true, value: BigInt(value) };
}
