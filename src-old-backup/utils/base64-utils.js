/**
 * Base64 utilities for testing - extracted from Base64Converter
 */

class Base64Utils {
  static encodeText(text) {
    if (!text || !text.trim()) {
      throw new Error('Please enter text to encode.');
    }

    try {
      return btoa(unescape(encodeURIComponent(text)));
    } catch (error) {
      throw new Error('Error encoding text: ' + error.message);
    }
  }

  static decodeText(base64) {
    if (!base64 || !base64.trim()) {
      throw new Error('Please enter Base64 to decode.');
    }

    if (!this.isValidBase64(base64.trim())) {
      throw new Error('Invalid Base64 format');
    }

    try {
      return decodeURIComponent(escape(atob(base64.trim())));
    } catch (error) {
      throw new Error(
        'Error decoding Base64: Invalid format or corrupted data'
      );
    }
  }

  static isValidBase64(str) {
    if (!str || str.trim() === '') return false;

    try {
      return btoa(atob(str)) === str;
    } catch (err) {
      return false;
    }
  }
}

module.exports = Base64Utils;
