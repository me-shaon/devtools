import { describe, it, expect } from 'vitest';
import {
  evaluateIntExpression,
  looksLikeExpression,
  MAX_RESULT_BITS,
  readNumberInput,
} from '@/utils/int-expression';

const ev = (text: string, options = {}) => {
  const r = evaluateIntExpression(text, options);
  return r.ok ? r.value : r.error;
};

describe('evaluateIntExpression', () => {
  it('reads literals in every form', () => {
    expect(ev('0xff + 0b1010 * 3')).toBe(285n);
    expect(ev('0o17 + 1_000_000')).toBe(1000015n);
    expect(ev('(1 << 12) - 1')).toBe(4095n);
    expect(ev('0x7f & ~0x0f')).toBe(0x70n);
  });

  it('follows JavaScript precedence', () => {
    expect(ev('1 + 2 * 3')).toBe(7n);
    expect(ev('(1 + 2) * 3')).toBe(9n);
    expect(ev('1 + 2 << 3')).toBe(24n);
    expect(ev('1 | 2 ^ 3 & 4')).toBe(1n | (2n ^ (3n & 4n)));
    expect(ev('6 & 3 | 8')).toBe(10n);
    expect(ev('2 * 3 ** 2')).toBe(18n);
    expect(ev('-3 * 2')).toBe(-6n);
    expect(ev('~0 + 1')).toBe(0n);
  });

  it('makes ** right-associative and other operators left-associative', () => {
    expect(ev('2 ** 3 ** 2')).toBe(512n);
    expect(ev('10 - 4 - 3')).toBe(3n);
    expect(ev('100 / 10 / 5')).toBe(2n);
    expect(ev('1 << 2 << 3')).toBe(32n);
  });

  it('rejects -2 ** 2 as JavaScript does, and accepts the parenthesized forms', () => {
    expect(ev('-2 ** 2')).toContain('Add parentheses');
    expect(ev('~2 ** 2')).toContain('Add parentheses');
    expect(ev('(-2) ** 2')).toBe(4n);
    expect(ev('-(2 ** 2)')).toBe(-4n);
    expect(ev('2 ** -1')).toContain('exponent of 0 or more');
    expect(ev('2 ** - - 3')).toBe(8n);
  });

  it('truncates division toward zero and gives C remainders', () => {
    expect(ev('7 / 2')).toBe(3n);
    expect(ev('-7 / 2')).toBe(-3n);
    expect(ev('7 / -2')).toBe(-3n);
    expect(ev('-7 % 2')).toBe(-1n);
    expect(ev('7 % -2')).toBe(1n);
  });

  it('reports division by zero', () => {
    expect(ev('1 / 0')).toBe('Division by zero.');
    expect(ev('1 % (2 - 2)')).toBe('Division by zero.');
  });

  it('handles shifts on negative numbers and >>> at the selected width', () => {
    expect(ev('-16 >> 2')).toBe(-4n);
    expect(ev('-1 >>> 28')).toBe(0xfn);
    expect(ev('-1 >>> 0', { width: 8 })).toBe(255n);
    expect(ev('-1 >>> 60', { width: 64 })).toBe(0xfn);
    expect(ev('1 << -1')).toBe(0n);
    expect(ev('1 >>> -1')).toContain('0 or more');
  });

  it('keeps BigInt values exact', () => {
    expect(ev('2 ** 64 - 1')).toBe(18446744073709551615n);
    expect(ev('(1 << 128) / 3')).toBe((1n << 128n) / 3n);
    expect(ev('0xffffffffffffffffffff * 0xffffffffffffffffffff')).toBe(0xffffffffffffffffffffn ** 2n);
    expect(ev('-0')).toBe(0n);
  });

  it('caps large results so they cannot hang the app', () => {
    expect(ev('9 ** 9 ** 9')).toContain(`${MAX_RESULT_BITS} bits`);
    expect(ev('1 << 1_000_000_000')).toContain(`${MAX_RESULT_BITS}`);
    expect(ev(`1 << ${MAX_RESULT_BITS}`)).toContain(`${MAX_RESULT_BITS} bits`);
    expect(ev(`1 << ${MAX_RESULT_BITS - 1}`)).toBe(1n << BigInt(MAX_RESULT_BITS - 1));
    expect(ev('(2 ** 4000) * (2 ** 4000)')).toContain(`${MAX_RESULT_BITS} bits`);
    expect(ev('1 ** 99999999999')).toBe(1n);
    expect(ev('(-1) ** 99999999999')).toBe(-1n);
  });

  it('rejects decimals, unknown characters, and incomplete expressions', () => {
    expect(ev('1.5 + 1')).toContain('integers only');
    expect(ev('1 + .5')).toContain('integers only');
    expect(ev('1 $ 2')).toBe('"$" is not a valid operator.');
    expect(ev('1 +')).toBe('The expression is not complete.');
    expect(ev('(1 + 2')).toBe('Add the missing ")".');
    expect(ev('1 + 2)')).toBe('Remove the extra ")".');
    expect(ev('1 2')).toBe('Unexpected "2".');
    expect(ev('* 2')).toBe('Unexpected "*".');
    expect(ev('12xyz + 1')).toContain('not a valid base 10 digit');
  });

  it('reads literals without a prefix in the selected base', () => {
    expect(ev('ff + 1', { base: 16 })).toBe(256n);
    expect(ev('10 + 1', { base: 2 })).toBe(3n);
    expect(ev('zz + 1', { base: 36 })).toBe(1296n);
    expect(ev('ff + 1')).toBe(256n);
    expect(ev('2 + 2', { base: 2 })).toContain('not a valid base 2 digit');
  });

  it('never runs code', () => {
    expect(ev('alert(1)')).toContain('not a valid');
    expect(ev('constructor')).toContain('not a valid');
  });
});

describe('looksLikeExpression', () => {
  it('ignores a leading sign', () => {
    expect(looksLikeExpression('-1')).toBe(false);
    expect(looksLikeExpression('+0x10')).toBe(false);
    expect(looksLikeExpression('1 - 1')).toBe(true);
    expect(looksLikeExpression('(5)')).toBe(true);
    expect(looksLikeExpression('1.5')).toBe(true);
  });
});

describe('readNumberInput', () => {
  it('reads a plain literal as before', () => {
    expect(readNumberInput('0xFF', 'auto')).toEqual({ ok: true, value: 255n, base: 16, source: 'literal' });
    expect(readNumberInput('1111 0000', 2)).toEqual({ ok: true, value: 240n, base: 2, source: 'literal' });
    expect(readNumberInput('CD', 'auto')).toEqual({ ok: true, value: 0xcdn, base: 16, source: 'literal' });
  });

  it('keeps the literal error when the input has no operator', () => {
    expect(readNumberInput('19', 8)).toEqual({ ok: false, error: '"9" is not a valid base 8 digit.' });
  });

  it('reads an expression when the literal parse fails', () => {
    expect(readNumberInput('1 + 2', 'auto')).toEqual({ ok: true, value: 3n, source: 'expression' });
    expect(readNumberInput('-1 >>> 24', 'auto', 32)).toEqual({ ok: true, value: 255n, source: 'expression' });
  });

  it('reads Roman numerals only with the Roman base', () => {
    expect(readNumberInput('CD', 'roman')).toEqual({ ok: true, value: 400n, source: 'roman' });
    expect(readNumberInput('mcmxciv', 'roman')).toEqual({ ok: true, value: 1994n, source: 'roman' });
    expect(readNumberInput('0xFF', 'roman').ok).toBe(false);
  });
});
