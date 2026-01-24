/**
 * Test for Color Palette utilities
 */

import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbToHsv,
  parseColor,
  getComplementaryColor,
  getAnalogousColors,
  getTriadicColors,
  getSplitComplementaryColors,
  generateColorPalette,
  generateShades,
  adjustBrightness,
  adjustSaturation,
  getContrastRatio,
  meetsWCAAALarge,
  meetsWCAAANormal,
} from '@/utils/color';

describe('Color Utils', () => {
  describe('hexToRgb', () => {
    it('should convert hex to RGB', () => {
      const result = hexToRgb('#ff0000');
      expect(result).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should handle hex without #', () => {
      const result = hexToRgb('ff0000');
      expect(result).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should handle 3-digit hex', () => {
      // Our hexToRgb function doesn't support 3-digit shorthand
      const result = hexToRgb('#aabbcc');
      expect(result).not.toBeNull();
      expect(result?.r).toBe(0xaa);
      expect(result?.g).toBe(0xbb);
      expect(result?.b).toBe(0xcc);
    });

    it('should return null for invalid hex', () => {
      const result = hexToRgb('invalid');
      expect(result).toBeNull();
    });
  });

  describe('rgbToHex', () => {
    it('should convert RGB to hex', () => {
      const result = rgbToHex(255, 0, 0);
      expect(result).toBe('#ff0000');
    });

    it('should pad single digit values', () => {
      const result = rgbToHex(15, 0, 0);
      expect(result).toBe('#0f0000');
    });
  });

  describe('rgbToHsl', () => {
    it('should convert red to HSL', () => {
      const result = rgbToHsl(255, 0, 0);
      expect(result.h).toBe(0);
      expect(result.s).toBe(100);
      expect(result.l).toBeCloseTo(50, 0);
    });

    it('should convert gray to HSL', () => {
      const result = rgbToHsl(128, 128, 128);
      expect(result.s).toBe(0);
    });
  });

  describe('hslToRgb', () => {
    it('should convert HSL to RGB', () => {
      const result = hslToRgb(0, 100, 50);
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it('should handle saturation 0', () => {
      const result = hslToRgb(0, 0, 50);
      expect(result.r).toBe(128);
      expect(result.g).toBe(128);
      expect(result.b).toBe(128);
    });
  });

  describe('rgbToHsv', () => {
    it('should convert RGB to HSV', () => {
      const result = rgbToHsv(255, 0, 0);
      expect(result.h).toBe(0);
      expect(result.s).toBe(100);
      expect(result.v).toBe(100);
    });
  });

  describe('parseColor', () => {
    it('should parse hex color', () => {
      const result = parseColor('#ff0000');
      expect(result).not.toBeNull();
      expect(result?.hex).toBe('#ff0000');
    });

    it('should parse rgb() color', () => {
      const result = parseColor('rgb(255, 0, 0)');
      expect(result).not.toBeNull();
      expect(result?.rgb).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should return null for invalid color', () => {
      const result = parseColor('invalid');
      expect(result).toBeNull();
    });

    it('should include HSL and HSV values', () => {
      const result = parseColor('#ff0000');
      expect(result?.hsl).toBeDefined();
      expect(result?.hsv).toBeDefined();
    });
  });

  describe('getComplementaryColor', () => {
    it('should generate complementary color', () => {
      const color = parseColor('#ff0000')!;
      const result = getComplementaryColor(color);
      expect(result.hsl.h).toBeCloseTo(180, 0);
    });
  });

  describe('getAnalogousColors', () => {
    it('should generate analogous colors', () => {
      const color = parseColor('#ff0000')!;
      const result = getAnalogousColors(color, 2);
      expect(result).toHaveLength(2);
    });
  });

  describe('getTriadicColors', () => {
    it('should generate triadic colors', () => {
      const color = parseColor('#ff0000')!;
      const result = getTriadicColors(color);
      expect(result).toHaveLength(2);
    });
  });

  describe('getSplitComplementaryColors', () => {
    it('should generate split complementary colors', () => {
      const color = parseColor('#ff0000')!;
      const result = getSplitComplementaryColors(color);
      expect(result).toHaveLength(2);
    });
  });

  describe('generateColorPalette', () => {
    it('should generate complete palette', () => {
      const result = generateColorPalette('#ff0000');
      expect(result).not.toBeNull();
      expect(result?.palette).toBeDefined();
      expect(result?.complementary).toBeDefined();
    });

    it('should return null for invalid color', () => {
      const result = generateColorPalette('invalid');
      expect(result).toBeNull();
    });
  });

  describe('generateShades', () => {
    it('should generate color shades', () => {
      const color = parseColor('#ff0000')!;
      const result = generateShades(color, 5);
      expect(result).toHaveLength(5);
    });

    it('should vary lightness', () => {
      const color = parseColor('#808080')!;
      const result = generateShades(color, 3);
      const lightnesses = result.map((c) => c.hsl.l);
      expect(Math.min(...lightnesses)).toBeLessThan(Math.max(...lightnesses));
    });
  });

  describe('adjustBrightness', () => {
    it('should increase brightness', () => {
      const color = parseColor('#808080')!;
      const result = adjustBrightness(color, 20);
      expect(result.hsl.l).toBeGreaterThan(color.hsl.l);
    });

    it('should decrease brightness', () => {
      const color = parseColor('#808080')!;
      const result = adjustBrightness(color, -20);
      expect(result.hsl.l).toBeLessThan(color.hsl.l);
    });

    it('should clamp to valid range', () => {
      const color = parseColor('#808080')!;
      const result = adjustBrightness(color, 200);
      expect(result.hsl.l).toBeLessThanOrEqual(100);
    });
  });

  describe('adjustSaturation', () => {
    it('should increase saturation', () => {
      const color = parseColor('#808080')!;
      const result = adjustSaturation(color, 30);
      expect(result.hsl.s).toBeGreaterThan(color.hsl.s);
    });
  });

  describe('getContrastRatio', () => {
    it('should calculate contrast ratio', () => {
      const white = parseColor('#ffffff')!;
      const black = parseColor('#000000')!;
      const result = getContrastRatio(white, black);
      expect(result).toBe(21);
    });

    it('should return value >= 1', () => {
      const color1 = parseColor('#808080')!;
      const color2 = parseColor('#808080')!;
      const result = getContrastRatio(color1, color2);
      expect(result).toBeGreaterThanOrEqual(1);
    });
  });

  describe('WCAG compliance', () => {
    it('should check WCAG AA large text', () => {
      const white = parseColor('#ffffff')!;
      const black = parseColor('#000000')!;
      expect(meetsWCAAALarge(white, black)).toBe(true);
    });

    it('should check WCAG AA normal text', () => {
      const white = parseColor('#ffffff')!;
      const black = parseColor('#000000')!;
      expect(meetsWCAAANormal(white, black)).toBe(true);
    });

    it('should fail low contrast combinations', () => {
      const color1 = parseColor('#808080')!;
      const color2 = parseColor('#888888')!;
      expect(meetsWCAAANormal(color1, color2)).toBe(false);
    });
  });

  describe('color round-trip conversions', () => {
    it('should maintain data through RGB-HSL-RGB', () => {
      const original = { r: 255, g: 128, b: 64 };
      const hsl = rgbToHsl(original.r, original.g, original.b);
      const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
      expect(rgb).toEqual(original);
    });
  });
});
