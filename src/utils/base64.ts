/**
 * Base64 utility functions for encoding and decoding text
 */

/**
 * Validates if a string is valid Base64 format
 */
export function isValidBase64(str: string): boolean {
  if (!str || str.trim() === '') {
    return false;
  }

  // Base64 regex pattern
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

  // Check length must be multiple of 4
  if (str.length % 4 !== 0) {
    return false;
  }

  return base64Regex.test(str);
}

/**
 * Encodes text to Base64
 * @throws Error if input is empty or whitespace only
 */
export function encodeText(text: string): string {
  if (!text || text.trim() === '') {
    throw new Error('Please enter text to encode.');
  }

  // Handle UTF-8 encoding properly
  return btoa(unescape(encodeURIComponent(text)));
}

/**
 * Decodes Base64 to text
 * @throws Error if input is empty or invalid Base64
 */
export function decodeText(base64: string): string {
  if (!base64 || base64.trim() === '') {
    throw new Error('Please enter Base64 to decode.');
  }

  const trimmed = base64.trim();

  if (!isValidBase64(trimmed)) {
    throw new Error('Invalid Base64 format');
  }

  try {
    // Handle UTF-8 decoding properly
    return decodeURIComponent(escape(atob(trimmed)));
  } catch {
    throw new Error('Invalid Base64 format');
  }
}
