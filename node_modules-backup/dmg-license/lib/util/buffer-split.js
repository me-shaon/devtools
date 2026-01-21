"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function firstIndexOf(haystack, needles, byteOffset) {
    return needles.reduce((prevBest, needle, needleIndex) => {
        const index = haystack.indexOf(needle, byteOffset);
        if (index >= 0 && (!prevBest || index < prevBest.index))
            return { index, needle, needleIndex };
        else
            return prevBest;
    }, null);
}
exports.firstIndexOf = firstIndexOf;
const namedDelimiters = {
    cr: [Buffer.from([13])],
    crlf: [Buffer.from([13, 10])],
    eol: [],
    lf: [Buffer.from([10])],
    nul: [Buffer.from([0])],
    tab: [Buffer.from([9])]
};
namedDelimiters.eol = [...namedDelimiters.crlf, ...namedDelimiters.cr, ...namedDelimiters.lf];
function bufferSplitMulti(buffer, delimiters, includeDelimiters = false) {
    const binaryDelimiters = [];
    for (const delimiter of delimiters) {
        if (typeof delimiter === "string")
            binaryDelimiters.push(...namedDelimiters[delimiter]);
        else
            binaryDelimiters.push(delimiter);
    }
    const ret = [];
    let pos = 0;
    const max = buffer.length;
    while (pos < max) {
        const next = firstIndexOf(buffer, binaryDelimiters, pos);
        if (next === null) {
            ret.push(buffer.slice(pos));
            break;
        }
        else {
            ret.push(buffer.slice(pos, next.index));
            if (includeDelimiters) {
                // Don't return next.needle; it's internal mutable data that must not leak.
                ret.push(buffer.slice(next.index, next.needle.length));
            }
            pos = next.index + next.needle.length;
        }
    }
    return ret;
}
exports.bufferSplitMulti = bufferSplitMulti;
//# sourceMappingURL=buffer-split.js.map