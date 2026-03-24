/**
 * Tests for Bcrypt utility functions
 */

import { describe, it, expect } from "vitest";
import {
  hashBcrypt,
  verifyBcrypt,
  isValidBcryptHash,
  extractRoundsFromHash,
} from "@/utils/bcrypt";

describe("Bcrypt Utils", () => {
  describe("isValidBcryptHash", () => {
    it("should accept valid $2b$ hashes", () => {
      expect(
        isValidBcryptHash("$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lew.8b3L3QFM.8tZW")
      ).toBe(true);
    });

    it("should accept valid $2a$ hashes", () => {
      expect(
        isValidBcryptHash("$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy")
      ).toBe(true);
    });

    it("should reject plain text", () => {
      expect(isValidBcryptHash("password")).toBe(false);
      expect(isValidBcryptHash("")).toBe(false);
    });

    it("should reject truncated hashes", () => {
      expect(isValidBcryptHash("$2b$12$short")).toBe(false);
    });
  });

  describe("extractRoundsFromHash", () => {
    it("should extract the cost factor from a valid hash", () => {
      expect(
        extractRoundsFromHash("$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lew.8b3L3QFM.8tZW")
      ).toBe(12);
      expect(
        extractRoundsFromHash("$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy")
      ).toBe(10);
    });

    it("should return null for non-bcrypt strings", () => {
      expect(extractRoundsFromHash("notahash")).toBeNull();
      expect(extractRoundsFromHash("")).toBeNull();
    });
  });

  describe("hashBcrypt", () => {
    it("should produce a valid bcrypt hash", async () => {
      const hash = await hashBcrypt("mypassword", 4);
      expect(isValidBcryptHash(hash)).toBe(true);
    });

    it("should embed the correct cost factor in the hash", async () => {
      const hash = await hashBcrypt("test", 4);
      expect(extractRoundsFromHash(hash)).toBe(4);
    });

    it("should produce different hashes for the same input (salting)", async () => {
      const h1 = await hashBcrypt("same", 4);
      const h2 = await hashBcrypt("same", 4);
      expect(h1).not.toBe(h2);
    });

    it("should throw on empty plain text", async () => {
      await expect(hashBcrypt("", 4)).rejects.toThrow();
    });

    it("should throw on out-of-range rounds", async () => {
      await expect(hashBcrypt("pw", 3)).rejects.toThrow();
      await expect(hashBcrypt("pw", 15)).rejects.toThrow();
    });
  });

  describe("verifyBcrypt", () => {
    it("should return true when plain text matches the hash", async () => {
      const hash = await hashBcrypt("correct-horse", 4);
      const result = await verifyBcrypt("correct-horse", hash);
      expect(result).toBe(true);
    });

    it("should return false for a wrong plain text", async () => {
      const hash = await hashBcrypt("correct-horse", 4);
      const result = await verifyBcrypt("wrong-horse", hash);
      expect(result).toBe(false);
    });

    it("should throw on empty plain text", async () => {
      await expect(verifyBcrypt("", "$2b$12$valid")).rejects.toThrow();
    });

    it("should throw on an invalid hash", async () => {
      await expect(verifyBcrypt("password", "notahash")).rejects.toThrow();
    });
  });
});
