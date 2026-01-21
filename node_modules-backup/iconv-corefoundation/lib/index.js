"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
const native_1 = require("./native");
__export(require("./errors"));
__export(require("./native"));
/**
 * Convenience alias for {@link StringEncoding.decode}.
 *
 * @param text - The encoded text.
 * @param encoding - The encoding of the `text`. May be an IANA character set name or a {@link StringEncoding}.
 * @param options - Options for decoding.
 * @returns The decoded text, as a string.
 */
function decode(text, encoding, options) {
    if (typeof encoding === "string")
        encoding = native_1.StringEncoding.byIANACharSetName(encoding);
    return encoding.decode(text, options);
}
exports.decode = decode;
/**
 * Convenience alias for {@link StringEncoding.encode}.
 *
 * @remarks
 * Throws {@link NotRepresentableError} if the `text` cannot be fully represented in this encoding, and `options` does not contain a `lossByte`.
 *
 * @param text - The text to encode.
 * @param encoding - The encoding to use. May be an IANA character set name or a {@link StringEncoding}.
 * @param options - Options for encoding.
 * @returns The encoded text, in a `Buffer`.
 */
function encode(text, encoding, options) {
    if (typeof encoding === "string")
        encoding = native_1.StringEncoding.byIANACharSetName(encoding);
    return encoding.encode(text, options);
}
exports.encode = encode;
//# sourceMappingURL=index.js.map