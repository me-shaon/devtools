/**
 * Test for JWT Decoder utilities
 */

import { describe, it, expect } from 'vitest';
import {
  decodeJwt,
  isJwtExpired,
  getJwtExpirationDate,
  getJwtIssuedAtDate,
  isValidJwtFormat,
} from '@/utils/jwt';

describe('JWT Utils', () => {
  // Sample valid JWT (expired)
  const validJwt =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.4Adcj3UMYLOjQzPzgtFQhGEhF8Zve54qXKmOVGMqZu0';

  // Sample JWT without exp
  const jwtNoExp =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyf0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  describe('decodeJwt', () => {
    it('should decode valid JWT', () => {
      const result = decodeJwt(validJwt);
      expect(result.isValid).toBe(false); // expired
      expect(result.header).toHaveProperty('alg', 'HS256');
      expect(result.header).toHaveProperty('typ', 'JWT');
      expect(result.payload).toHaveProperty('sub', '1234567890');
      expect(result.payload).toHaveProperty('name', 'John Doe');
    });

    it('should handle empty input', () => {
      const result = decodeJwt('');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Please enter a JWT token');
    });

    it('should handle invalid format', () => {
      const result = decodeJwt('invalid.token');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid JWT format');
    });

    it('should handle malformed base64', () => {
      const result = decodeJwt('a.b.c');
      expect(result.isValid).toBe(false);
    });

    it('should decode JWT without exp', () => {
      const result = decodeJwt(jwtNoExp);
      // JWT without exp should have decoded header and payload
      expect(result.header).toHaveProperty('alg', 'HS256');
      expect(result.payload).toHaveProperty('sub', '1234567890');
      expect(result.signature).toBeTruthy();
    });
  });

  describe('isJwtExpired', () => {
    it('should return true for expired JWT', () => {
      const result = decodeJwt(validJwt);
      expect(isJwtExpired(result)).toBe(true);
    });

    it('should return false for valid JWT', () => {
      // Create a JWT with exp far in future
      const futureJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjk5OTk5OTk5OTl9.f_dummy_signature';
      const result = decodeJwt(futureJwt);
      expect(isJwtExpired(result)).toBe(false);
    });

    it('should handle JWT without exp claim', () => {
      const result = decodeJwt(jwtNoExp);
      expect(isJwtExpired(result)).toBe(false);
    });
  });

  describe('getJwtExpirationDate', () => {
    it('should return expiration date for JWT with exp claim', () => {
      const result = decodeJwt(validJwt);
      const expDate = getJwtExpirationDate(result);
      expect(expDate).toBeInstanceOf(Date);
      expect(expDate!.getTime()).toBe(1516239022000);
    });

    it('should return null for JWT without exp claim', () => {
      const result = decodeJwt(jwtNoExp);
      const expDate = getJwtExpirationDate(result);
      expect(expDate).toBeNull();
    });
  });

  describe('getJwtIssuedAtDate', () => {
    it('should return issued-at date for JWT with iat claim', () => {
      const result = decodeJwt(validJwt);
      const iatDate = getJwtIssuedAtDate(result);
      expect(iatDate).toBeInstanceOf(Date);
      expect(iatDate!.getTime()).toBe(1516239022000);
    });

    it('should return null for JWT without iat claim', () => {
      const jwtNoIat =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dummy_signature';
      const result = decodeJwt(jwtNoIat);
      const iatDate = getJwtIssuedAtDate(result);
      expect(iatDate).toBeNull();
    });
  });

  describe('isValidJwtFormat', () => {
    it('should validate correct JWT format', () => {
      expect(isValidJwtFormat(validJwt)).toBe(true);
      expect(isValidJwtFormat(jwtNoExp)).toBe(true);
    });

    it('should reject incorrect formats', () => {
      expect(isValidJwtFormat('invalid')).toBe(false);
      expect(isValidJwtFormat('a.b')).toBe(false);
      expect(isValidJwtFormat('a.b.c.d')).toBe(false);
      expect(isValidJwtFormat('')).toBe(false);
    });

    it('should accept JWT with empty parts', () => {
      // JWT format requires 3 parts with content
      expect(isValidJwtFormat('..')).toBe(false); // Empty parts are invalid
    });
  });

  describe('JWT payload properties', () => {
    it('should decode standard claims', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIiwic3ViIjoidXNlcjEyMyIsImF1ZCI6ImFwcC1jbGllbnQiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTUxNjI0MjYyMiwianRpIjoiYmM5MDguMTIzIn0.dummy_signature';
      const result = decodeJwt(jwt);

      expect(result.payload.iss).toBe('https://example.com');
      expect(result.payload.sub).toBe('user123');
      expect(result.payload.aud).toBe('app-client');
      expect(result.payload.iat).toBe(1516239022);
      expect(result.payload.exp).toBe(1516242622);
      expect(result.payload.jti).toBe('bc908.123');
    });
  });
});
