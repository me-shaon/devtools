/**
 * Integer expression evaluator for the Number Base tool.
 * A small tokenizer and a precedence-climbing parser over BigInt. It never uses eval or Function.
 */

import { parseNumber, parseRoman } from './number-base';

/** The largest result, in bits, that the evaluator computes. This stops 9 ** 9 ** 9 and 1 << 1e9 from hanging the app. */
export const MAX_RESULT_BITS = 4096;

export interface ExpressionOptions {
  /** Base for literals without a prefix, as in the literal parser. Default 'auto'. */
  base?: 'auto' | number;
  /** Bit width for the logical right shift `>>>`. Default 32. */
  width?: number;
}

export type ExpressionResult = { ok: true; value: bigint } | { ok: false; error: string };

type Token =
  | { kind: 'num'; text: string; pos: number }
  | { kind: 'op'; text: string; pos: number }
  | { kind: 'end'; pos: number };

class ExpressionError extends Error {}

// Longest operators first, so ">>>" wins over ">>" and "**" wins over "*".
const OPERATORS = ['>>>', '**', '<<', '>>', '+', '-', '*', '/', '%', '&', '|', '^', '~', '(', ')'];

/** Binary operator precedence, as in JavaScript and C. Higher binds tighter. */
const PRECEDENCE: Record<string, number> = {
  '|': 1,
  '^': 2,
  '&': 3,
  '<<': 4,
  '>>': 4,
  '>>>': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
  '**': 7,
};

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9A-Za-z_]/.test(ch)) {
      const start = i;
      while (i < text.length && /[0-9A-Za-z_]/.test(text[i])) i++;
      if (text[i] === '.') {
        throw new ExpressionError('Use integers only. Decimal points are not supported.');
      }
      tokens.push({ kind: 'num', text: text.slice(start, i), pos: start });
      continue;
    }
    if (ch === '.') throw new ExpressionError('Use integers only. Decimal points are not supported.');
    const op = OPERATORS.find((candidate) => text.startsWith(candidate, i));
    if (!op) throw new ExpressionError(`"${ch}" is not a valid operator.`);
    tokens.push({ kind: 'op', text: op, pos: i });
    i += op.length;
  }
  tokens.push({ kind: 'end', pos: text.length });
  return tokens;
}

function bitLength(value: bigint): number {
  const abs = value < 0n ? -value : value;
  return abs === 0n ? 0 : abs.toString(2).length;
}

function checkSize(value: bigint): bigint {
  if (bitLength(value) > MAX_RESULT_BITS) {
    throw new ExpressionError(`The result is larger than ${MAX_RESULT_BITS} bits. Use smaller numbers.`);
  }
  return value;
}

function checkShift(count: bigint): number {
  if (count > BigInt(MAX_RESULT_BITS) || count < -BigInt(MAX_RESULT_BITS)) {
    throw new ExpressionError(`The shift count must be ${MAX_RESULT_BITS} or less.`);
  }
  return Number(count);
}

function power(base: bigint, exponent: bigint): bigint {
  if (exponent < 0n) throw new ExpressionError('Use an exponent of 0 or more. Negative exponents give fractions.');
  if (base === 0n || base === 1n || base === -1n) return base ** exponent;
  // A base of 2 or more has at least (bits - 1) bits per factor, so this is a lower bound on the result size.
  if (BigInt(bitLength(base) - 1) * exponent > BigInt(MAX_RESULT_BITS)) {
    throw new ExpressionError(`The result is larger than ${MAX_RESULT_BITS} bits. Use a smaller exponent.`);
  }
  return base ** exponent;
}

