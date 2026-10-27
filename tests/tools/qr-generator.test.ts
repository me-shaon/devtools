/**
 * Test for QR Generator utilities
 */

import { describe, it, expect } from 'vitest';
import {
  generateQrCode,
  validateQrData,
  getOptimalErrorCorrectionLevel,
  generateQrCodeVariants,
  getQrCapacity,
  calculateQrVersion,
  getRecommendedQrSize,
  encodeQr,
  getLogoBox,
  buildQrSvg,
} from '@/utils/qr';
import { decodeQrPixels } from '@/utils/qr-reader';

describe('encodeQr', () => {
  it('uses level M by default', () => {
    const result = encodeQr('https://example.com', 'auto', false);
    expect(result.level).toBe('M');
    expect(result.matrix.length).toBe(result.version * 4 + 17);
  });

  it('uses level H when the code has a logo', () => {
    expect(encodeQr('https://example.com', 'auto', true).level).toBe('H');
  });

  it('drops to a lower level when the content does not fit at the default', () => {
    // 2500 bytes fit at level L (2953) but not at M (2331).
    expect(encodeQr('a'.repeat(2500), 'auto', false).level).toBe('L');
    // 1500 bytes fit at level Q (1663) but not at H (1273).
    expect(encodeQr('a'.repeat(1500), 'auto', true).level).toBe('Q');
  });

  it('uses the level the user chose', () => {
    expect(encodeQr('hello', 'Q', false).level).toBe('Q');
    expect(encodeQr('hello', 'L', true).level).toBe('L');
  });

  it('throws when the content does not fit', () => {
    expect(() => encodeQr('a'.repeat(3000), 'auto', false)).toThrow();
    expect(() => encodeQr('a'.repeat(2500), 'H', false)).toThrow();
  });
});

describe('getLogoBox', () => {
  it('covers a centered, odd-sized square of about a fifth of the width', () => {
    expect(getLogoBox(21)).toEqual({ start: 8, size: 5 });
    expect(getLogoBox(25)).toEqual({ start: 10, size: 5 });
    const box = getLogoBox(57);
    expect(box.size % 2).toBe(1);
    expect(box.start * 2 + box.size).toBe(57);
    expect(box.size / 57).toBeLessThanOrEqual(0.23);
  });
});

describe('logo scannability', () => {
  // Renders the code at 4 px a module and fills the logo box the way a logo would.
  const render = (matrix: boolean[][], fillLogo: (x: number, y: number) => boolean) => {
    const scale = 4;
    const total = matrix.length + 8;
    const width = total * scale;
    const data = new Uint8ClampedArray(width * width * 4).fill(255);
    const box = getLogoBox(matrix.length);
    const inBox = (v: number) => v >= box.start && v < box.start + box.size;
    for (let py = 0; py < width; py++) {
      for (let px = 0; px < width; px++) {
        const x = Math.floor(px / scale) - 4;
        const y = Math.floor(py / scale) - 4;
        const inside = x >= 0 && y >= 0 && x < matrix.length && y < matrix.length;
        const dark = inside && (inBox(x) && inBox(y) ? fillLogo(px, py) : matrix[y][x]);
        if (dark) data.fill(0, (py * width + px) * 4, (py * width + px) * 4 + 3);
      }
    }
    return { data, width, height: width };
  };

  const payloads = [
    'https://example.com',
    'WIFI:T:WPA;S:Office Guest;P:correct horse battery staple;;',
    'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lovelace;Ada;;;\r\nFN:Ada Lovelace\r\nORG:Analytical Engines\r\nTEL;TYPE=CELL:+44 20 7946 0000\r\nEMAIL:ada@example.com\r\nURL:https://example.com/ada\r\nEND:VCARD',
  ];

  it.each(payloads)('decodes at level H with a noisy logo: %s', (payload) => {
    const { matrix } = encodeQr(payload, 'auto', true);
    // A dense, high-contrast pattern is the worst case for a logo.
    const pixels = render(matrix, (x, y) => ((x * 7 + y * 13) % 5) < 2);
    expect(decodeQrPixels(pixels)?.text).toBe(payload);
  });
});

