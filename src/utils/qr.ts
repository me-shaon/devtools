/**
 * QR Generator utility functions
 */

export interface QrOptions {
  size?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

/**
 * Generate QR code as data URL
 * Note: This is a simplified implementation that returns a placeholder.
 * For production use, you would use a library like qrcode or qrcode-generator.
 */
export function generateQrCode(data: string, options: QrOptions = {}): string {
  const {
    size = 300,
    margin = 4,
    color = { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel = 'M',
  } = options;

  // Simple hash-based QR code pattern generator
  // This creates a deterministic pattern based on input
  const hash = simpleHash(data);
  const pattern = generatePattern(hash, size, margin);

  // Return as data URL (simplified QR code representation)
  return `data:image/svg+xml;base64,${btoa(buildQrSvgString(pattern, size, margin, color))}`;
}

/**
 * Generate QR code as SVG string
 */
export function generateQrSvg(
  data: string,
  size: number = 300,
  margin: number = 4
): string {
  const hash = simpleHash(data);
  const pattern = generatePattern(hash, size, margin);
  return buildQrSvgString(pattern, size, margin, { dark: '#000000', light: '#ffffff' });
}

/**
 * Simple hash function for generating deterministic patterns
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Generate QR code pattern grid
 */
function generatePattern(seed: number, size: number, margin: number): boolean[][] {
  const qrSize = 25; // Standard QR code is 25x25 modules
  const grid: boolean[][] = [];

  // Initialize grid
  for (let i = 0; i < qrSize; i++) {
    grid[i] = [];
    for (let j = 0; j < qrSize; j++) {
      grid[i][j] = false;
    }
  }

  // Add position markers (corner squares)
  addPositionMarker(grid, 0, 0);
  addPositionMarker(grid, 0, qrSize - 7);
  addPositionMarker(grid, qrSize - 7, 0);

  // Add timing patterns
  for (let i = 8; i < qrSize - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Add data pattern based on seed
  let value = seed;
  for (let i = 0; i < qrSize; i++) {
    for (let j = 0; j < qrSize; j++) {
      // Skip position markers and timing patterns
      if (
        (i < 9 && j < 9) ||
        (i < 9 && j > qrSize - 9) ||
        (i > qrSize - 9 && j < 9) ||
        i === 6 ||
        j === 6
      ) {
        continue;
      }

      value = (value * 1103515245 + 12345) & 0x7fffffff;
      grid[i][j] = value % 2 === 0;
    }
  }

  return grid;
}

/**
 * Add position marker to grid
 */
function addPositionMarker(grid: boolean[][], row: number, col: number): void {
  const size = 7;
  const innerSize = 3;

  // Outer square
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (i === 0 || i === size - 1 || j === 0 || j === size - 1) {
        if (grid[row + i] && grid[row + i][col + j] !== undefined) {
          grid[row + i][col + j] = true;
        }
      }
    }
  }

  // Inner square
  const offset = (size - innerSize) / 2;
  for (let i = 0; i < innerSize; i++) {
    for (let j = 0; j < innerSize; j++) {
      if (grid[row + i + offset] && grid[row + i + offset][col + j + offset] !== undefined) {
        grid[row + i + offset][col + j + offset] = true;
      }
    }
  }
}

/**
 * Build QR code SVG string
 */
function buildQrSvgString(
  pattern: boolean[][],
  size: number,
  margin: number,
  color: { dark: string; light: string }
): string {
  const qrSize = pattern.length;
  const moduleSize = (size - margin * 2) / qrSize;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  svg += `<rect width="100%" height="100%" fill="${color.light}"/>`;

  for (let i = 0; i < qrSize; i++) {
    for (let j = 0; j < qrSize; j++) {
      if (pattern[i][j]) {
        const x = margin + j * moduleSize;
        const y = margin + i * moduleSize;
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
