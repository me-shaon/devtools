/**
 * CSV to JSON converter utility functions
 */

export interface CsvOptions {
  delimiter?: string;
  hasHeader?: boolean;
  trimValues?: boolean;
}

/**
 * Parse CSV string to array of arrays
 */
export function parseCSV(csv: string, options: CsvOptions = {}): string[][] {
  const { delimiter = ",", trimValues = true } = options;

  const lines: string[][] = [];
  const linesRaw = csv.split(/\r?\n/);

  for (const line of linesRaw) {
    if (!line.trim()) continue;

    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(trimValues ? current.trim() : current);
        current = "";
      } else {
        current += char;
      }
    }

    values.push(trimValues ? current.trim() : current);
    lines.push(values);
  }

  return lines;
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
      const value = row[j] || "";
      // Try to convert numeric strings back to numbers
      if (value !== "" && !isNaN(Number(value))) {
        obj[header] = Number(value);
      } else {
        obj[header] = value;
      }
    }

    result.push(obj);
  }

  return result;
}

/**
 * Convert JSON to CSV
 */
export function jsonToCsv(data: Record<string, any>[], options: CsvOptions = {}): string {
  const { delimiter = ",", hasHeader = true } = options;

  if (data.length === 0) return "";

  // Get headers from first object
  const headers = Object.keys(data[0]);
  const lines: string[] = [];

  // Add header row
  if (hasHeader) {
    lines.push(headers.map(escapeCSV).join(delimiter));
  }

  // Add data rows
  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      return escapeCSV(String(value ?? ""));
    });
    lines.push(values.join(delimiter));
  }

  return lines.join("\n");
}

/**
 * Escape CSV value if needed
 */
function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
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
  const firstLine = csv.split(/\r?\n/)[0];

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
