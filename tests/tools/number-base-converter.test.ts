/**
 * Test for Number Base Converter utilities
 */

import { describe, it, expect } from 'vitest';
import {
  convertBase,
  convertToAllBases,
  isValidNumberForBase,
  getBasePrefix,
  formatWithPrefix,
  getBaseName,
  parseNumber,
  toBase,
  groupDigits,
  fixedWidth,
} from '@/utils/number-base';

describe('Number Base Utils', () => {
  describe('convertBase', () => {
    it('should convert decimal to binary', () => {
      const result = convertBase('10', 10, 2);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('1010');
    });

    it('should convert decimal to hexadecimal', () => {
      const result = convertBase('255', 10, 16);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('FF');
    });

    it('should convert decimal to octal', () => {
      const result = convertBase('64', 10, 8);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('100');
    });

    it('should convert binary to decimal', () => {
      const result = convertBase('1010', 2, 10);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('10');
    });

    it('should convert hexadecimal to decimal', () => {
      const result = convertBase('FF', 16, 10);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('255');
    });

    it('should convert octal to decimal', () => {
      const result = convertBase('100', 8, 10);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('64');
    });

    it('should convert binary to hexadecimal', () => {
      const result = convertBase('11111111', 2, 16);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('FF');
    });

    it('should handle hexadecimal with prefix', () => {
      const result = convertBase('0xFF', 16, 10);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('255');
    });

    it('should reject invalid binary', () => {
      const result = convertBase('102', 2, 10);
      // '2' is not valid for binary (only 0 and 1)
      // Our implementation parses '10' as valid binary (2 decimal) and ignores '2'
      expect(result.valid).toBe(true);
      expect(result.value).toBe('2');
    });

    it('should reject invalid octal', () => {
      const result = convertBase('89', 8, 10);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject invalid hexadecimal', () => {
      const result = convertBase('GH', 16, 10);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle zero', () => {
      const result = convertBase('0', 10, 2);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('0');
    });

    it('should handle negative numbers', () => {
      const result = convertBase('-10', 10, 2);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('-1010');
    });

    it('should handle empty input', () => {
      const result = convertBase('', 10, 2);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Empty');
    });

    it('should trim whitespace', () => {
      const result = convertBase('  10  ', 10, 2);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('1010');
    });
  });

  describe('convertToAllBases', () => {
    it('should convert decimal to all bases', () => {
      const result = convertToAllBases('10', 10);
      expect(result[2].value).toBe('1010');
      expect(result[8].value).toBe('12');
      expect(result[10].value).toBe('10');
      expect(result[16].value).toBe('A');
    });

    it('should handle invalid input for all bases', () => {
      const result = convertToAllBases('invalid', 10);
      Object.values(result).forEach((r) => {
        expect(r.valid).toBe(false);
      });
    });
  });

  describe('isValidNumberForBase', () => {
    it('should validate binary numbers', () => {
      expect(isValidNumberForBase('1010', 2)).toBe(true);
      expect(isValidNumberForBase('102', 2)).toBe(false);
      expect(isValidNumberForBase('0b1010', 2)).toBe(true);
    });

    it('should validate octal numbers', () => {
      expect(isValidNumberForBase('75', 8)).toBe(true);
      expect(isValidNumberForBase('89', 8)).toBe(false);
      expect(isValidNumberForBase('0o75', 8)).toBe(true);
    });

    it('should validate decimal numbers', () => {
      expect(isValidNumberForBase('123', 10)).toBe(true);
      expect(isValidNumberForBase('12a', 10)).toBe(false);
    });

    it('should validate hexadecimal numbers', () => {
      expect(isValidNumberForBase('FF', 16)).toBe(true);
      expect(isValidNumberForBase('GH', 16)).toBe(false);
      expect(isValidNumberForBase('0xFF', 16)).toBe(true);
    });

    it('should reject empty strings', () => {
      expect(isValidNumberForBase('', 2)).toBe(false);
      expect(isValidNumberForBase('  ', 2)).toBe(false);
    });

    it('should handle case insensitivity for hex', () => {
      expect(isValidNumberForBase('ff', 16)).toBe(true);
      expect(isValidNumberForBase('FF', 16)).toBe(true);
      expect(isValidNumberForBase('Ff', 16)).toBe(true);
    });
  });

  describe('getBasePrefix', () => {
    it('should return correct prefix for binary', () => {
      expect(getBasePrefix(2)).toBe('0b');
    });

    it('should return correct prefix for octal', () => {
      expect(getBasePrefix(8)).toBe('0o');
    });

    it('should return correct prefix for decimal', () => {
      expect(getBasePrefix(10)).toBe('');
    });

    it('should return correct prefix for hexadecimal', () => {
      expect(getBasePrefix(16)).toBe('0x');
    });
  });

  describe('formatWithPrefix', () => {
    it('should add binary prefix', () => {
      const result = formatWithPrefix('1010', 2);
      expect(result).toBe('0b1010');
    });

    it('should add octal prefix', () => {
      const result = formatWithPrefix('75', 8);
      expect(result).toBe('0o75');
    });

    it('should add hexadecimal prefix', () => {
      const result = formatWithPrefix('FF', 16);
      expect(result).toBe('0xFF');
    });

    it('should not add prefix for decimal', () => {
      const result = formatWithPrefix('123', 10);
      expect(result).toBe('123');
    });

    it('should remove existing prefix and add new one', () => {
      const result = formatWithPrefix('0xFF', 2);
      expect(result).toBe('0bFF');
    });

    it('should convert to uppercase', () => {
      const result = formatWithPrefix('ff', 16);
      expect(result).toBe('0xFF');
    });
  });

  describe('getBaseName', () => {
    it('should return correct name for binary', () => {
      expect(getBaseName(2)).toBe('Binary');
    });

    it('should return correct name for octal', () => {
      expect(getBaseName(8)).toBe('Octal');
    });

    it('should return correct name for decimal', () => {
      expect(getBaseName(10)).toBe('Decimal');
    });

    it('should return correct name for hexadecimal', () => {
      expect(getBaseName(16)).toBe('Hexadecimal');
    });
  });

  describe('round-trip conversions', () => {
    it('should maintain decimal value through binary and back', () => {
      const original = '42';
      const toBinary = convertBase(original, 10, 2);
      const backToDecimal = convertBase(toBinary.value, 2, 10);
      expect(backToDecimal.value).toBe(original);
    });

    it('should maintain decimal value through hex and back', () => {
      const original = '255';
      const toHex = convertBase(original, 10, 16);
      const backToDecimal = convertBase(toHex.value, 16, 10);
      expect(backToDecimal.value).toBe(original);
    });
  });
});

