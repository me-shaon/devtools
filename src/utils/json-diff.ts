export type JsonDiffType = "added" | "removed" | "changed" | "unchanged";

export interface JsonDiffEntry {
  path: string;
  type: JsonDiffType;
  original?: unknown;
  modified?: unknown;
}

export interface JsonDiffResult {
  entries: JsonDiffEntry[];
  truncated: boolean;
}

export interface JsonDiffOptions {
  includeUnchanged?: boolean;
  maxEntries?: number;
}

export const MAX_DIFF_ENTRIES = 10000;

const IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatObjectKey(key: string): string {
  return IDENTIFIER_REGEX.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

function appendPath(parent: string, segment: string): string {
  if (parent === "$") {
    return `$${segment}`;
  }

  return `${parent}${segment}`;
}

export function diffJsonValues(
  original: unknown,
  modified: unknown,
  options: JsonDiffOptions = {},
): JsonDiffResult {
  const includeUnchanged = options.includeUnchanged ?? true;
  const maxEntries = options.maxEntries ?? MAX_DIFF_ENTRIES;
  const entries: JsonDiffEntry[] = [];
  let truncated = false;

  const pushEntry = (entry: JsonDiffEntry) => {
    if (truncated) {
      return;
    }

    if (entries.length >= maxEntries) {
      truncated = true;
      return;
    }

    entries.push(entry);
  };

  const compare = (path: string, left: unknown, right: unknown) => {
    if (truncated) {
      return;
    }

    if (Object.is(left, right)) {
      if (includeUnchanged) {
        pushEntry({ path, type: "unchanged", original: left, modified: right });
      }
      return;
    }

    if (Array.isArray(left) && Array.isArray(right)) {
      const maxLength = Math.max(left.length, right.length);

      for (let index = 0; index < maxLength; index += 1) {
        const childPath = appendPath(path, `[${index}]`);

        if (index >= left.length) {
          pushEntry({ path: childPath, type: "added", modified: right[index] });
          continue;
        }

        if (index >= right.length) {
          pushEntry({ path: childPath, type: "removed", original: left[index] });
          continue;
        }

        compare(childPath, left[index], right[index]);
      }

      return;
    }

    if (isObjectLike(left) && isObjectLike(right)) {
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b));

      for (const key of sortedKeys) {
        const childPath = appendPath(path, formatObjectKey(key));
        const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
        const hasRight = Object.prototype.hasOwnProperty.call(right, key);

        if (!hasLeft && hasRight) {
          pushEntry({ path: childPath, type: "added", modified: right[key] });
          continue;
        }

        if (hasLeft && !hasRight) {
          pushEntry({ path: childPath, type: "removed", original: left[key] });
          continue;
        }

        compare(childPath, left[key], right[key]);
      }

      return;
    }

    pushEntry({ path, type: "changed", original: left, modified: right });
  };

  compare("$", original, modified);

  return { entries, truncated };
}

export function formatDiffValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "undefined";
  }

  return JSON.stringify(value, null, 2);
}
