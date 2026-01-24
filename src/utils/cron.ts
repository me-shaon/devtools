/**
 * Cron Calculator utility functions
 */

export interface CronPart {
  min: number;
  max: number;
  values: number[];
  isRange: boolean;
  isWildcard: boolean;
  isStep: boolean;
}

export interface CronExpression {
  minute: CronPart;
  hour: CronPart;
  dayOfMonth: CronPart;
  month: CronPart;
  dayOfWeek: CronPart;
  raw: string;
}

/**
 * Parse a cron expression
 */
export function parseCronExpression(cron: string): CronExpression | null {
  const parts = cron.trim().split(/\s+/);

  if (parts.length < 5 || parts.length > 6) {
    return null;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek, year] = parts;

  return {
    minute: parseCronPart(minute, 0, 59),
    hour: parseCronPart(hour, 0, 23),
    dayOfMonth: parseCronPart(dayOfMonth, 1, 31),
    month: parseCronPart(month, 1, 12),
    dayOfWeek: parseCronPart(dayOfWeek, 0, 6),
    raw: cron,
  };
}

/**
 * Parse a single part of a cron expression
 */
function parseCronPart(part: string, min: number, max: number): CronPart {
  const isWildcard = part === '*';
  const isStep = part.includes('/');
  const isRange = part.includes('-') && !part.includes('/');
  const isList = part.includes(',') && !part.includes('-') && !part.includes('/');

  let values: number[] = [];

  if (isWildcard) {
    values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  } else if (isStep) {
    const [base, stepStr] = part.split('/');
    const step = parseInt(stepStr, 10);

    let baseValues: number[];
    if (base === '*') {
      baseValues = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    } else {
      baseValues = parseRangeValues(base, min, max);
    }

    values = baseValues.filter((_, i) => i % step === 0);
  } else if (isList) {
    // Handle comma-separated list
    const items = part.split(',');
    values = items
      .map((v) => parseInt(v, 10))
      .filter((v) => !isNaN(v) && v >= min && v <= max);
  } else if (isRange) {
    values = parseRangeValues(part, min, max);
  } else {
    const num = parseInt(part, 10);
    if (!isNaN(num)) {
      values = [num];
    }
  }

  return {
    min,
    max,
    values,
    isRange,
    isWildcard,
    isStep,
  };
}

/**
 * Parse range values (e.g., "1-5" or "1,2,3")
 */
function parseRangeValues(part: string, min: number, max: number): number[] {
  const values: number[] = [];

  if (part.includes(',')) {
    // List of values
    const items = part.split(',');
    for (const item of items) {
      if (item.includes('-')) {
        const [start, end] = item.split('-').map((v) => parseInt(v, 10));
        for (let i = start; i <= end; i++) {
          if (i >= min && i <= max) {
            values.push(i);
          }
        }
      } else {
        const num = parseInt(item, 10);
        if (num >= min && num <= max) {
          values.push(num);
        }
      }
    }
  } else if (part.includes('-')) {
    // Single range
    const [start, end] = part.split('-').map((v) => parseInt(v, 10));
    for (let i = start; i <= end; i++) {
      if (i >= min && i <= max) {
        values.push(i);
      }
    }
  } else {
    const num = parseInt(part, 10);
    if (num >= min && num <= max) {
      values.push(num);
    }
  }

  return values;
}

/**
 * Get next run time for a cron expression
 */
export function getNextRunTime(cron: string, fromDate: Date = new Date()): Date | null {
  const parsed = parseCronExpression(cron);
  if (!parsed) return null;

  const date = new Date(fromDate);
  date.setSeconds(0, 0); // Reset seconds and milliseconds

  // Find next valid time
  let maxIterations = 4 * 365 * 24 * 60; // 4 years max
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    // Check minute
    if (!parsed.minute.values.includes(date.getMinutes())) {
      date.setMinutes(date.getMinutes() + 1);
      if (date.getMinutes() === 0) {
        date.setHours(date.getHours() + 1);
      }
      continue;
    }

    // Check hour
    if (!parsed.hour.values.includes(date.getHours())) {
      date.setHours(date.getHours() + 1);
      date.setMinutes(0);
      continue;
    }

    // Check day of month
    if (!parsed.dayOfMonth.values.includes(date.getDate())) {
      date.setDate(date.getDate() + 1);
      date.setHours(0);
      date.setMinutes(0);
      continue;
    }

    // Check month
    if (!parsed.month.values.includes(date.getMonth() + 1)) {
      date.setMonth(date.getMonth() + 1);
      date.setDate(1);
      date.setHours(0);
      date.setMinutes(0);
      continue;
    }

    // Check day of week
    if (!parsed.dayOfWeek.values.includes(date.getDay())) {
      date.setDate(date.getDate() + 1);
      date.setHours(0);
      date.setMinutes(0);
      continue;
    }

    // Found valid time
    if (date.getTime() <= fromDate.getTime()) {
      date.setMinutes(date.getMinutes() + 1);
      continue;
    }

    return date;
  }

  return null;
}

