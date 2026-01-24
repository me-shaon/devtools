/**
 * UUID and ULID generator utility functions
 */

export type UUIDVersion = "1" | "3" | "4" | "5" | "6" | "7" | "ulid";

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  // More lenient validation - check format but allow any variant bits
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate ULID format
 */
export function isValidULID(ulid: string): boolean {
  const ulidRegex = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
  return ulidRegex.test(ulid);
}

/**
 * Generate UUID v4 (random)
 */
export function generateUUIDv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate UUID v1 (timestamp-based, simplified)
 */
export function generateUUIDv1(): string {
  const timestamp = Date.now();
  const timestampHex = timestamp.toString(16);

  const randomBytes = [];
  for (let i = 0; i < 16; i++) {
    randomBytes.push(Math.floor(Math.random() * 256).toString(16).padStart(2, "0"));
  }

  const timeLow = timestampHex.padStart(8, "0").substring(0, 8);
  const timeMid = timestampHex.padStart(8, "0").substring(0, 4);
  const timeHi = "1" + timestampHex.padStart(8, "0").substring(0, 3);

  const clockSeq = randomBytes.slice(8, 10).join("");
  const node = randomBytes.slice(10, 16).join("");

  return `${timeLow}-${timeMid}-${timeHi}-${clockSeq}-${node}`;
}

/**
 * Generate UUID v6 (timestamp-based, reordered)
 */
export function generateUUIDv6(): string {
  const timestamp = Date.now();
  const timestampHex = (timestamp + 0x01b21dd213814000).toString(16).padStart(24, "0");

  const timeHiVer = "6" + timestampHex.substring(0, 3);
  const timeMid = timestampHex.substring(3, 7);
  const timeLow = timestampHex.substring(7, 15);

  const randomBytes = [];
  for (let i = 0; i < 8; i++) {
    randomBytes.push(Math.floor(Math.random() * 256).toString(16).padStart(2, "0"));
  }

  const clockSeq = "8" + randomBytes[0].substring(1) + randomBytes[1];
  const node = randomBytes.slice(2, 8).join("");

  return `${timeLow}-${timeMid}-${timeHiVer}-${clockSeq}-${node}`;
}

/**
 * Generate UUID v7 (timestamp-based, new standard)
 * Draft RFC: https://datatracker.ietf.org/doc/html/draft-ietf-uuidrev-rfc4122bis
 *
 * Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 * - time_low: 32 bits (most significant bits of timestamp)
 * - time_mid: 16 bits (middle bits of timestamp)
 * - time_hi_and_version: 4 bits (version 7) + 12 bits (least significant bits of timestamp)
 * - clock_seq_hi_and_res: 2 bits (variant) + 6 bits (random)
 * - clock_seq_low: 8 bits (random)
 * - node: 48 bits (random)
 */
export function generateUUIDv7(): string {
  const timestamp = Date.now();

  // Convert timestamp to 12-character hex string (48 bits)
  const timestampHex = timestamp.toString(16).padStart(12, "0");

  // time_low: first 8 hex digits (32 bits, most significant)
  const timeLow = timestampHex.substring(0, 8);

  // time_mid: next 4 hex digits (16 bits)
  const timeMid = timestampHex.substring(8, 12);

  // time_hi_and_version: version "7" + 3 hex digits (we use random here since we've exhausted timestamp)
  // The spec calls for 12 more bits of timestamp, but Date.now() only gives us 48 bits
  // So we use random for the remaining bits
  const rand1 = Math.floor(Math.random() * 4096).toString(16).padStart(3, "0");
  const timeHiAndVer = "7" + rand1;

  // Generate random bytes for the rest
  const randomBytes = [];
  for (let i = 0; i < 8; i++) {
    randomBytes.push(Math.floor(Math.random() * 256).toString(16).padStart(2, "0"));
  }

  // clock_seq_hi_and_res: variant bit (10xxxxxx) + random
  const clockSeqHi = "8" + randomBytes[0].substring(1);
  const clockSeqLow = randomBytes[1];
  const node = randomBytes.slice(2, 8).join("");

  return `${timeLow}-${timeMid}-${timeHiAndVer}-${clockSeqHi}${clockSeqLow}-${node}`;
}

/**
 * Generate ULID
 */
export function generateULID(): string {
  const encoding = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const timestamp = Date.now();

  let timestampEncoded = "";
  let remainingTime = timestamp;

  for (let i = 0; i < 10; i++) {
    const remainder = remainingTime % 32;
    timestampEncoded = encoding[remainder] + timestampEncoded;
    remainingTime = Math.floor(remainingTime / 32);
  }

  let randomEncoded = "";
  for (let i = 0; i < 16; i++) {
    randomEncoded += encoding[Math.floor(Math.random() * 32)];
  }

  return timestampEncoded + randomEncoded;
}

/**
 * Simple hash function for UUID v3/v5
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(32, "0");
}

/**
 * Format hash as UUID
 */
function formatUUIDFromHash(hash: string, ver: string): string {
  const hex = hash.substring(0, 32);
  const timeLow = hex.substring(0, 8);
  const timeMid = hex.substring(8, 12);
  const timeHiVer = ver + hex.substring(13, 16);
  const clockSeq = "8" + hex.substring(17, 20);
  const node = hex.substring(20, 32);

  return `${timeLow}-${timeMid}-${timeHiVer}-${clockSeq}-${node}`;
}

/**
 * Generate UUID v3 (MD5-based, simplified)
 */
export function generateUUIDv3(): string {
  const namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  const name = "example.com";
  const hash = simpleHash(namespace + name);
  return formatUUIDFromHash(hash, "3");
}

/**
 * Generate UUID v5 (SHA-1-based, simplified)
 */
export function generateUUIDv5(): string {
  const namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  const name = "example.com";
  const hash = simpleHash(namespace + name);
  return formatUUIDFromHash(hash, "5");
}

/**
 * Generate UUID by version
 */
export function generateUUID(version: UUIDVersion = "4"): string {
  switch (version) {
    case "1":
      return generateUUIDv1();
    case "3":
      return generateUUIDv3();
    case "4":
      return generateUUIDv4();
    case "5":
      return generateUUIDv5();
    case "6":
      return generateUUIDv6();
    case "7":
      return generateUUIDv7();
    case "ulid":
      return generateULID();
  }
}

/**
 * Generate multiple UUIDs
 */
export function generateMultipleUUIDs(count: number, version: UUIDVersion = "4"): string[] {
  if (count < 1 || count > 1000) {
    throw new Error("Count must be between 1 and 1000");
  }

  const uuids: string[] = [];
  for (let i = 0; i < count; i++) {
    uuids.push(generateUUID(version));
  }
  return uuids;
}
