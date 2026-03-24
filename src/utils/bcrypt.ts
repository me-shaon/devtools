/**
 * Bcrypt hashing and verification utility functions
 */

import bcrypt from "bcryptjs";

export const BCRYPT_MIN_ROUNDS = 4;
export const BCRYPT_MAX_ROUNDS = 14;
export const BCRYPT_DEFAULT_ROUNDS = 12;

/**
 * Hash a plain-text string with bcrypt
 * @param plainText The plain text to hash
 * @param rounds Number of salt rounds (cost factor). Higher = slower but more secure.
 */
export async function hashBcrypt(plainText: string, rounds: number): Promise<string> {
  if (!plainText) {
    throw new Error("Please enter a text to hash.");
  }
  if (rounds < BCRYPT_MIN_ROUNDS || rounds > BCRYPT_MAX_ROUNDS) {
    throw new Error(`Rounds must be between ${BCRYPT_MIN_ROUNDS} and ${BCRYPT_MAX_ROUNDS}.`);
  }
  const salt = await bcrypt.genSalt(rounds);
  return bcrypt.hash(plainText, salt);
}

/**
 * Verify a plain-text string against a bcrypt hash
 * @param plainText The plain text to verify
 * @param hash The bcrypt hash to compare against
 */
export async function verifyBcrypt(plainText: string, hash: string): Promise<boolean> {
  if (!plainText) {
    throw new Error("Please enter the plain text to verify.");
  }
  if (!hash || !hash.startsWith("$2")) {
    throw new Error("Please enter a valid bcrypt hash (starts with $2a$, $2b$, or $2y$).");
  }
  return bcrypt.compare(plainText, hash);
}

/**
 * Check if a string looks like a valid bcrypt hash
 */
export function isValidBcryptHash(hash: string): boolean {
  // bcrypt hashes are always 60 characters and start with $2a$, $2b$, or $2y$
  return /^\$2[aby]\$\d{2}\$.{53}$/.test(hash);
}

/**
 * Extract the cost factor (rounds) from a bcrypt hash
 */
export function extractRoundsFromHash(hash: string): number | null {
  const match = hash.match(/^\$2[aby]\$(\d{2})\$/);
  return match ? parseInt(match[1], 10) : null;
}