/**
 * Get previous run time for a cron expression
 */
export function getPreviousRunTime(cron: string, fromDate: Date = new Date()): Date | null {
  const parsed = parseCronExpression(cron);
  if (!parsed) return null;

  const date = new Date(fromDate);
  date.setSeconds(0, 0);

  let maxIterations = 4 * 365 * 24 * 60;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    date.setMinutes(date.getMinutes() - 1);

    if (date.getMinutes() === 59) {
      // Wrapped around
      continue;
    }

    // Check all conditions
    if (
      parsed.minute.values.includes(date.getMinutes()) &&
      parsed.hour.values.includes(date.getHours()) &&
      parsed.dayOfMonth.values.includes(date.getDate()) &&
      parsed.month.values.includes(date.getMonth() + 1) &&
      parsed.dayOfWeek.values.includes(date.getDay())
    ) {
      return date;
    }
  }

  return null;
}

/**
 * Validate a cron expression
 */
export function isValidCronExpression(cron: string): boolean {
  return parseCronExpression(cron) !== null;
}

/**
 * Convert cron expression to human-readable description
 */
export function describeCronExpression(cron: string): string | null {
  const parsed = parseCronExpression(cron);
  if (!parsed) return null;

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let description = 'Run';

  // Minute
  if (parsed.minute.isWildcard) {
    description += ' every minute';
  } else {
    description += ` at minute(s): ${formatValues(parsed.minute.values)}`;
  }

  // Hour
  if (!parsed.hour.isWildcard) {
    description += ` past hour(s): ${formatValues(parsed.hour.values)}`;
  }

  // Day of month
  if (!parsed.dayOfMonth.isWildcard) {
    description += ` on day(s): ${formatValues(parsed.dayOfMonth.values)}`;
  }

  // Month
  if (!parsed.month.isWildcard) {
    const months = parsed.month.values.map((m) => monthNames[m - 1]);
    description += ` in ${months.join(', ')}`;
  }

  // Day of week
  if (!parsed.dayOfWeek.isWildcard) {
    const days = parsed.dayOfWeek.values.map((d) => dayNames[d]);
    description += ` on ${days.join(', ')}`;
  }

  return description;
}

/**
 * Format array of values as readable string
 */
function formatValues(values: number[]): string {
  if (values.length === 0) return 'none';
  if (values.length === 1) return values[0].toString();

  // Check for consecutive ranges
  const ranges: string[] = [];
  let start = values[0];
  let prev = values[0];

  for (let i = 1; i < values.length; i++) {
    if (values[i] !== prev + 1) {
      if (start === prev) {
        ranges.push(start.toString());
      } else {
        ranges.push(`${start}-${prev}`);
      }
      start = values[i];
    }
    prev = values[i];
  }

  // Add last range
  if (start === prev) {
    ranges.push(start.toString());
  } else {
    ranges.push(`${start}-${prev}`);
  }

  return ranges.join(', ');
}

/**
 * Get common cron expression examples
 */
export function getCommonCronExpressions(): Record<string, string> {
  return {
    'Every minute': '* * * * *',
    'Every hour': '0 * * * *',
    'Every day at midnight': '0 0 * * *',
    'Every day at noon': '0 12 * * *',
    'Every week': '0 0 * * 0',
    'Every month': '0 0 1 * *',
    'Every year': '0 0 1 1 *',
    'Every 5 minutes': '*/5 * * * *',
    'Every 30 minutes': '*/30 * * * *',
    'Every hour at 30 minutes past': '30 * * * *',
    'Weekdays at 9 AM': '0 9 * * 1-5',
    'Weekends at midnight': '0 0 * * 6,0',
  };
}