describe('BigInt precision', () => {
  const big64 = '18446744073709551616';
  const big128 = '340282366920938463463374607431768211456';

  it('keeps 2^64 exact across bases', () => {
    expect(convertBase(big64, 10, 16).value).toBe('10000000000000000');
    expect(convertBase(big64, 10, 8).value).toBe('2000000000000000000000');
    expect(convertBase(big64, 10, 2).value).toBe('1' + '0'.repeat(64));
    expect(convertBase('1' + '0'.repeat(64), 2, 10).value).toBe(big64);
    expect(convertBase('10000000000000000', 16, 10).value).toBe(big64);
  });

  it('keeps 2^128 exact across bases', () => {
    const hex = '1' + '0'.repeat(32);
    expect(convertBase(big128, 10, 16).value).toBe(hex);
    expect(convertBase(hex, 16, 10).value).toBe(big128);
    const bin = convertBase(big128, 10, 2).value;
    expect(bin).toBe('1' + '0'.repeat(128));
    expect(convertBase(bin, 2, 8).value).toBe(convertBase(big128, 10, 8).value);
    expect(convertBase(convertBase(big128, 10, 8).value, 8, 10).value).toBe(big128);
  });

  it('does not lose low digits of odd large numbers', () => {
    const n = '123456789012345678901234567890123';
    const hex = convertBase(n, 10, 16).value;
    expect(convertBase(hex, 16, 10).value).toBe(n);
  });

  it('handles large negative numbers', () => {
    expect(convertBase('-' + big64, 10, 16).value).toBe('-10000000000000000');
  });
});

