/**
 * Date Difference utility functions
 */

export interface DateDifference {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalDays: number;
  totalHours: number;
  totalMinutes: number;
  totalSeconds: number;
  milliseconds: number;
}

export interface DateFormatOptions {
  includeTime?: boolean;
  includeMilliseconds?: boolean;
  format?: 'short' | 'medium' | 'long' | 'full';
}

/**
 * Calculate the difference between two dates
 */
export function calculateDateDifference(
  date1: Date | string,
  date2: Date | string
): DateDifference {
  const d1 = date1 instanceof Date ? date1 : new Date(date1);
  const d2 = date2 instanceof Date ? date2 : new Date(date2);

  // Ensure d2 is the later date for positive values
  const [start, end] = d1 < d2 ? [d1, d2] : [d2, d1];
  const isNegative = d1 > d2;

  const diffMs = Math.abs(end.getTime() - start.getTime());
  const diffSeconds = diffMs / 1000;
  const diffMinutes = diffSeconds / 60;
  const diffHours = diffMinutes / 60;
  const diffDays = diffHours / 24;

  // Calculate calendar difference
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  // Adjust for negative days
  if (days < 0) {
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    days += prevMonth.getDate();
    months--;
  }

  // Adjust for negative months
  if (months < 0) {
    months += 12;
    years--;
  }

  const result: DateDifference = {
    years: isNegative ? -years : years,
    months: isNegative ? -months : months,
    days: isNegative ? -days : days,
    hours: isNegative ? -Math.floor(diffHours % 24) : Math.floor(diffHours % 24),
    minutes: isNegative ? -Math.floor(diffMinutes % 60) : Math.floor(diffMinutes % 60),
    seconds: isNegative ? -Math.floor(diffSeconds % 60) : Math.floor(diffSeconds % 60),
    totalDays: isNegative ? -Math.floor(diffDays) : Math.floor(diffDays),
    totalHours: isNegative ? -Math.floor(diffHours) : Math.floor(diffHours),
    totalMinutes: isNegative ? -Math.floor(diffMinutes) : Math.floor(diffMinutes),
    totalSeconds: isNegative ? -Math.floor(diffSeconds) : Math.floor(diffSeconds),
    milliseconds: isNegative ? -diffMs : diffMs,
  };

  return result;
}

/**
 * Format a date difference as a human-readable string
 */
export function formatDateDifference(
  difference: DateDifference,
  options: DateFormatOptions = {}
): string {
  const { includeTime = true, includeMilliseconds = false } = options;

  const parts: string[] = [];

  if (difference.years !== 0) {
    parts.push(`${Math.abs(difference.years)} year${Math.abs(difference.years) !== 1 ? 's' : ''}`);
  }
  if (difference.months !== 0) {
    parts.push(`${Math.abs(difference.months)} month${Math.abs(difference.months) !== 1 ? 's' : ''}`);
  }
  if (difference.days !== 0) {
    parts.push(`${Math.abs(difference.days)} day${Math.abs(difference.days) !== 1 ? 's' : ''}`);
  }

  if (includeTime) {
    if (difference.hours !== 0) {
      parts.push(`${Math.abs(difference.hours)} hour${Math.abs(difference.hours) !== 1 ? 's' : ''}`);
    }
    if (difference.minutes !== 0) {
      parts.push(`${Math.abs(difference.minutes)} minute${Math.abs(difference.minutes) !== 1 ? 's' : ''}`);
    }
    if (difference.seconds !== 0) {
      parts.push(`${Math.abs(difference.seconds)} second${Math.abs(difference.seconds) !== 1 ? 's' : ''}`);
    }
  }

  if (includeMilliseconds && difference.milliseconds !== 0) {
    parts.push(`${Math.abs(difference.milliseconds)} millisecond${Math.abs(difference.milliseconds) !== 1 ? 's' : ''}`);
  }

  const prefix = isNegative(difference) ? '-' : '';

  if (parts.length === 0) {
    return '0 seconds';
  }

  return prefix + parts.join(', ');
}

/**
 * Check if the difference is negative (date1 is after date2)
 */
function isNegative(diff: DateDifference): boolean {
  return (
    diff.years < 0 ||
    diff.months < 0 ||
    diff.days < 0 ||
    diff.totalDays < 0 ||
    diff.milliseconds < 0
  );
}

/**
 * Add time to a date
 */
export function addToDate(
  date: Date | string,
  options: {
    years?: number;
    months?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
  }
): Date {
  const d = date instanceof Date ? new Date(date) : new Date(date);

  if (options.years) d.setFullYear(d.getFullYear() + options.years);
  if (options.months) d.setMonth(d.getMonth() + options.months);
  if (options.days) d.setDate(d.getDate() + options.days);
  if (options.hours) d.setHours(d.getHours() + options.hours);
  if (options.minutes) d.setMinutes(d.getMinutes() + options.minutes);
  if (options.seconds) d.setSeconds(d.getSeconds() + options.seconds);

  return d;
}

/**
 * Subtract time from a date
 */
export function subtractFromDate(
  date: Date | string,
  options: {
    years?: number;
    months?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
  }
): Date {
  return addToDate(date, {
    years: options.years ? -options.years : 0,
    months: options.months ? -options.months : 0,
    days: options.days ? -options.days : 0,
    hours: options.hours ? -options.hours : 0,
    minutes: options.minutes ? -options.minutes : 0,
    seconds: options.seconds ? -options.seconds : 0,
  });
}

/**
 * Get the age from a birthdate
 */
export function calculateAge(birthdate: Date | string): number {
  const birth = birthdate instanceof Date ? birthdate : new Date(birthdate);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/**
 * Check if a date is valid
 */
export function isValidDate(date: Date | string): boolean {
  const d = date instanceof Date ? date : new Date(date);
  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * Get timezone offset in hours
 */
export function getTimezoneOffset(date: Date | string = new Date()): number {
  const d = date instanceof Date ? date : new Date(date);
  return -d.getTimezoneOffset() / 60;
}

/**
 * Get timezone name
 */
export function getTimezoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}
