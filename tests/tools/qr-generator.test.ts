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
} from '@/utils/qr';

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
