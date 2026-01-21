/// <reference types="node" />
import * as FS from "fs";
export declare const isArray: (arg: any) => arg is any[];
/**
 * Converts a single value into an array containing that value, unless the value is already an array.
 */
export declare function arrayify<T>(v: T | T[]): T[];
/**
 * Converts an array of length 1 to the one value in it. Other arrays are passed through unchanged.
 */
export declare function unarrayify<T>(v: T[]): T | typeof v;
export declare function readFileP(path: FS.PathLike): Promise<Buffer>;
export declare function mapObjByKeys<K extends PropertyKey, T, U>(obj: {
    [key in K]: T;
}, keys: ReadonlyArray<K>, fun: (value: T, key: K) => U, target?: {
    [key in K]: U;
}): {
    [key in K]: U;
};
