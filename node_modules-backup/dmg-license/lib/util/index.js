"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const FS = require("fs");
exports.isArray = Array.isArray || (arg => arg instanceof Array);
/**
 * Converts a single value into an array containing that value, unless the value is already an array.
 */
function arrayify(v) {
    return exports.isArray(v) ? v : [v];
}
exports.arrayify = arrayify;
/**
 * Converts an array of length 1 to the one value in it. Other arrays are passed through unchanged.
 */
function unarrayify(v) {
    return v.length === 1 ? v[0] : v;
}
exports.unarrayify = unarrayify;
function readFileP(path) {
    return new Promise((resolve, reject) => {
        FS.readFile(path, (error, data) => {
            if (error)
                reject(error);
            else
                resolve(data);
        });
    });
}
exports.readFileP = readFileP;
function mapObjByKeys(obj, keys, fun, target) {
    if (!target)
        target = {};
    for (const key of keys)
        target[key] = fun(obj[key], key);
    return target;
}
exports.mapObjByKeys = mapObjByKeys;
//# sourceMappingURL=index.js.map