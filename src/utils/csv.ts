/**
 * CSV to JSON converter utility functions
 */

export interface CsvOptions {
  delimiter?: string;
  hasHeader?: boolean;
  trimValues?: boolean;
  /** JSON to CSV: write nested objects and arrays as dot keys (user.name, tags.0). */
  flatten?: boolean;
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
export function csvToJson(csv: string, options: CsvOptions = {}): Record<string, unknown>[] {
  const { delimiter = ",", hasHeader = true } = options;

  const parsed = parseCSV(csv, { delimiter, trimValues: true });

  if (parsed.length === 0) return [];

  if (!hasHeader) {
    // Without headers, use array indices as keys
    return parsed.map((row) => ({ data: row }));
  }

  const headers = parsed[0];
  const result: Record<string, unknown>[] = [];

  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i];
    const obj: Record<string, unknown> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j] || `column${j}`;
      obj[header] = toValue(row[j] || "");
    }

    result.push(obj);
  }

  return result;
}

const INTEGER_PATTERN = /^-?(0|[1-9]\d*)$/;

/**
 * Detect the type of a CSV cell: numbers, true/false, null, and JSON arrays or objects.
 * Integers that would lose precision and invalid JSON stay as text.
 */
function inferValue(value: string): unknown {
  if (NUMBER_PATTERN.test(value)) {
    const number = Number(value);
    return INTEGER_PATTERN.test(value) && !Number.isSafeInteger(number) ? value : number;
  }
  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (lower === "null") return null;
  if (/^\s*[[{]/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

const INDEX_PATTERN = /^(0|[1-9]\d*)$/;

/** Turn objects whose keys are all array indexes into arrays, deepest first. */
function toArrays(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value).map(([key, child]) => [key, toArrays(child)] as const);
  if (entries.length > 0 && entries.every(([key]) => INDEX_PATTERN.test(key))) {
    return entries.sort(([a], [b]) => Number(a) - Number(b)).map(([, child]) => child);
  }
  return Object.fromEntries(entries);
}

/**
 * Build nested objects from dot keys. Keys that are all numbers become arrays.
 * Empty cells under an array index are dropped, so shorter arrays do not get blank items.
 */
function nest(record: Record<string, unknown>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const path = key.split(".");
    if (path.some((part) => part === "")) {
      root[key] = value;
      continue;
    }
    if (value === "" && path.some((part) => INDEX_PATTERN.test(part))) continue;
    let node = root;
    path.slice(0, -1).forEach((part) => {
      const child = node[part];
      if (child === null || typeof child !== "object") node[part] = {};
      node = node[part] as Record<string, unknown>;
    });
    node[path[path.length - 1]] = value;
  }
  return toArrays(root) as Record<string, unknown>;
}

/**
 * Convert CSV to objects for the UI. Without a header row the keys are
 * column1, column2, and so on. Values stay as text unless typed is true.
 * With nest, dot keys become nested objects and arrays.
 */
export function csvToObjects(
  csv: string,
  options: CsvOptions & { typed?: boolean; nest?: boolean } = {}
): Record<string, unknown>[] {
  const { delimiter = ",", hasHeader = true, typed = false } = options;
  const parsed = parseCSV(csv, { delimiter, trimValues: true });
  if (parsed.length === 0) return [];

  const width = Math.max(...parsed.map((row) => row.length));
  const headers = hasHeader
    ? Array.from({ length: width }, (_, i) => parsed[0][i] || `column${i + 1}`)
    : Array.from({ length: width }, (_, i) => `column${i + 1}`);

  return parsed.slice(hasHeader ? 1 : 0).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      const value = row[i] ?? "";
      obj[header] = typed ? inferValue(value) : value;
    });
    return options.nest ? nest(obj) : obj;
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

/**
 * Flatten nested objects and arrays into dot keys: { user: { tags: ["a"] } } becomes { "user.tags.0": "a" }.
 * Empty objects and arrays stay as values, so they are written as {} and [].
 */
function flattenRecord(record: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const visit = (value: unknown, prefix: string) => {
    if (value !== null && typeof value === "object" && Object.keys(value).length > 0) {
      for (const [key, child] of Object.entries(value)) visit(child, prefix ? `${prefix}.${key}` : key);
    } else {
      flat[prefix] = value;
    }
  };
  for (const [key, value] of Object.entries(record)) visit(value, key);
  return flat;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Convert JSON to CSV. Headers are the union of all keys in first-seen order.
 * Nested objects and arrays are written as JSON text, or as dot keys when flatten is true.
 */
export function jsonToCsv(data: unknown, options: CsvOptions = {}): string {
  const { delimiter = ",", hasHeader = true, flatten = false } = options;

  if (Array.isArray(data) && data.length === 0) return "";
  if (data === undefined) return "";

  const records = flatten ? toRecords(data).map(flattenRecord) : toRecords(data);
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
 * Add a UTF-8 byte order mark. Excel needs it to read non-ASCII text in a saved CSV file.
 */
export function withBom(text: string): string {
  return text.startsWith("\uFEFF") ? text : `\uFEFF${text}`;
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
