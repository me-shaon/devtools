/**
 * QR Generator utility functions
 */

import QRCode from 'qrcode';

export interface QrOptions {
  size?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

/**
 * Encode data as a QR code and return its modules. `true` is a dark module.
 * Throws when the data does not fit in a QR code.
 */
export function getQrMatrix(data: string, errorCorrectionLevel: QrErrorCorrectionLevel = 'M'): boolean[][] {
  const { modules } = QRCode.create(data, { errorCorrectionLevel });
  return Array.from({ length: modules.size }, (_, row) =>
    Array.from({ length: modules.size }, (_, col) => Boolean(modules.get(row, col))),
  );
}

/**
 * Generate QR code as an SVG data URL
 */
export function generateQrCode(data: string, options: QrOptions = {}): string {
  const {
    size = 300,
    margin = 4,
    color = { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel = 'M',
  } = options;

  const svg = buildQrSvgString(getQrMatrix(data, errorCorrectionLevel), size, margin, {
    dark: color.dark ?? '#000000',
    light: color.light ?? '#ffffff',
  });
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Generate QR code as SVG string
 */
export function generateQrSvg(
  data: string,
  size: number = 300,
  margin: number = 4
): string {
  return buildQrSvgString(getQrMatrix(data), size, margin, { dark: '#000000', light: '#ffffff' });
}

/**
 * Build QR code SVG string. `margin` is the quiet zone in modules; scanners need at least 4.
 */
function buildQrSvgString(
  pattern: boolean[][],
  size: number,
  margin: number,
  color: { dark: string; light: string }
): string {
  const qrSize = pattern.length;
  const moduleSize = size / (qrSize + margin * 2);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  svg += `<rect width="100%" height="100%" fill="${color.light}"/>`;

  for (let i = 0; i < qrSize; i++) {
    for (let j = 0; j < qrSize; j++) {
      if (pattern[i][j]) {
        const x = (margin + j) * moduleSize;
        const y = (margin + i) * moduleSize;
        svg += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="${color.dark}"/>`;
      }
    }
  }

  svg += '</svg>';
  return svg;
}

/**
 * Generate QR code with logo
 */
export function generateQrWithLogo(
  data: string,
  logoUrl: string,
  options: QrOptions = {}
): string {
  const { size = 300 } = options;
  const qrSvg = generateQrCode(data, { size, margin: options.margin || 4 });

  // Add logo in center (simplified - just returns QR without logo for now)
  return qrSvg;
}

/**
 * Validate QR code data
 */
export function validateQrData(data: string): { valid: boolean; error?: string } {
  if (!data) {
    return { valid: false, error: 'Data cannot be empty' };
  }

  // Check length limit for QR codes
  if (data.length > 2953) {
    return { valid: false, error: 'Data too long for QR code (max 2953 bytes)' };
  }

  return { valid: true };
}

/**
 * Get optimal error correction level based on data length
 */
export function getOptimalErrorCorrectionLevel(dataLength: number): 'L' | 'M' | 'Q' | 'H' {
  if (dataLength < 50) return 'L';
  if (dataLength < 100) return 'M';
  if (dataLength < 150) return 'Q';
  return 'H';
}

/**
 * Generate multiple QR codes with different error correction levels
 */
export function generateQrCodeVariants(data: string, size: number = 300): Record<
  string,
  string
> {
  const levels: Array<'L' | 'M' | 'Q' | 'H'> = ['L', 'M', 'Q', 'H'];

  const variants: Record<string, string> = {};
  for (const level of levels) {
    variants[level] = generateQrCode(data, { size, errorCorrectionLevel: level });
  }

  return variants;
}

/**
 * Get QR code capacity by version
 */
export function getQrCapacity(version: number = 1, errorLevel: 'L' | 'M' | 'Q' | 'H' = 'L'): number {
  // Simplified capacity lookup
  const capacities: Record<string, number[]> = {
    L: [41, 77, 127, 187, 255, 322, 370, 461, 552, 642],
    M: [34, 63, 101, 149, 202, 255, 293, 365, 432, 513],
    Q: [27, 48, 77, 111, 150, 189, 221, 274, 324, 383],
    H: [17, 34, 58, 82, 106, 139, 154, 192, 230, 271],
  };

  const index = Math.min(version - 1, 9);
  return capacities[errorLevel]?.[index] || 41;
}

/**
 * Calculate QR code version for data length
 */
export function calculateQrVersion(dataLength: number, errorLevel: 'L' | 'M' | 'Q' | 'H' = 'M'): number {
  for (let version = 1; version <= 10; version++) {
    if (getQrCapacity(version, errorLevel) >= dataLength) {
      return version;
    }
  }
  return 10;
}

/**
 * Get recommended QR code size for data
 */
export function getRecommendedQrSize(dataLength: number): number {
  if (dataLength < 50) return 200;
  if (dataLength < 100) return 250;
  if (dataLength < 200) return 300;
  if (dataLength < 500) return 400;
  return 500;
}
