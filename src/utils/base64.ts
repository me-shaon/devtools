/**
 * Base64 utility functions for text, bytes, and data URIs
 */

export interface EncodeOptions {
  /** Use the URL-safe alphabet (- and _) and drop the padding. */
  urlSafe?: boolean;
}

export interface ParsedDataUri {
  mimeType: string;
  base64: string;
}

/**
 * Validates if a string is valid standard Base64 format
 */
export function isValidBase64(str: string): boolean {
  if (!str || str.trim() === '') {
    return false;
  }

  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

  if (str.length % 4 !== 0) {
    return false;
  }

  return base64Regex.test(str);
}

/**
 * Convert standard Base64 to URL-safe Base64 (no padding)
 */
export function toUrlSafe(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Convert standard or URL-safe Base64 (padded or not) to standard padded Base64.
 * @throws Error if the input has characters outside both alphabets
 */
export function normalizeBase64(input: string): string {
  const cleaned = input.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(cleaned)) {
    throw new Error('Invalid Base64 format');
  }
  const unpadded = cleaned.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (unpadded.length % 4 === 1) {
    throw new Error('Invalid Base64 format');
  }
  return unpadded + '='.repeat((4 - (unpadded.length % 4)) % 4);
}

/**
 * Encode bytes to Base64
 */
export function bytesToBase64(bytes: Uint8Array, options: EncodeOptions = {}): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const encoded = btoa(binary);
  return options.urlSafe ? toUrlSafe(encoded) : encoded;
}

/**
 * Decode standard or URL-safe Base64 to bytes
 * @throws Error if the input is empty or invalid
 */
export function base64ToBytes(base64: string): Uint8Array {
  if (!base64 || base64.trim() === '') {
    throw new Error('Please enter Base64 to decode.');
  }
  const normalized = normalizeBase64(base64.trim());
  try {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    throw new Error('Invalid Base64 format');
  }
}

/**
 * Encodes text to Base64 (UTF-8)
 * @throws Error if input is empty or whitespace only
 */
export function encodeText(text: string, options: EncodeOptions = {}): string {
  if (!text || text.trim() === '') {
    throw new Error('Please enter text to encode.');
  }
  return bytesToBase64(new TextEncoder().encode(text), options);
}

/**
 * Decodes standard or URL-safe Base64 to text (UTF-8)
 * @throws Error if input is empty, invalid Base64, or not valid UTF-8
 */
export function decodeText(base64: string): string {
  const bytes = base64ToBytes(base64);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Decoded data is not valid UTF-8 text. Use the file option to save it.');
  }
}

/**
 * Build a data URI from bytes
 */
export function bytesToDataUri(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;
}

/**
 * Parse a Base64 data URI. Returns null when the input is not a Base64 data URI.
 */
export function parseDataUri(input: string): ParsedDataUri | null {
  const match = /^\s*data:([^;,]*)((?:;[^;,]+)*);base64,([\s\S]*)$/i.exec(input);
  if (!match) {
    return null;
  }
  return { mimeType: match[1] || 'application/octet-stream', base64: match[3].trim() };
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'application/pdf': 'pdf',
  'application/json': 'json',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'text/html': 'html',
  'text/css': 'css',
  'text/csv': 'csv',
};

/**
 * Pick a file extension for a MIME type
 */
export function extensionForMime(mimeType: string): string {
  return EXTENSIONS[mimeType.toLowerCase()] ?? 'bin';
}

/**
 * Detect common file types from magic bytes. Returns null when unknown.
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith([0x25, 0x50, 0x44, 0x46])) return 'application/pdf';
  if (startsWith([0x50, 0x4b, 0x03, 0x04])) return 'application/zip';
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45) {
    return 'image/webp';
  }
  return null;
}
