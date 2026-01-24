/**
 * API Response formatter utility functions
 */

/**
 * Format JSON with indentation
 */
export function formatJson(input: string): string {
  if (!input.trim()) {
    throw new Error("Please enter JSON to format");
  }

  try {
    const parsed = JSON.parse(input);
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    throw new Error("Invalid JSON");
  }
}

/**
 * Minify JSON (remove whitespace)
 */
export function minifyJson(input: string): string {
  if (!input.trim()) {
    throw new Error("Please enter JSON to minify");
  }

  try {
    const parsed = JSON.parse(input);
    return JSON.stringify(parsed);
  } catch (error) {
    throw new Error("Invalid JSON");
  }
}

/**
 * Parse URL-encoded data to JSON
 */
export function parseUrlEncoded(input: string): string {
  if (!input.trim()) {
    throw new Error("Please enter URL-encoded data");
  }

  try {
    const params = new URLSearchParams(input);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return JSON.stringify(result, null, 2);
  } catch (error) {
    throw new Error("Invalid URL-encoded data");
  }
}

/**
 * Parse query string to JSON
 */
export function parseQueryString(input: string): string {
  if (!input.trim()) {
    throw new Error("Please enter a query string");
  }

  try {
    const queryString = input.startsWith("?") ? input.slice(1) : input;
    const params = new URLSearchParams(queryString);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return JSON.stringify(result, null, 2);
  } catch (error) {
    throw new Error("Invalid query string");
  }
}

/**
 * Validate JSON string
 */
export function isValidJson(input: string): boolean {
  if (!input.trim()) {
    return false;
  }

  try {
    JSON.parse(input);
    return true;
  } catch {
    return false;
  }
}
