import { describe, expect, it } from 'vitest';
import {
  CVD_TYPES,
  colorDistance,
  cvdLabel,
  cvdMatrix,
  findConfusablePairs,
  getContrastRatio,
  parseColor,
  parseColorList,
  simulateCvd,
  simulateCvdPixels,
} from '@/utils/color';

const c = (text: string) => parseColor(text)!;
const encode = (linear: number) => Math.round((1.055 * Math.pow(linear, 1 / 2.4) - 0.055) * 255);

describe('cvdMatrix', () => {
  it('keeps white white for every type and severity', () => {
    for (const type of CVD_TYPES) {
      for (let step = 0; step <= 10; step++) {
        const m = cvdMatrix(type, step / 10);
        for (let row = 0; row < 3; row++) {
          expect(m[row * 3] + m[row * 3 + 1] + m[row * 3 + 2]).toBeCloseTo(1, 2);
        }
      }
    }
  });

  it('is the identity at severity 0 and interpolates between table rows', () => {
    expect(cvdMatrix('deutan', 0)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const half = cvdMatrix('protan', 0.95)[0];
    expect(half).toBeCloseTo((0.203876 + 0.152286) / 2, 6);
  });

  it('is the identity at severity 0 for every type, including achromatopsia', () => {
    for (const type of CVD_TYPES) {
      expect(cvdMatrix(type, 0)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      expect(simulateCvd(c('#ff0000'), type, 0).hex).toBe('#ff0000');
      expect(simulateCvd(c('#3b82f6'), type, 0).hex).toBe('#3b82f6');
    }
  });
});

describe('simulateCvd', () => {
  it('applies the Machado protanopia matrix in linear RGB', () => {
    // Pure red is linear (1, 0, 0), so the result is the first matrix column, encoded back to sRGB.
    const red = simulateCvd(c('#ff0000'), 'protan');
    expect(red.rgb).toEqual({ r: encode(0.152286), g: encode(0.114503), b: 0 });
    expect(red.hex).toBe('#6d5f00');
  });

  it('keeps grays and alpha', () => {
    for (const type of CVD_TYPES) {
      const gray = simulateCvd(c('rgb(128 128 128 / 0.5)'), type);
      expect(Math.abs(gray.rgb.r - 128)).toBeLessThanOrEqual(1);
      expect(Math.abs(gray.rgb.b - 128)).toBeLessThanOrEqual(1);
      expect(gray.alpha).toBe(0.5);
    }
  });

  it('turns every color gray for achromatopsia and keeps its luminance', () => {
    const sim = simulateCvd(c('#3b82f6'), 'achroma');
    expect(sim.rgb.r).toBe(sim.rgb.g);
    expect(sim.rgb.g).toBe(sim.rgb.b);
    expect(getContrastRatio(sim, c('#ffffff'))).toBeCloseTo(getContrastRatio(c('#3b82f6'), c('#ffffff')), 1);
  });

  it('scales achromatopsia with severity', () => {
    const red = c('#ff0000');
    const half = simulateCvd(red, 'achroma', 0.5);
    expect(half.hex).not.toBe(red.hex);
    expect(half.rgb.r).toBeGreaterThan(half.rgb.g);
    expect(half.rgb.g).toBe(half.rgb.b);
    expect(half.rgb.r).toBeLessThan(red.rgb.r);
  });

  it('makes red and green look alike for deuteranopia but not for tritanopia', () => {
    const red = c('#d32f2f');
    const green = c('#388e3c');
    expect(colorDistance(red, green)).toBeGreaterThan(20);
    expect(colorDistance(simulateCvd(red, 'deutan'), simulateCvd(green, 'deutan'))).toBeLessThan(6);
    expect(colorDistance(simulateCvd(red, 'tritan'), simulateCvd(green, 'tritan'))).toBeGreaterThan(20);
  });
});

describe('cvdLabel', () => {
  it('names the full and the partial forms', () => {
    expect(cvdLabel('protan')).toBe('Protanopia');
    expect(cvdLabel('deutan', 1)).toBe('Deuteranopia');
    expect(cvdLabel('tritan', 0.6)).toBe('Tritanomaly');
    expect(cvdLabel('deutan', 0.5)).toBe('Deuteranomaly');
    expect(cvdLabel('achroma', 0.5)).toBe('Achromatopsia');
  });
});

describe('simulateCvdPixels', () => {
  it('matches the per-color simulation and keeps alpha', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 200, 59, 130, 246, 255]);
    simulateCvdPixels(data, 'deutan', 0.7);
    const red = simulateCvd(c('#ff0000'), 'deutan', 0.7).rgb;
    const blue = simulateCvd(c('#3b82f6'), 'deutan', 0.7).rgb;
    expect(Math.abs(data[0] - red.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(data[1] - red.g)).toBeLessThanOrEqual(1);
    expect(data[3]).toBe(200);
    expect(Math.abs(data[6] - blue.b)).toBeLessThanOrEqual(1);
  });

  it('changes only the pixels in the given range', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]);
    simulateCvdPixels(data, 'protan', 1, 1, 2);
    expect(Array.from(data.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(data[4]).not.toBe(255);
  });
});

describe('findConfusablePairs', () => {
  it('lists close pairs, closest first', () => {
    const colors = [c('#ff0000'), c('#0000ff'), c('#fe0101'), c('#fd0000')];
    const pairs = findConfusablePairs(colors);
    expect(pairs.map((p) => `${p.a}-${p.b}`).sort()).toEqual(['0-2', '0-3', '2-3']);
    expect(pairs.every((p) => p.distance < 6)).toBe(true);
    expect(pairs.map((p) => p.distance)).toEqual([...pairs.map((p) => p.distance)].sort((x, y) => x - y));
  });
});

describe('parseColorList', () => {
  it('splits on commas, spaces, and new lines outside parentheses', () => {
    const { colors, invalid } = parseColorList('#f00, rgb(0, 128, 0)\nhsl(240 100% 50%) tomato; nope');
    expect(colors.map((x) => x.color.hex)).toEqual(['#ff0000', '#008000', '#0000ff', '#ff6347']);
    expect(invalid).toEqual(['nope']);
  });
});
