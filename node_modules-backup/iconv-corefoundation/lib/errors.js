"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
const cliTruncate = require("cli-truncate");
/** Signals that the given text cannot be fully encoded in the chosen {@link StringEncoding}. */
class NotRepresentableError extends Error {
    constructor(text, encoding) {
        super(`Not fully representable in ${encoding}:\n${util_1.inspect(typeof text === "string" ? cliTruncate(text, 65) : text)}`);
    }
}
exports.NotRepresentableError = NotRepresentableError;
NotRepresentableError.prototype.name = NotRepresentableError.name;
/**
 * Signals that the given encoded text is not valid in the chosen {@link StringEncoding}.
 *
 * @remarks
 * Not all {@link StringEncoding}s can throw this error. Most single-byte encodings and some multi-byte encodings have a valid mapping for every possible sequence of bytes. However, some encodings (such as ASCII and UTF-8) don't consider all byte sequences valid; such encodings will throw this error if the input contains any invalid byte sequences.
 */
class InvalidEncodedTextError extends Error {
    constructor(text, encoding) {
        super(`Input is not valid ${encoding}:\n${util_1.inspect(text)}`);
    }
}
exports.InvalidEncodedTextError = InvalidEncodedTextError;
InvalidEncodedTextError.prototype.name = InvalidEncodedTextError.name;
const specifierKinds = [
    "CFStringEncoding",
    "IANA charset name",
    "Windows codepage",
    "NSStringEncoding"
];
/** Signals that the given {@link StringEncoding} specifier (IANA character set name, `CFStringEncoding` constant, or the like) is not recognized or not supported. */
class UnrecognizedEncodingError extends Error {
    constructor(encodingSpecifier, specifierKind) {
        if (typeof specifierKind !== "string")
            specifierKind = specifierKinds[specifierKind];
        super(`Unrecognized ${specifierKind}: ${util_1.inspect(encodingSpecifier)}`);
    }
}
exports.UnrecognizedEncodingError = UnrecognizedEncodingError;
UnrecognizedEncodingError.prototype.name = UnrecognizedEncodingError.name;
//# sourceMappingURL=errors.js.map