function applyBinary(op: string, left: bigint, right: bigint, width: number): bigint {
  switch (op) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
    case '%':
      if (right === 0n) throw new ExpressionError('Division by zero.');
      // BigInt division truncates toward zero, and the remainder takes the sign of the left side, as in C.
      return op === '/' ? left / right : left % right;
    case '**':
      return power(left, right);
    case '&':
      return left & right;
    case '|':
      return left | right;
    case '^':
      return left ^ right;
    case '<<': {
      const count = checkShift(right);
      if (count > 0 && bitLength(left) + count > MAX_RESULT_BITS) {
        throw new ExpressionError(`The result is larger than ${MAX_RESULT_BITS} bits. Use a smaller shift.`);
      }
      return left << BigInt(count);
    }
    case '>>':
      return left >> BigInt(checkShift(right));
    case '>>>': {
      // Logical shift: read the left side as an unsigned integer of the selected width, then shift in zeros.
      if (right < 0n) throw new ExpressionError('Use a shift count of 0 or more with >>>.');
      return BigInt.asUintN(width, left) >> BigInt(checkShift(right));
    }
    default:
      throw new ExpressionError(`"${op}" is not a valid operator.`);
  }
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly base: 'auto' | number,
    private readonly width: number,
  ) {}

  parse(): bigint {
    const value = this.expression(1);
    const next = this.peek();
    if (next.kind !== 'end') {
      throw new ExpressionError(next.kind === 'op' && next.text === ')' ? 'Remove the extra ")".' : `Unexpected "${next.text}".`);
    }
    return value;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    return this.tokens[this.index++];
  }

  /** Precedence climbing: read operands joined by operators that bind at least as tight as `minPrecedence`. */
  private expression(minPrecedence: number): bigint {
    let left = this.unary();
    for (;;) {
      const token = this.peek();
      if (token.kind !== 'op') break;
      const precedence = PRECEDENCE[token.text];
      if (precedence === undefined || precedence < minPrecedence) break;
      this.next();
      // "**" is right-associative, so 2 ** 3 ** 2 is 2 ** 9. All other operators are left-associative.
      const right = this.expression(token.text === '**' ? precedence : precedence + 1);
      left = checkSize(applyBinary(token.text, left, right, this.width));
    }
    return left;
  }

  private unary(): bigint {
    const token = this.peek();
    if (token.kind === 'op' && (token.text === '-' || token.text === '+' || token.text === '~')) {
      this.next();
      const operand = this.unary();
      // JavaScript rejects -2 ** 2 because a reader cannot tell if it means (-2) ** 2 or -(2 ** 2).
      const after = this.peek();
      if (after.kind === 'op' && after.text === '**') {
        throw new ExpressionError(`Add parentheses around the "${token.text}" and its operand, or around the "**".`);
      }
      if (token.text === '-') return -operand;
      if (token.text === '~') return ~operand;
      return operand;
    }
    return this.primary();
  }

  private primary(): bigint {
    const token = this.next();
    if (token.kind === 'num') {
      const parsed = parseNumber(token.text, this.base);
      if ('error' in parsed) throw new ExpressionError(parsed.error);
      return checkSize(parsed.value);
    }
    if (token.kind === 'op' && token.text === '(') {
      const value = this.expression(1);
      const close = this.next();
      if (close.kind !== 'op' || close.text !== ')') throw new ExpressionError('Add the missing ")".');
      return value;
    }
    if (token.kind === 'end') throw new ExpressionError('The expression is not complete.');
    throw new ExpressionError(`Unexpected "${token.text}".`);
  }
}

/**
 * Evaluate an integer expression such as `0xff + 0b1010 * 3` or `(1 << 12) - 1`.
 * Operators follow JavaScript precedence. Literals use the same rules as the literal parser.
 */
export function evaluateIntExpression(text: string, options: ExpressionOptions = {}): ExpressionResult {
  const { base = 'auto', width = 32 } = options;
  if (!text.trim()) return { ok: false, error: 'Enter a number.' };
  try {
    return { ok: true, value: new Parser(tokenize(text), base, width).parse() };
  } catch (error) {
    if (error instanceof ExpressionError) return { ok: false, error: error.message };
    throw error;
  }
}

/** True when the text has an operator or parenthesis after an optional leading sign. */
export function looksLikeExpression(text: string): boolean {
  return /[+\-*/%&|^~()<>.]/.test(text.trim().replace(/^[+-]/, ''));
}

export type InputBase = 'auto' | 'roman' | number;

export type ReadResult =
  /** `base` is set only for a literal. */
  | { ok: true; value: bigint; source: 'literal' | 'expression' | 'roman'; base?: number }
  | { ok: false; error: string };

/**
 * Read the converter input. Roman input only comes from the Roman base selector, so "CD" is never ambiguous.
 * Otherwise a plain literal reads as before, and text with operators reads as an expression.
 */
export function readNumberInput(input: string, base: InputBase, width = 32): ReadResult {
  if (base === 'roman') {
    const roman = parseRoman(input);
    return 'error' in roman ? roman : { ok: true, value: roman.value, source: 'roman' };
  }
  const literal = parseNumber(input, base);
  if (!('error' in literal)) return { ok: true, value: literal.value, base: literal.base, source: 'literal' };
  if (!looksLikeExpression(input)) return literal;
  const result = evaluateIntExpression(input, { base, width });
  return 'error' in result ? result : { ok: true, value: result.value, source: 'expression' };
}
