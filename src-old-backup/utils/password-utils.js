/**
 * Password utilities for generating secure passwords and passphrases
 */

class PasswordUtils {
  static LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
  static UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  static NUMBERS = '0123456789';
  static SYMBOLS = '!@#$%^&*()_+-=[]{};\':"|,.<>?';
  static AMBIGUOUS = '0OIl1';

  // Word list for passphrases (subset for testing)
  static WORDS = [
    'apple',
    'brave',
    'chair',
    'dream',
    'eagle',
    'flame',
    'grape',
    'house',
    'image',
    'judge',
    'knife',
    'lemon',
    'magic',
    'novel',
    'ocean',
    'piano',
    'queen',
    'river',
    'stone',
    'table',
    'unity',
    'value',
    'water',
    'youth',
    'zebra',
    'beach',
    'cloud',
    'dance',
    'earth',
    'field',
    'green',
    'happy',
    'light',
    'mouse',
    'night',
    'party',
    'quick',
    'smile',
    'trust',
    'voice',
  ];

  static generatePassword(options = {}) {
    const {
      length = 12,
      includeLowercase = true,
      includeUppercase = true,
      includeNumbers = true,
      includeSymbols = false,
      excludeAmbiguous = false,
    } = options;

    let charset = '';

    // Build character set based on options
    if (includeLowercase) charset += this.LOWERCASE;
    if (includeUppercase) charset += this.UPPERCASE;
    if (includeNumbers) charset += this.NUMBERS;
    if (includeSymbols) charset += this.SYMBOLS;

    if (!charset) {
      throw new Error('At least one character set must be selected');
    }

    // Remove ambiguous characters if requested
    if (excludeAmbiguous) {
      for (const char of this.AMBIGUOUS) {
        charset = charset.replace(new RegExp(char, 'g'), '');
      }
    }

    // Generate password
    let password = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }

    return password;
  }

  static generateMultiplePasswords(count, options = {}) {
    const passwords = [];
    for (let i = 0; i < count; i++) {
      passwords.push(this.generatePassword(options));
    }
    return passwords;
  }

  static calculatePasswordStrength(password) {
    if (!password) {
      return {
        score: 0,
        strength: 'Very Weak',
        feedback: ['Password is required'],
        entropy: 0,
      };
    }

    let score = 0;
    let feedback = [];

    // Length check
    if (password.length >= 12) score += 2;
    else if (password.length >= 8) score += 1;
    else feedback.push('Use at least 8 characters');

    // Character variety checks
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Add lowercase letters');

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Add uppercase letters');

    if (/[0-9]/.test(password)) score += 1;
    else feedback.push('Add numbers');

    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    else feedback.push('Add symbols');

    // Common pattern penalties
    if (/(.)\1{2,}/.test(password)) {
      score -= 1;
      feedback.push('Avoid repeated characters');
    }

    if (
      /123|234|345|456|567|678|789|abc|bcd|cde|def/.test(password.toLowerCase())
    ) {
      score -= 1;
      feedback.push('Avoid sequential characters');
    }

    // Calculate entropy
    let charset = 0;
    if (/[a-z]/.test(password)) charset += 26;
    if (/[A-Z]/.test(password)) charset += 26;
    if (/[0-9]/.test(password)) charset += 10;
    if (/[^a-zA-Z0-9]/.test(password)) charset += 32;

    const entropy = Math.log2(Math.pow(charset, password.length));

    // Determine strength label
    let strength;
    if (score < 1) strength = 'Very Weak';
    else if (score < 2) strength = 'Weak';
    else if (score < 4) strength = 'Fair';
    else if (score < 6) strength = 'Good';
    else strength = 'Strong';

    return {
      score: Math.max(0, score),
      strength,
      feedback,
      entropy: Math.round(entropy),
    };
  }

  static generatePassphrase(options = {}) {
    const {
      wordCount = 4,
      separator = '-',
      capitalize = false,
      includeNumbers = false,
    } = options;

    const selectedWords = [];

    // Select random words
    for (let i = 0; i < wordCount; i++) {
      const randomIndex = Math.floor(Math.random() * this.WORDS.length);
      let word = this.WORDS[randomIndex];

      if (capitalize) {
        word = word.charAt(0).toUpperCase() + word.slice(1);
      }

      selectedWords.push(word);
    }

    let passphrase = selectedWords.join(separator);

    // Add numbers if requested
    if (includeNumbers) {
      const randomNum = Math.floor(Math.random() * 1000);
      passphrase += randomNum;
    }

    return passphrase;
  }
}

module.exports = PasswordUtils;
