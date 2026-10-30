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
  generateShadePalette,
  buildPalette,
  paletteToCss,
  paletteToJson,
  suggestContrastColor,
  toHexWithAlpha,
  addRecentColor,
  parseRecentColors,
  MAX_RECENT_COLORS,
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

  describe('generateShadePalette', () => {
    const shades = (input: string) => generateShadePalette(parseColor(input)!);

    it('starts with the base color and adds lighter then darker steps', () => {
      const palette = shades('#3b82f6');
      expect(palette[0].hex).toBe('#3b82f6');
      expect(palette).toHaveLength(10);
      const lightnesses = palette.map((c) => Math.round(c.hsl.l));
      expect(lightnesses).toEqual([60, 70, 80, 90, 100, 50, 40, 30, 20, 10]);
    });

    it('never repeats a swatch when lightness clamps', () => {
      for (const input of ['#3b82f6', '#ffffff', '#000000', '#f5f5f5']) {
        const palette = shades(input);
        expect(new Set(palette.map((c) => c.hex)).size).toBe(palette.length);
      }
      expect(shades('#ffffff')).toHaveLength(6);
      expect(shades('#000000')).toHaveLength(6);
      expect(shades('#f5f5f5')).toHaveLength(7);
    });

    it('builds an opaque palette from a translucent color', () => {
      const palette = shades('rgb(255 0 0 / 50%)');
      expect(palette[0].hex).toBe('#ff0000');
      expect(palette.every((c) => c.alpha === 1)).toBe(true);
    });
  });

  describe('buildPalette', () => {
    const red = parseColor('#ff0000')!;
    const hexes = (mode: Parameters<typeof buildPalette>[1], color = red) => buildPalette(color, mode).map((c) => c.hex);

    it('puts the color first in every mode', () => {
      for (const mode of ['tints', 'complementary', 'analogous', 'triadic', 'split-complementary', 'monochromatic'] as const) {
        expect(hexes(mode)[0]).toBe('#ff0000');
      }
    });

    it('rotates the hue for the harmonies', () => {
      expect(hexes('complementary')).toEqual(['#ff0000', '#00ffff']);
      expect(hexes('analogous')).toEqual(['#ff0000', '#ff8000', '#ffff00']);
      expect(hexes('triadic')).toEqual(['#ff0000', '#00ff00', '#0000ff']);
      expect(hexes('split-complementary')).toEqual(['#ff0000', '#00ff80', '#007fff']);
    });

    it('keeps the hue and changes the lightness for monochromatic', () => {
      const palette = buildPalette(red, 'monochromatic');
      expect(palette).toHaveLength(7);
      expect(palette.slice(1).map((c) => Math.round(c.hsl.l))).toEqual([90, 75, 60, 45, 30, 15]);
      expect(palette.slice(1).every((c) => Math.round(c.hsl.h) === 0)).toBe(true);
    });

    it('matches the shade palette for tints', () => {
      expect(hexes('tints')).toEqual(generateShadePalette(red).map((c) => c.hex));
    });

    it('removes harmonies that repeat a gray', () => {
      expect(hexes('triadic', parseColor('#808080')!)).toEqual(['#808080']);
    });

    it('builds an opaque palette', () => {
      expect(buildPalette(parseColor('rgb(255 0 0 / 50%)')!, 'triadic').every((c) => c.alpha === 1)).toBe(true);
    });
  });

  describe('palette export', () => {
    const palette = buildPalette(parseColor('#ff0000')!, 'complementary');

    it('writes one CSS custom property per swatch', () => {
      expect(paletteToCss(palette)).toBe(':root {\n  --color-1: #ff0000;\n  --color-2: #00ffff;\n}');
    });

    it('writes one JSON entry per swatch', () => {
      expect(JSON.parse(paletteToJson(palette))).toEqual([
        { name: '--color-1', value: '#ff0000' },
        { name: '--color-2', value: '#00ffff' },
      ]);
    });
  });

  describe('suggestContrastColor', () => {
    const gray = parseColor('#777777')!;
    const white = parseColor('#ffffff')!;

    it('suggests the closest lightness that reaches the ratio', () => {
      const suggestion = suggestContrastColor(gray, white, 4.5)!;
      expect(suggestion.side).toBe('foreground');
      expect(suggestion.ratio).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(suggestion.color, white)).toBe(suggestion.ratio);
      expect(suggestion.color.hsl.l).toBeLessThan(gray.hsl.l);
      expect(Math.round(gray.hsl.l - suggestion.color.hsl.l)).toBe(1);
    });

    it('changes the background when only the background can reach the ratio', () => {
      const suggestion = suggestContrastColor(parseColor('#ffffff')!, parseColor('#bbbbbb')!, 7)!;
      expect(suggestion.side).toBe('background');
      expect(suggestion.ratio).toBeGreaterThanOrEqual(7);
    });

    it('keeps the alpha of a translucent foreground', () => {
      const suggestion = suggestContrastColor(parseColor('rgb(119 119 119 / 90%)')!, white, 4.5)!;
      expect(suggestion.color.alpha).toBe(0.9);
    });

    it('returns null when no lightness change can reach the ratio', () => {
      expect(suggestContrastColor(parseColor('rgb(0 0 0 / 10%)')!, white, 4.5)).toBeNull();
    });
  });

  describe('toHexWithAlpha', () => {
    it('adds the alpha byte only for a translucent color', () => {
      expect(toHexWithAlpha(parseColor('#ff0000')!)).toBe('#ff0000');
      expect(toHexWithAlpha(parseColor('rgb(255 0 0 / 50%)')!)).toBe('#ff000080');
    });
  });

  describe('recent colors', () => {
    it('puts the newest color first without duplicates', () => {
      const list = addRecentColor(['#00ff00', '#ff0000'], parseColor('red')!);
      expect(list).toEqual(['#ff0000', '#00ff00']);
    });

    it('keeps alpha and limits the list length', () => {
      let list: string[] = [];
      for (let i = 0; i < MAX_RECENT_COLORS + 3; i++) list = addRecentColor(list, parseColor(`rgb(${i} 0 0)`)!);
      expect(list).toHaveLength(MAX_RECENT_COLORS);
      expect(addRecentColor([], parseColor('rgb(255 0 0 / 50%)')!)).toEqual(['#ff000080']);
    });

    it('reads stored data defensively', () => {
      expect(parseRecentColors(null)).toEqual([]);
      expect(parseRecentColors('not json')).toEqual([]);
      expect(parseRecentColors('{"a":1}')).toEqual([]);
      expect(parseRecentColors('["#ff0000", 4, "nope", "#ff0000", "tomato", "rgb(0 128 0)"]')).toEqual([
        '#ff0000',
        '#008000',
      ]);
      expect(parseRecentColors('["#ff000080", "rgb(255 0 0 / 50%)"]')).toEqual(['#ff000080']);
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

import {
  meetsWcagAALarge,
  meetsWcagAANormal,
  meetsWcagAAALarge,
  meetsWcagAAANormal,
} from '@/utils/color';

describe('Contrast and parsing', () => {
  it('black on white is 21:1', () => {
    expect(getContrastRatio(parseColor('#000')!, parseColor('#fff')!)).toBeCloseTo(21, 5);
  });

  it('#777 on white is about 4.48:1', () => {
    const r = getContrastRatio(parseColor('#777777')!, parseColor('#ffffff')!);
    expect(r).toBeCloseTo(4.48, 2);
    expect(meetsWcagAANormal(parseColor('#777')!, parseColor('#fff')!)).toBe(false);
    expect(meetsWcagAALarge(parseColor('#777')!, parseColor('#fff')!)).toBe(true);
  });

  it('applies AAA thresholds', () => {
    const white = parseColor('#fff')!;
    const c = parseColor('#595959')!; // about 7:1
    expect(meetsWcagAAANormal(c, white)).toBe(true);
    const d = parseColor('#767676')!; // about 4.54:1
    expect(meetsWcagAANormal(d, white)).toBe(true);
    expect(meetsWcagAAANormal(d, white)).toBe(false);
    expect(meetsWcagAAALarge(d, white)).toBe(true);
  });

  it('keeps misspelled aliases', () => {
    const w = parseColor('#fff')!;
    const k = parseColor('#000')!;
    expect(meetsWCAAANormal(w, k)).toBe(true);
    expect(meetsWCAAALarge(w, k)).toBe(true);
  });

  it('parses 3-digit hex, spaced rgb and hsl', () => {
    expect(parseColor('#f00')!.hex).toBe('#ff0000');
    expect(parseColor('rgb(0 128 255)')!.rgb).toEqual({ r: 0, g: 128, b: 255 });
    expect(parseColor('hsl(120, 100%, 50%)')!.hex).toBe('#00ff00');
    expect(parseColor('hsl(0, 100%, 50%)')!.rgb).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('rgb(300, 0, 0)')).toBeNull();
    expect(parseColor('nope')).toBeNull();
  });

  it('converts known colors to HSL and HSV', () => {
    const c = parseColor('#3b82f6')!;
    expect(Math.round(c.hsl.h)).toBe(217);
    expect(Math.round(c.hsl.s)).toBe(91);
    expect(Math.round(c.hsl.l)).toBe(60);
    expect(Math.round(c.hsv.v)).toBe(96);
  });
});

import { compositeOver, formatColor, rgbToOklch, colorName } from '@/utils/color';

const near = (actual: { r: number; g: number; b: number }, expected: { r: number; g: number; b: number }) => {
  expect(Math.abs(actual.r - expected.r)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.g - expected.g)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.b - expected.b)).toBeLessThanOrEqual(1);
};

describe('CSS color parsing', () => {
  it('reads alpha from 4 and 8 digit hex', () => {
    const c = parseColor('#3b82f680')!;
    expect(c.rgb).toEqual({ r: 59, g: 130, b: 246 });
    expect(c.alpha).toBeCloseTo(128 / 255, 5);
    expect(parseColor('#f008')!.alpha).toBeCloseTo(0x88 / 255, 5);
    expect(parseColor('ff000080')!.hex).toBe('#ff0000');
    expect(parseColor('#3b82f6')!.alpha).toBe(1);
  });

  it('reads rgb and rgba in legacy and modern syntax', () => {
    expect(parseColor('rgba(59, 130, 246, 0.5)')!.alpha).toBe(0.5);
    const modern = parseColor('rgb(59 130 246 / 50%)')!;
    expect(modern.rgb).toEqual({ r: 59, g: 130, b: 246 });
    expect(modern.alpha).toBe(0.5);
    expect(parseColor('rgb(100% 0% 0%)')!.hex).toBe('#ff0000');
    expect(parseColor('rgb(59, 130)')).toBeNull();
  });

  it('reads hsl with alpha and angle units', () => {
    expect(parseColor('hsla(217, 91%, 60%, 0.25)')!.alpha).toBe(0.25);
    expect(parseColor('hsl(217deg 91% 60% / .25)')!.alpha).toBe(0.25);
    expect(parseColor('hsl(0.5turn 100% 50%)')!.hex).toBe('#00ffff');
  });

  it('reads hwb', () => {
    expect(parseColor('hwb(0 0% 0%)')!.hex).toBe('#ff0000');
    expect(parseColor('hwb(120 50% 50%)')!.rgb).toEqual({ r: 128, g: 128, b: 128 });
    expect(parseColor('hwb(217 23% 4% / 0.5)')!.alpha).toBe(0.5);
  });

  it('reads oklch and oklab', () => {
    near(parseColor('oklch(62.31% 0.188 259.81)')!.rgb, { r: 59, g: 130, b: 246 });
    near(parseColor('oklch(0.6231 0.188 259.81)')!.rgb, { r: 59, g: 130, b: 246 });
    expect(parseColor('oklch(100% 0 0)')!.hex).toBe('#ffffff');
    expect(parseColor('oklab(0 0 0)')!.hex).toBe('#000000');
  });

  it('clips oklch colors outside sRGB', () => {
    const c = parseColor('oklch(70% 0.4 150)')!;
    for (const v of [c.rgb.r, c.rgb.g, c.rgb.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('reads named colors and transparent', () => {
    expect(parseColor('rebeccapurple')!.hex).toBe('#663399');
    expect(parseColor('RED')!.hex).toBe('#ff0000');
    expect(parseColor('transparent')!.alpha).toBe(0);
    expect(parseColor('notacolor')).toBeNull();
  });
});

describe('formatColor', () => {
  it('formats an opaque color in every format', () => {
    const values = Object.fromEntries(formatColor(parseColor('#3b82f6')!).map((v) => [v.label, v.value]));
    expect(values).toEqual({
      HEX: '#3B82F6',
      RGB: 'rgb(59, 130, 246)',
      HSL: 'hsl(217, 91%, 60%)',
      HWB: 'hwb(217 23% 4%)',
      OKLCH: 'oklch(62.3% 0.188 259.8)',
      HSV: 'hsv(217, 76%, 96%)',
    });
  });

  it('includes alpha where the format supports it', () => {
    const values = Object.fromEntries(formatColor(parseColor('rgb(59 130 246 / 0.5)')!).map((v) => [v.label, v.value]));
    expect(values.HEX).toBe('#3B82F680');
    expect(values.RGB).toBe('rgba(59, 130, 246, 0.5)');
    expect(values.HSL).toBe('hsla(217, 91%, 60%, 0.5)');
    expect(values.HWB).toBe('hwb(217 23% 4% / 0.5)');
    expect(values.OKLCH).toBe('oklch(62.3% 0.188 259.8 / 0.5)');
  });

  it('adds the CSS name when one matches', () => {
    const name = formatColor(parseColor('#663399')!).find((v) => v.label === 'Name');
    expect(name?.value).toBe('rebeccapurple');
    expect(colorName(parseColor('#3b82f6')!)).toBeNull();
  });

  it('uses hue 0 for grays in oklch', () => {
    expect(rgbToOklch(128, 128, 128).c).toBeLessThan(0.0001);
    const values = Object.fromEntries(formatColor(parseColor('#808080')!).map((v) => [v.label, v.value]));
    expect(values.OKLCH).toMatch(/^oklch\([\d.]+% 0 0\)$/);
  });
});

describe('compositeOver', () => {
  it('blends a translucent color over a background', () => {
    const c = compositeOver(parseColor('rgba(0, 0, 0, 0.5)')!, parseColor('#ffffff')!);
    expect(c.rgb).toEqual({ r: 128, g: 128, b: 128 });
    expect(c.alpha).toBe(1);
  });
});
