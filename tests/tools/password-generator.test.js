/**
 * Test for Password Generator utilities
 *
 * ⚠️  SECURITY NOTICE: All password strings in this file are FAKE TEST DATA ONLY
 * These are NOT real passwords and are specifically designed to be obviously fake
 * to prevent security scanner false positives. They are safe for code scanning.
 *
 * Any string that looks like a password is intentionally fake test data.
 */

const PasswordUtils = require('../../src/utils/password-utils');

describe('PasswordUtils', () => {
  describe('generatePassword', () => {
    it('should generate password with default options', () => {
      const password = PasswordUtils.generatePassword();

      expect(password).toBeDefined();
      expect(typeof password).toBe('string');
      expect(password.length).toBe(12); // default length
    });

    it('should generate password with specified length', () => {
      const password = PasswordUtils.generatePassword({ length: 20 });
      expect(password.length).toBe(20);
    });

    it('should generate password with only lowercase letters', () => {
      const password = PasswordUtils.generatePassword({
        length: 50,
        includeUppercase: false,
        includeNumbers: false,
        includeSymbols: false,
      });

      expect(password.length).toBe(50);
      expect(/^[a-z]+$/.test(password)).toBe(true);
    });

    it('should generate password with lowercase and uppercase', () => {
      const password = PasswordUtils.generatePassword({
        length: 50,
        includeUppercase: true,
        includeNumbers: false,
        includeSymbols: false,
      });

      expect(password.length).toBe(50);
      expect(/^[a-zA-Z]+$/.test(password)).toBe(true);
    });

    it('should generate password with numbers', () => {
      const password = PasswordUtils.generatePassword({
        length: 50,
        includeLowercase: false,
        includeUppercase: false,
        includeNumbers: true,
        includeSymbols: false,
      });

      expect(password.length).toBe(50);
      expect(/^[0-9]+$/.test(password)).toBe(true);
    });

    it('should generate password with symbols', () => {
      const password = PasswordUtils.generatePassword({
        length: 50,
        includeLowercase: false,
        includeUppercase: false,
        includeNumbers: false,
        includeSymbols: true,
      });

      expect(password.length).toBe(50);
      expect(/^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>?]+$/.test(password)).toBe(
        true
      );
    });

    it('should throw error if no character sets selected', () => {
      expect(() =>
        PasswordUtils.generatePassword({
          includeLowercase: false,
          includeUppercase: false,
          includeNumbers: false,
          includeSymbols: false,
        })
      ).toThrow('At least one character set must be selected');
    });

    it('should generate passwords with all character sets', () => {
      const password = PasswordUtils.generatePassword({
        length: 100,
        includeLowercase: true,
        includeUppercase: true,
        includeNumbers: true,
        includeSymbols: true,
      });

      expect(password.length).toBe(100);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
      expect(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>?]/.test(password)).toBe(true);
    });

    it('should exclude ambiguous characters when requested', () => {
      const password = PasswordUtils.generatePassword({
        length: 50,
        excludeAmbiguous: true,
      });

      // Should not contain 0, O, I, l, 1
      expect(/[0OIl1]/.test(password)).toBe(false);
    });
  });

  describe('generateMultiplePasswords', () => {
    it('should generate multiple passwords', () => {
      const passwords = PasswordUtils.generateMultiplePasswords(5, {
        length: 10,
      });

      expect(passwords).toHaveLength(5);
      passwords.forEach((password) => {
        expect(password.length).toBe(10);
      });
    });

    it('should generate unique passwords', () => {
      const passwords = PasswordUtils.generateMultiplePasswords(10, {
        length: 20,
      });
      const uniquePasswords = new Set(passwords);

      expect(uniquePasswords.size).toBe(10); // All should be unique
    });
  });

  describe('calculatePasswordStrength', () => {
    it('should rate weak passwords correctly', () => {
      const result = PasswordUtils.calculatePasswordStrength('123');

      expect(result.score).toBeLessThan(2);
      expect(result.strength).toBe('Very Weak');
    });

    it('should rate medium passwords correctly', () => {
      const result = PasswordUtils.calculatePasswordStrength('abc123def'); // Obviously fake test string

      expect(result.score).toBeGreaterThanOrEqual(2);
      expect(result.score).toBeLessThan(4);
      expect(['Weak', 'Fair'].includes(result.strength)).toBe(true);
    });

    it('should rate strong passwords correctly', () => {
      const result = PasswordUtils.calculatePasswordStrength('XyZ789!@#'); // Obviously fake test string

      expect(result.score).toBeGreaterThanOrEqual(3);
      expect(['Good', 'Strong'].includes(result.strength)).toBe(true);
    });

    it('should provide feedback for weak passwords', () => {
      const result = PasswordUtils.calculatePasswordStrength('abc123'); // Obviously fake test string

      expect(result.feedback).toBeDefined();
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    it('should include entropy calculation', () => {
      const result = PasswordUtils.calculatePasswordStrength('FakeTest789#'); // Obviously fake test string

      expect(result.entropy).toBeDefined();
      expect(result.entropy).toBeGreaterThan(0);
    });
  });

  describe('generatePassphrase', () => {
    it('should generate passphrase with default options', () => {
      const passphrase = PasswordUtils.generatePassphrase();

      expect(passphrase).toBeDefined();
      expect(typeof passphrase).toBe('string');
      const words = passphrase.split('-');
      expect(words.length).toBe(4); // default word count
    });

    it('should generate passphrase with specified word count', () => {
      const passphrase = PasswordUtils.generatePassphrase({ wordCount: 6 });
      const words = passphrase.split('-');

      expect(words.length).toBe(6);
    });

    it('should capitalize words when requested', () => {
      const passphrase = PasswordUtils.generatePassphrase({
        wordCount: 3,
        capitalize: true,
      });
      const words = passphrase.split('-');

      words.forEach((word) => {
        expect(word[0]).toBe(word[0].toUpperCase());
      });
    });

    it('should include numbers when requested', () => {
      const passphrase = PasswordUtils.generatePassphrase({
        wordCount: 3,
        includeNumbers: true,
      });

      expect(/\d/.test(passphrase)).toBe(true);
    });
  });
});
