/// <reference types="node" />
export interface FirstIndex<N> {
    index: number;
    needleIndex: number;
    needle: N;
}
export declare function firstIndexOf<N extends Uint8Array>(haystack: Buffer, needles: ReadonlyArray<N>, byteOffset?: number): FirstIndex<N> | null;
export declare type Delimiter = "tab" | "lf" | "cr" | "crlf" | "nul" | "eol" | Uint8Array;
export declare function bufferSplitMulti(buffer: Buffer, delimiters: ReadonlyArray<Delimiter>, includeDelimiters?: boolean): Buffer[];
