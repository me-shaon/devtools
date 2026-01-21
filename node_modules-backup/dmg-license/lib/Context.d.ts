import { Options } from ".";
import { ErrorBuffer } from "./util/errors";
export default class Context {
    options: Options;
    static from(contextOrOptions: Context | Options): Context;
    constructor(options: Options);
    resolvePath(path: string): string;
    nonFatalError(error: Error, errorBuffer?: ErrorBuffer): void;
    warning(error: Error, errorBuffer?: ErrorBuffer): void;
    readonly canWarn: boolean;
}
