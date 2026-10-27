/**
 * Hash generator utility functions
 */
import { hmac } from "@noble/hashes/hmac.js";
import { md5 as nobleMd5, sha1 as nobleSha1 } from "@noble/hashes/legacy.js";
import { sha256 as nobleSha256, sha384 as nobleSha384, sha512 as nobleSha512 } from "@noble/hashes/sha2.js";
import { keccak_256, sha3_256, sha3_512 } from "@noble/hashes/sha3.js";
import { bytesToHex, type CHash } from "@noble/hashes/utils.js";

export type HashType =
  | "md5"
  | "sha1"
  | "sha256"
  | "sha384"
  | "sha512"
  | "sha3-256"
  | "sha3-512"
  | "keccak256";

export type HmacHashType = "sha256" | "sha384" | "sha512";

export const HASH_TYPES: { type: HashType; label: string }[] = [
  { type: "md5", label: "MD5" },
  { type: "sha1", label: "SHA-1" },
  { type: "sha256", label: "SHA-256" },
  { type: "sha384", label: "SHA-384" },
  { type: "sha512", label: "SHA-512" },
  { type: "sha3-256", label: "SHA-3-256" },
  { type: "sha3-512", label: "SHA-3-512" },
  { type: "keccak256", label: "Keccak-256" },
];

export const HMAC_TYPES: { type: HmacHashType; label: string }[] = [
  { type: "sha256", label: "HMAC-SHA256" },
  { type: "sha384", label: "HMAC-SHA384" },
  { type: "sha512", label: "HMAC-SHA512" },
];

type HashInput = string | Uint8Array;

type HashFn = (data: Uint8Array) => Uint8Array;

const HASH_FUNCTIONS: Record<HashType, HashFn> = {
  md5: nobleMd5,
  sha1: nobleSha1,
  sha256: nobleSha256,
  sha384: nobleSha384,
  sha512: nobleSha512,
  "sha3-256": sha3_256,
  "sha3-512": sha3_512,
  keccak256: keccak_256,
};

// hmac() needs the hash objects themselves (with block and output sizes), not plain functions.
const HMAC_FUNCTIONS: Record<HmacHashType, CHash> = {
  sha256: nobleSha256,
  sha384: nobleSha384,
  sha512: nobleSha512,
};

const toBytes = (input: HashInput): Uint8Array =>
  typeof input === "string" ? new TextEncoder().encode(input) : input;

/**
 * Convert ArrayBuffer to hex string
 */
export function bufferToHex(buffer: ArrayBuffer): string {
  return bytesToHex(new Uint8Array(buffer));
}

/**
 * Generate MD5 hash (synchronous, UTF-8 input)
 */
export function md5(input: HashInput): string {
  return bytesToHex(nobleMd5(toBytes(input)));
}

/**
 * Generate SHA-1 hash
 */
export async function sha1(input: HashInput): Promise<string> {
  return bytesToHex(nobleSha1(toBytes(input)));
}

/**
 * Generate SHA-256 hash
 */
export async function sha256(input: HashInput): Promise<string> {
  return bytesToHex(nobleSha256(toBytes(input)));
}

/**
 * Generate SHA-512 hash
 */
export async function sha512(input: HashInput): Promise<string> {
  return bytesToHex(nobleSha512(toBytes(input)));
}

/**
 * Generate hash by type. Text is hashed as UTF-8.
 */
export async function generateHash(input: HashInput, type: HashType): Promise<string> {
  return bytesToHex(HASH_FUNCTIONS[type](toBytes(input)));
}

/**
 * Generate an HMAC. The key and the message are hashed as UTF-8 when given as text.
 */
export async function generateHmac(
  input: HashInput,
  key: HashInput,
  type: HmacHashType
): Promise<string> {
  return bytesToHex(hmac(HMAC_FUNCTIONS[type], toBytes(key), toBytes(input)));
}

/**
 * Generate all hash types
 */
export async function generateAllHashes(input: HashInput): Promise<Record<HashType, string>> {
  const entries = await Promise.all(
    HASH_TYPES.map(async ({ type }) => [type, await generateHash(input, type)] as const)
  );
  return Object.fromEntries(entries) as Record<HashType, string>;
}

/**
 * Generate all HMAC types
 */
export async function generateAllHmacs(
  input: HashInput,
  key: HashInput
): Promise<Record<HmacHashType, string>> {
  const entries = await Promise.all(
    HMAC_TYPES.map(async ({ type }) => [type, await generateHmac(input, key, type)] as const)
  );
  return Object.fromEntries(entries) as Record<HmacHashType, string>;
}

/**
 * Format a byte count for display
 */
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[i]}`;
}
