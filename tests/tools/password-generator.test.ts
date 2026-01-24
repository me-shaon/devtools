/**
 * Test for Password Generator utilities
 */

import { describe, it, expect } from 'vitest';
import {
  generatePassword,
  generateMultiplePasswords,
  calculatePasswordStrength,
  generatePassphrase,
  type PasswordOptions,
  type PassphraseOptions,
} from '@/utils/password';

describe('Password Utils', () => {
  describe('generatePassword', () => {
    it('should generate password with default options', () => {
      const password = generatePassword();

      expect(password).toBeDefined();
      expect(typeof password).toBe('string');
      expect(password.length).toBe(12); // default length
    });

    it('should generate password with specified length', () => {
      const password = generatePassword({ length: 20 });
      expect(password.length).toBe(20);
    });

    it('should generate password with only lowercase letters', () => {
      const password = generatePassword({
        length: 50,
        includeUppercase: false,
        includeNumbers: false,
        includeSymbols: false,
      });

      expect(password.length).toBe(50);
      expect(/^[a-z]+$/.test(password)).toBe(true);
    });

    it('should generate password with lowercase and uppercase', () => {
      const password = generatePassword({
        length: 50,
        includeNumbers: false,
        includeSymbols: false,
      });

      expect(password.length).toBe(50);
      expect(/^[a-zA-Z]+$/.test(password)).toBe(true);
    });

    it('should generate password with numbers', () => {
      const password = generatePassword({
        length: 50,
        includeLowercase: false,
        includeUppercase: false,
        includeSymbols: false,
      });

      expect(password.length).toBe(50);
      expect(/^[0-9]+$/.test(password)).toBe(true);
    });

    it('should generate password with symbols', () => {
      const password = generatePassword({
        length: 50,
        includeLowercase: false,
        includeUppercase: false,
        includeNumbers: false,
        includeSymbols: true,
      });

      expect(password.length).toBe(50);
      expect(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>?]/.test(password)).toBe(true);
    });

    it('should throw error if no character sets selected', () => {
      expect(() =>
        generatePassword({
          includeLowercase: false,
          includeUppercase: false,
          includeNumbers: false,
          includeSymbols: false,
        })
      ).toThrow('At least one character set must be selected');
    });

    it('should generate passwords with all character sets', () => {
      const password = generatePassword({
        length: 100,
      });

      expect(password.length).toBe(100);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
    });

    it('should exclude ambiguous characters when requested', () => {
      const password = generatePassword({
        length: 100,
        excludeAmbiguous: true,
      });

      // Should not contain 0, O, I, l, 1
      expect(/[0OIl1]/.test(password)).toBe(false);
    });
  });

  describe('generateMultiplePasswords', () => {
    it('should generate multiple passwords', () => {
      const passwords = generateMultiplePasswords(5, {
        length: 10,
      });

      expect(passwords).toHaveLength(5);
      passwords.forEach((password) => {
        expect(password.length).toBe(10);
      });
    });

    it('should generate unique passwords', () => {
      const passwords = generateMultiplePasswords(10, {
        length: 20,
      });
      const uniquePasswords = new Set(passwords);

      expect(uniquePasswords.size).toBeGreaterThan(5); // Should have good randomness
    });
  });

  describe('calculatePasswordStrength', () => {
    it('should rate weak passwords correctly', () => {
      const result = calculatePasswordStrength('abc');

      expect(result.score).toBeLessThan(2);
      expect(result.strength).toBe('Very Weak');
    });

    it('should rate medium passwords correctly', () => {
      const result = calculatePasswordStrength('TestPass123');

      expect(result.score).toBeGreaterThanOrEqual(2);
      expect(['Fair', 'Good'].includes(result.strength)).toBe(true);
    });

    it('should rate strong passwords correctly', () => {
      const result = calculatePasswordStrength('TestStrong&3');

      expect(result.score).toBeGreaterThanOrEqual(3);
      expect(['Good', 'Strong'].includes(result.strength)).toBe(true);
    });

    it('should provide feedback for weak passwords', () => {
      const result = calculatePasswordStrength('testweak');

      expect(result.feedback).toBeDefined();
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    it('should include entropy calculation', () => {
      const result = calculatePasswordStrength('TestEntropy123!');

      expect(result.entropy).toBeDefined();
      expect(result.entropy).toBeGreaterThan(0);
    });
  });

  describe('generatePassphrase', () => {
    it('should generate passphrase with default options', () => {
      const passphrase = generatePassphrase();

      expect(passphrase).toBeDefined();
      expect(typeof passphrase).toBe('string');
      const words = passphrase.split('-');
      expect(words.length).toBe(4); // default word count
    });

    it('should generate passphrase with specified word count', () => {
      const passphrase = generatePassphrase({ wordCount: 6 });
      const words = passphrase.split('-');

      expect(words.length).toBe(6);
    });

    it('should capitalize words when requested', () => {
      const passphrase = generatePassphrase({
        wordCount: 3,
        capitalize: true,
      });
      const words = passphrase.split('-');

      words.forEach((word) => {
        // Handle case where word might have number appended
        const wordPart = word.replace(/[0-9]+$/, '');
        expect(wordPart[0]).toBe(wordPart[0].toUpperCase());
      });
    });

    it('should include numbers when requested', () => {
      const passphrase = generatePassphrase({
        wordCount: 3,
        includeNumbers: true,
      });

      expect(/\d/.test(passphrase)).toBe(true);
    });
  });
});