describe('buildQrSvg', () => {
  const matrix = encodeQr('hello', 'auto', false).matrix;

  it('draws the modules as one path in module units, with a quiet zone', () => {
    const svg = buildQrSvg(matrix, { size: 400 });
    const total = matrix.length + 8;
    expect(svg).toContain(`viewBox="0 0 ${total} ${total}"`);
    expect(svg).toContain('width="400"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg.match(/<path/g)).toHaveLength(1);
    expect(svg).not.toContain('<image');
  });

  it('clears the center and embeds the logo', () => {
    const svg = buildQrSvg(matrix, { size: 400, logo: 'data:image/png;base64,AAAA' });
    const { start, size } = getLogoBox(matrix.length);
    expect(svg).toContain(`<rect x="${start + 4}" y="${start + 4}" width="${size}" height="${size}" fill="#ffffff"/>`);
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
  });

  it('escapes the logo URL', () => {
    const svg = buildQrSvg(matrix, { size: 400, logo: 'data:image/svg+xml,<svg a="1">&' });
    expect(svg).toContain('href="data:image/svg+xml,&lt;svg a=&quot;1&quot;&gt;&amp;"');
  });
});

describe('QR Utils', () => {
  describe('generateQrCode', () => {
    it('should generate QR code data URL', () => {
      const result = generateQrCode('Hello World');
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should use default size', () => {
      const result = generateQrCode('test');
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
      const decoded = atob(result.split(',')[1]);
      expect(decoded).toContain('width="300"');
      expect(decoded).toContain('height="300"');
    });

    it('should use custom size', () => {
      const result = generateQrCode('test', { size: 500 });
      const decoded = atob(result.split(',')[1]);
      expect(decoded).toContain('width="500"');
    });

    it('should use custom colors', () => {
      const result = generateQrCode('test', {
        color: { dark: '#ff0000', light: '#00ff00' },
      });
      const decoded = atob(result.split(',')[1]);
      expect(decoded).toContain('#ff0000');
    });

    it('should generate different patterns for different data', () => {
      const qr1 = generateQrCode('test1');
      const qr2 = generateQrCode('test2');
      expect(qr1).not.toBe(qr2);
    });

    it('should generate same pattern for same data', () => {
      const qr1 = generateQrCode('test');
      const qr2 = generateQrCode('test');
      expect(qr1).toBe(qr2);
    });
  });

  describe('validateQrData', () => {
    it('should accept valid data', () => {
      const result = validateQrData('Hello World');
      expect(result.valid).toBe(true);
    });

    it('should reject empty data', () => {
      const result = validateQrData('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject too long data', () => {
      const longData = 'a'.repeat(3000);
      const result = validateQrData(longData);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should handle unicode', () => {
      const result = validateQrData('Hello 世界');
      expect(result.valid).toBe(true);
    });
  });

  describe('getOptimalErrorCorrectionLevel', () => {
    it('should return L for short data', () => {
      const result = getOptimalErrorCorrectionLevel(25);
      expect(result).toBe('L');
    });

    it('should return M for medium data', () => {
      const result = getOptimalErrorCorrectionLevel(75);
      expect(result).toBe('M');
    });

    it('should return Q for longer data', () => {
      const result = getOptimalErrorCorrectionLevel(125);
      expect(result).toBe('Q');
    });

    it('should return H for very long data', () => {
      const result = getOptimalErrorCorrectionLevel(200);
      expect(result).toBe('H');
    });
  });

  describe('generateQrCodeVariants', () => {
    it('should generate all error correction levels', () => {
      const result = generateQrCodeVariants('test');
      expect(result.L).toBeDefined();
      expect(result.M).toBeDefined();
      expect(result.Q).toBeDefined();
      expect(result.H).toBeDefined();
    });

    it('should use custom size', () => {
      const result = generateQrCodeVariants('test', 500);
      Object.values(result).forEach((qr) => {
        const decoded = atob(qr.split(',')[1]);
        expect(decoded).toContain('width="500"');
      });
    });
  });

  describe('getQrCapacity', () => {
    it('should return capacity for version 1', () => {
      const capacity = getQrCapacity(1, 'L');
      expect(capacity).toBe(41);
    });

    it('should return lower capacity for higher error correction', () => {
      const lCapacity = getQrCapacity(1, 'L');
      const hCapacity = getQrCapacity(1, 'H');
      expect(lCapacity).toBeGreaterThan(hCapacity);
    });

    it('should increase capacity with version', () => {
      const v1Capacity = getQrCapacity(1, 'L');
      const v5Capacity = getQrCapacity(5, 'L');
      expect(v5Capacity).toBeGreaterThan(v1Capacity);
    });
  });

  describe('calculateQrVersion', () => {
    it('should return version 1 for small data', () => {
      const version = calculateQrVersion(10, 'L');
      expect(version).toBe(1);
    });

    it('should return higher version for larger data', () => {
      const version = calculateQrVersion(400, 'L');
      expect(version).toBeGreaterThan(1);
    });

    it('should account for error correction', () => {
      const lVersion = calculateQrVersion(100, 'L');
      const hVersion = calculateQrVersion(100, 'H');
      expect(hVersion).toBeGreaterThanOrEqual(lVersion);
    });
  });

  describe('getRecommendedQrSize', () => {
    it('should return small size for short data', () => {
      const size = getRecommendedQrSize(25);
      expect(size).toBe(200);
    });

    it('should return larger size for longer data', () => {
      const size = getRecommendedQrSize(300);
      expect(size).toBe(400);
    });

    it('should return max size for very long data', () => {
      const size = getRecommendedQrSize(1000);
      expect(size).toBe(500);
    });
  });

  describe('edge cases', () => {
    it('should handle special characters', () => {
      const result = generateQrCode('test@example.com');
      expect(result).toBeDefined();
    });

    it('should handle very short data', () => {
      const result = generateQrCode('a');
      expect(result).toBeDefined();
    });

    it('should handle URL data', () => {
      const result = generateQrCode('https://example.com/path?query=value');
      expect(result).toBeDefined();
    });

    it('should handle newlines', () => {
      const result = generateQrCode('Line 1\nLine 2');
      expect(result).toBeDefined();
    });
  });
});
