/**
 * CSV to JSON converter utility functions
 */

export interface CsvOptions {
  delimiter?: string;
  hasHeader?: boolean;
  trimValues?: boolean;
}

/**
 * Parse CSV string to array of arrays.
 * Quoted values can contain the delimiter, doubled quotes and line breaks.
 */
export function parseCSV(csv: string, options: CsvOptions = {}): string[][] {
  const { delimiter = ",", trimValues = true } = options;

  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;
  let sawQuote = false;

  const endField = () => {
    row.push(trimValues ? current.trim() : current);
    current = "";
  };
  const endRow = () => {
    endField();
    // Skip blank lines (one empty, unquoted field).
    if (!(row.length === 1 && row[0].trim() === "" && !sawQuote)) rows.push(row);
    row = [];
    sawQuote = false;
  };

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];

    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
      sawQuote = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      endRow();
    } else {
      current += char;
    }
  }
  if (current !== "" || row.length > 0 || sawQuote) endRow();

  return rows;
}

const NUMBER_PATTERN = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

function toValue(value: string): string | number {
  return NUMBER_PATTERN.test(value) ? Number(value) : value;
}

/**
 * Convert CSV to JSON (with headers)
 */
export function csvToJson(csv: string, options: CsvOptions = {}): Record<string, any>[] {
  const { delimiter = ",", hasHeader = true } = options;

  const parsed = parseCSV(csv, { delimiter, trimValues: true });

  if (parsed.length === 0) return [];

  if (!hasHeader) {
    // Without headers, use array indices as keys
    return parsed.map((row) => ({ data: row }));
  }

  const headers = parsed[0];
  const result: Record<string, any>[] = [];

  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i];
    const obj: Record<string, any> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j] || `column${j}`;
      obj[header] = toValue(row[j] || "");
    }

    result.push(obj);
  }

  return result;
}

/**
 * Convert CSV to objects for the UI. Without a header row the keys are
 * column1, column2, and so on. Numbers stay as text unless typed is true.
 */
export function csvToObjects(
  csv: string,
  options: CsvOptions & { typed?: boolean } = {}
): Record<string, string | number>[] {
  const { delimiter = ",", hasHeader = true, typed = false } = options;
  const parsed = parseCSV(csv, { delimiter, trimValues: true });
  if (parsed.length === 0) return [];

  const width = Math.max(...parsed.map((row) => row.length));
  const headers = hasHeader
    ? Array.from({ length: width }, (_, i) => parsed[0][i] || `column${i + 1}`)
    : Array.from({ length: width }, (_, i) => `column${i + 1}`);

  return parsed.slice(hasHeader ? 1 : 0).map((row) => {
    const obj: Record<string, string | number> = {};
    headers.forEach((header, i) => {
      const value = row[i] ?? "";
      obj[header] = typed ? toValue(value) : value;
    });
    return obj;
  });
}

/**
 * Normalize any JSON value to rows of objects for CSV output.
 * An array becomes rows. A single object becomes one row. A primitive becomes one "value" row.
 * Array rows use the keys column1, column2, and so on.
 */
function toRecords(data: unknown): Record<string, unknown>[] {
  const list = Array.isArray(data) ? data : [data];
  return list.map((item) => {
    if (Array.isArray(item)) {
      return Object.fromEntries(item.map((value, index) => [`column${index + 1}`, value]));
    }
    if (item !== null && typeof item === "object") return item as Record<string, unknown>;
    return { value: item };
  });
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Convert JSON to CSV. Headers are the union of all keys in first-seen order.
 * Nested objects and arrays are written as JSON text.
 */
export function jsonToCsv(data: unknown, options: CsvOptions = {}): string {
  const { delimiter = ",", hasHeader = true } = options;

  if (Array.isArray(data) && data.length === 0) return "";
  if (data === undefined) return "";

  const records = toRecords(data);
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }

  const escape = (value: string) => escapeCSV(value, delimiter);
  const lines: string[] = [];

  if (hasHeader) {
    lines.push(headers.map(escape).join(delimiter));
  }

  for (const record of records) {
    lines.push(headers.map((header) => escape(cellText(record[header]))).join(delimiter));
  }

  return lines.join("\n");
}

/**
 * Quote a CSV value when it holds the delimiter, a quote, a line break
 * or edge spaces (which a reader would trim).
 */
function escapeCSV(value: string, delimiter = ","): string {
  if (
    value.includes(delimiter) ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes('"') ||
    value !== value.trim()
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Convert CSV to array (no headers)
 */
export function csvToArray(csv: string, delimiter = ","): string[][] {
  return parseCSV(csv, { delimiter, trimValues: true });
}

/**
 * Detect CSV delimiter
 */
export function detectDelimiter(csv: string): string {
  const delimiters = [",", ";", "\t", "|"];
  // Ignore delimiters inside quoted values.
  const firstLine = csv.split(/\r?\n/)[0].replace(/"(?:[^"]|"")*"/g, "");

  let maxCount = 0;
  let detectedDelimiter = ",";

  for (const delimiter of delimiters) {
    const count = (firstLine.match(new RegExp(escapeRegExp(delimiter), "g")) || [])
      .length;
    if (count > maxCount) {
      maxCount = count;
      detectedDelimiter = delimiter;
    }
  }

  return detectedDelimiter;
}

/**
 * Escape regex special characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
