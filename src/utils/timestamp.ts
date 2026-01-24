/**
 * Timestamp converter utility functions
 */

/**
 * Convert Unix timestamp to Date
 */
export function timestampToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

/**
 * Convert Date to Unix timestamp
 */
export function dateToTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Convert Unix timestamp to formatted date string
 */
export function timestampToFormattedString(timestamp: number, locale = "en-US"): string {
  const date = timestampToDate(timestamp);
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Convert date string to Unix timestamp
 */
export function dateStringToTimestamp(dateString: string): number {
  const date = new Date(dateString);
  return dateToTimestamp(date);
}

/**
 * Get current Unix timestamp
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Get current date as formatted string
 */
export function getCurrentDateString(locale = "en-US"): string {
  return timestampToFormattedString(getCurrentTimestamp(), locale);
}

/**
 * Validate Unix timestamp
 */
export function isValidTimestamp(timestamp: number): boolean {
  const date = timestampToDate(timestamp);
  return !isNaN(date.getTime()) && timestamp > 0;
}

/**
 * Format date to various formats
 */
export function formatDateFormats(date: Date) {
  return {
    iso: date.toISOString(),
    locale: date.toLocaleString(),
    utc: date.toUTCString(),
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString(),
  };
}
