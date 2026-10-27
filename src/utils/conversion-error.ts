/** An input error with a 1-based line and column when the parser reports one. */
export class ConversionError extends Error {
  constructor(message: string, readonly line?: number, readonly column?: number) {
    super(message);
    this.name = "ConversionError";
  }
}

export const withPosition = (message: string, line?: number, column?: number) =>
  line ? `Line ${line}, column ${column ?? 1}: ${message}` : message;

/** Builds a ConversionError whose message starts with "Line L, column C:". */
export const errorAt = (message: string, line?: number, column?: number) =>
  new ConversionError(withPosition(message, line, column), line, column);

/** Sets a key as own data, so a key such as "__proto__" never changes the object's prototype. */
export const setOwn = (target: object, key: string | number, value: unknown) => {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
};
