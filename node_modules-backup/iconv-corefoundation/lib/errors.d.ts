/** Signals that the given text cannot be fully encoded in the chosen {@link StringEncoding}. */
export declare class NotRepresentableError extends Error {
    private constructor();
}
/**
 * Signals that the given encoded text is not valid in the chosen {@link StringEncoding}.
 *
 * @remarks
 * Not all {@link StringEncoding}s can throw this error. Most single-byte encodings and some multi-byte encodings have a valid mapping for every possible sequence of bytes. However, some encodings (such as ASCII and UTF-8) don't consider all byte sequences valid; such encodings will throw this error if the input contains any invalid byte sequences.
 */
export declare class InvalidEncodedTextError extends Error {
    private constructor();
}
/** Signals that the given {@link StringEncoding} specifier (IANA character set name, `CFStringEncoding` constant, or the like) is not recognized or not supported. */
export declare class UnrecognizedEncodingError extends Error {
    private constructor();
}
//# sourceMappingURL=errors.d.ts.map