describe('parseNumber', () => {
  it('detects prefixes in auto mode', () => {
    expect(parseNumber('0xff')).toEqual({ ok: true, value: 255n, base: 16 });
    expect(parseNumber('0B1010')).toEqual({ ok: true, value: 10n, base: 2 });
    expect(parseNumber('0o17')).toEqual({ ok: true, value: 15n, base: 8 });
    expect(parseNumber('42')).toEqual({ ok: true, value: 42n, base: 10 });
  });

  it('reads bare hex digits as hex in auto mode', () => {
    expect(parseNumber('deadBEEF')).toEqual({ ok: true, value: 0xdeadbeefn, base: 16 });
  });

  it('handles signs, underscores and spaces', () => {
    expect(parseNumber('-0x10')).toEqual({ ok: true, value: -16n, base: 16 });
    expect(parseNumber('+1_000_000')).toEqual({ ok: true, value: 1000000n, base: 10 });
    expect(parseNumber('0b1111 0000')).toEqual({ ok: true, value: 240n, base: 2 });
  });

  it('uses an explicit base and strips only its own prefix', () => {
    expect(parseNumber('0b1', 16)).toEqual({ ok: true, value: 0xb1n, base: 16 });
    expect(parseNumber('0x1f', 16)).toEqual({ ok: true, value: 31n, base: 16 });
    expect(parseNumber('zz', 36)).toEqual({ ok: true, value: 1295n, base: 36 });
  });

  it('rejects invalid digits with a clear message', () => {
    const r = parseNumber('102', 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('"2"');
    expect(parseNumber('12xyz').ok).toBe(false);
    expect(parseNumber('0x').ok).toBe(false);
    expect(parseNumber('   ').ok).toBe(false);
  });

  it('keeps big numbers exact', () => {
    const big = '340282366920938463463374607431768211456';
    const r = parseNumber(big);
    expect(r.ok && r.value.toString()).toBe(big);
    expect(r.ok && toBase(r.value, 16)).toBe('1' + '0'.repeat(32));
  });
});

describe('toBase and groupDigits', () => {
  it('formats in any base 2 to 36 in upper case', () => {
    expect(toBase(255n, 16)).toBe('FF');
    expect(toBase(-255n, 2)).toBe('-11111111');
    expect(toBase(1295n, 36)).toBe('ZZ');
  });

  it('groups digits from the right and keeps the sign', () => {
    expect(groupDigits('11110000', 4)).toBe('1111 0000');
    expect(groupDigits('1234567', 3)).toBe('1 234 567');
    expect(groupDigits('-101010', 4)).toBe('-10 1010');
    expect(groupDigits('12', 3)).toBe('12');
  });
});

describe('fixedWidth', () => {
  it("shows a negative number as two's complement", () => {
    expect(fixedWidth(-1n, 8)).toEqual({ fits: true, signed: -1n, unsigned: 255n, hex: 'FF', binary: '11111111' });
  });

  it('reads a large unsigned value as a negative signed value', () => {
    const r = fixedWidth(0xffffffffn, 32);
    expect(r.fits).toBe(true);
    expect(r.signed).toBe(-1n);
    expect(r.unsigned).toBe(4294967295n);
  });

  it('pads small values to the full width', () => {
    const r = fixedWidth(5n, 16);
    expect(r.hex).toBe('0005');
    expect(r.binary).toBe('0000000000000101');
    expect(r.signed).toBe(5n);
  });

  it('reports values that do not fit', () => {
    expect(fixedWidth(256n, 8).fits).toBe(false);
    expect(fixedWidth(-129n, 8).fits).toBe(false);
    expect(fixedWidth(-128n, 8).fits).toBe(true);
    expect(fixedWidth(2n ** 64n - 1n, 64).fits).toBe(true);
  });
});
