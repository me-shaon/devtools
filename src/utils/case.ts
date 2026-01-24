/**
 * Case converter utility functions
 */

export type CaseType =
  | "camelCase"
  | "PascalCase"
  | "snake_case"
  | "kebab-case"
  | "UPPER_SNAKE_CASE"
  | "Sentence case"
  | "lowercase"
  | "UPPERCASE"
  | "Title Case";

/**
 * Convert string to camelCase
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (c) => c.toLowerCase());
}

/**
 * Convert string to PascalCase
 */
export function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (c) => c.toUpperCase());
}

/**
 * Convert string to snake_case
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "_$1")
    .replace(/^_/, "")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

/**
 * Convert string to kebab-case
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "-$1")
    .replace(/^-/, "")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

/**
 * Convert string to UPPER_SNAKE_CASE
 */
export function toUpperSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "_$1")
    .replace(/^_/, "")
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

/**
 * Convert string to Sentence case
 */
export function toSentenceCase(str: string): string {
  return str
    .replace(/[-_]+(.)?/g, (_, c) => (c ? " " + c.toLowerCase() : " "))
    .replace(/^\s/, "")
    .replace(/([.!?]\s*)(.)/g, (_, prefix, c) => prefix + c.toUpperCase())
    .replace(/^(.)/, (c) => c.toUpperCase());
}

/**
 * Convert string to Title Case
 */
export function toTitleCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? " " + c.toUpperCase() : " "))
    .replace(/^\s/, "")
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Convert string to all lowercase
 */
export function toLowerCase(str: string): string {
  return str.toLowerCase();
}

/**
 * Convert string to all UPPERCASE
 */
export function toUpperCase(str: string): string {
  return str.toUpperCase();
}

/**
 * Convert string to specified case type
 */
export function convertCase(str: string, caseType: CaseType): string {
  switch (caseType) {
    case "camelCase":
      return toCamelCase(str);
    case "PascalCase":
      return toPascalCase(str);
    case "snake_case":
      return toSnakeCase(str);
    case "kebab-case":
      return toKebabCase(str);
    case "UPPER_SNAKE_CASE":
      return toUpperSnakeCase(str);
    case "Sentence case":
      return toSentenceCase(str);
    case "lowercase":
      return toLowerCase(str);
    case "UPPERCASE":
      return toUpperCase(str);
    case "Title Case":
      return toTitleCase(str);
  }
}

/**
 * Convert string to all case types
 */
export function convertToAllCases(str: string): Record<CaseType, string> {
  return {
    camelCase: toCamelCase(str),
    PascalCase: toPascalCase(str),
    snake_case: toSnakeCase(str),
    "kebab-case": toKebabCase(str),
    UPPER_SNAKE_CASE: toUpperSnakeCase(str),
    "Sentence case": toSentenceCase(str),
    lowercase: toLowerCase(str),
    UPPERCASE: toUpperCase(str),
    "Title Case": toTitleCase(str),
  };
}
