/**
 * JSON Viewer utility functions
 */

export interface JsonNode {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  depth: number;
  children?: JsonNode[];
  size?: number; // For objects/arrays
}

export interface JsonParseResult {
  success: boolean;
  data?: any;
  error?: string;
  tree?: JsonNode;
}

/**
 * Parse JSON string
 */
export function parseJson(input: string): JsonParseResult {
  try {
    const data = JSON.parse(input);
    const tree = buildJsonTree(data, '', 0);
    return { success: true, data, tree };
  } catch (error) {
    return {
      success: false,
      error: `Invalid JSON: ${(error as Error).message}`,
    };
  }
}

/**
 * Build tree structure from JSON data
 */
function buildJsonTree(data: any, key: string, depth: number): JsonNode {
  const type = getJsonType(data);

  const node: JsonNode = {
    key,
    value: data,
    type,
    depth,
  };

  if (type === 'object' && data !== null) {
    const children: JsonNode[] = [];
    let size = 0;

    for (const [k, v] of Object.entries(data)) {
      children.push(buildJsonTree(v, k, depth + 1));
      size++;
    }

    node.children = children;
    node.size = size;
  } else if (type === 'array') {
    const children: JsonNode[] = [];

    for (let i = 0; i < data.length; i++) {
      children.push(buildJsonTree(data[i], i.toString(), depth + 1));
    }

    node.children = children;
    node.size = data.length;
  }

  return node;
}

/**
 * Get the type of a JSON value
 */
export function getJsonType(value: any): JsonNode['type'] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return type;
  if (type === 'object') return 'object';
  return 'null';
}

/**
 * Format JSON string with indentation
 */
export function formatJson(input: string, indent = 2): string | null {
  try {
    const data = JSON.parse(input);
    return JSON.stringify(data, null, indent);
  } catch {
    return null;
  }
}

/**
 * Minify JSON string
 */
export function minifyJson(input: string): string | null {
  try {
    const data = JSON.parse(input);
    return JSON.stringify(data);
  } catch {
    return null;
  }
}

/**
 * Sort JSON object keys
 */
export function sortJsonKeys(input: string): string | null {
  try {
    const data = JSON.parse(input);
    const sorted = sortObject(data);
    return JSON.stringify(sorted, null, 2);
  } catch {
    return null;
  }
}

/**
 * Recursively sort object keys
 */
function sortObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }

  if (obj !== null && typeof obj === 'object') {
    const sorted: any = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = sortObject(obj[key]);
    }
    return sorted;
  }

  return obj;
}

/**
 * Convert JSON to XML
 */
export function jsonToXml(input: string, rootName = 'root'): string | null {
  try {
    const data = JSON.parse(input);
    return objectToXml(data, rootName);
  } catch {
    return null;
  }
}

/**
 * Convert object to XML string
 */
function objectToXml(obj: any, nodeName: string): string {
  let xml = '';

  if (Array.isArray(obj)) {
    for (const item of obj) {
      xml += `<${nodeName}>${valueToXml(item)}</${nodeName}>`;
    }
  } else if (obj !== null && typeof obj === 'object') {
    xml += `<${nodeName}>`;
    for (const [key, value] of Object.entries(obj)) {
      xml += objectToXml(value, key);
    }
    xml += `</${nodeName}>`;
  } else {
    xml += `<${nodeName}>${valueToXml(obj)}</${nodeName}>`;
  }

  return xml;
}

/**
 * Convert value to XML-safe string
 */
function valueToXml(value: any): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return escapeXml(value);
  return String(value);
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert JSON to YAML
 */
export function jsonToYaml(input: string): string | null {
  try {
    const data = JSON.parse(input);
    return objectToYaml(data, 0);
  } catch {
    return null;
  }
}

/**
 * Convert object to YAML string
 */
function objectToYaml(obj: any, indent: number): string {
  const spaces = '  '.repeat(indent);

  if (obj === null) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') return String(obj);
  if (typeof obj === 'string') return `"${obj}"`;

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    let yaml = '';
    for (const item of obj) {
      const itemYaml = objectToYaml(item, indent + 1);
      yaml += `${spaces}- ${itemYaml.slice(indent * 2)}\n`;
    }
    return yaml.trim();
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    let yaml = '';
    for (const key of keys) {
      const valueYaml = objectToYaml(obj[key], indent + 1);
      if (valueYaml.includes('\n')) {
        // Multi-line value
        yaml += `${spaces}${key}:\n${valueYaml}\n`;
      } else {
        yaml += `${spaces}${key}: ${valueYaml}\n`;
      }
    }
    return yaml.trim();
  }

  return String(obj);
}

/**
 * Get JSON path to a value
 */
export function getJsonPaths(data: any, prefix = ''): string[] {
  const paths: string[] = [];

  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const path = `${prefix}[${i}]`;
      paths.push(path);
      paths.push(...getJsonPaths(data[i], path));
    }
  } else if (data !== null && typeof data === 'object') {
    for (const key of Object.keys(data)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.push(path);
      paths.push(...getJsonPaths(data[key], path));
    }
  }

  return paths;
}

/**
 * Query JSON using JSONPath-like syntax
 */
export function queryJson(data: any, path: string): any | null {
  const parts = path.split('.');
  let current = data;

  for (const part of parts) {
    // Handle array access [index]
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current[key];
      if (Array.isArray(current)) {
        current = current[parseInt(index, 10)];
      }
    } else {
      current = current[part];
    }

    if (current === undefined) return null;
  }

  return current;
}

/**
 * Get JSON statistics
 */
export function getJsonStats(input: string): {
  size: number;
  keys: number;
  arrays: number;
  objects: number;
  depth: number;
} | null {
  try {
    const data = JSON.parse(input);
    return {
      size: input.length,
      keys: countKeys(data),
      arrays: countArrays(data),
      objects: countObjects(data),
      depth: getDepth(data),
    };
  } catch {
    return null;
  }
}

/**
 * Count keys in JSON
 */
function countKeys(obj: any): number {
  if (Array.isArray(obj)) {
    return obj.reduce((sum, item) => sum + countKeys(item), 0);
  }
  if (obj !== null && typeof obj === 'object') {
    return (
      Object.keys(obj).length +
      Object.values(obj).reduce((sum, val) => sum + countKeys(val), 0)
    );
  }
  return 0;
}

/**
 * Count arrays in JSON
 */
function countArrays(obj: any): number {
  if (Array.isArray(obj)) {
    return 1 + obj.reduce((sum, item) => sum + countArrays(item), 0);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.values(obj).reduce((sum, val) => sum + countArrays(val), 0);
  }
  return 0;
}

/**
 * Count objects in JSON
 */
function countObjects(obj: any): number {
  if (Array.isArray(obj)) {
    return obj.reduce((sum, item) => sum + countObjects(item), 0);
  }
  if (obj !== null && typeof obj === 'object') {
    return (
      1 +
      Object.values(obj).reduce((sum, val) => sum + countObjects(val), 0)
    );
  }
  return 0;
}

/**
 * Get depth of JSON structure
 */
function getDepth(obj: any, currentDepth = 0): number {
  if (Array.isArray(obj)) {
    if (obj.length === 0) return currentDepth;
    return Math.max(...obj.map((item) => getDepth(item, currentDepth + 1)));
  }
  if (obj !== null && typeof obj === 'object') {
    const values = Object.values(obj);
    if (values.length === 0) return currentDepth;
    return Math.max(...values.map((val) => getDepth(val, currentDepth + 1)));
  }
  return currentDepth;
}
