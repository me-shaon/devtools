/// <reference types="node" />
import { inspect, InspectOptions } from "util";
import { MultiError } from "verror";
import VError = require("verror");
interface CustomInspectOptions extends InspectOptions {
    stylize(s: string, style: string): string;
}
interface HasCustomInspect {
    [inspect.custom]?(depth: number, options: CustomInspectOptions): string;
}
export declare class PrettyVError extends VError implements HasCustomInspect {
    static errorFromList<T extends Error>(errors: T[]): null | T | PrettyMultiError;
    private _ownStack?;
    constructor(options: VError.Options | Error, message: string, ...params: any[]);
    constructor(message?: string, ...params: any[]);
    [inspect.custom](depth?: number, options?: CustomInspectOptions): string;
}
export declare class PrettyMultiError extends MultiError implements HasCustomInspect {
    private _ownStack?;
    constructor(errors: Error[]);
    [inspect.custom](depth?: number, options?: CustomInspectOptions): string;
}
export {};
