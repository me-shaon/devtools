"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
const verror_1 = require("verror");
const VError = require("verror");
function subinspect(obj, options) {
    options = Object.assign({}, options, { depth: options.depth == null ? null : options.depth - 1 });
    return util_1.inspect(obj, options);
}
class PrettyVError extends VError {
    static errorFromList(errors) {
        switch (errors.length) {
            case 0: return null;
            case 1: return errors[0];
            default: return new PrettyMultiError(errors);
        }
    }
    constructor(...params) {
        super(...params);
        this._ownStack = this.stack;
        Object.defineProperty(this, "stack", {
            get() {
                return this[util_1.inspect.custom]();
            },
            set(stack) {
                this._ownStack = stack;
            },
            configurable: true
        });
    }
    [util_1.inspect.custom](depth = util_1.inspect.defaultOptions.depth || 2, options = Object.assign({ stylize(s) { return s; } }, util_1.inspect.defaultOptions)) {
        if (depth < 0)
            return this.toString();
        const cause = this.cause();
        return `${this._ownStack}${cause ? `\ncaused by: ${subinspect(cause, options)}` : ""}`;
    }
}
exports.PrettyVError = PrettyVError;
PrettyVError.prototype.name = Error.prototype.name;
PrettyVError.prototype.toString = Error.prototype.toString;
class PrettyMultiError extends verror_1.MultiError {
    constructor(errors) {
        super(errors);
        this._ownStack = this.stack;
        Object.defineProperty(this, "stack", {
            get() {
                return this[util_1.inspect.custom]();
            },
            set(stack) {
                this._ownStack = stack;
            },
            configurable: true
        });
    }
    [util_1.inspect.custom](depth = util_1.inspect.defaultOptions.depth || 2, options = Object.assign({ stylize(s) { return s; } }, util_1.inspect.defaultOptions)) {
        if (depth < 0)
            return options.stylize(this.toString(), "special");
        const errors = this.errors();
        switch (errors.length) {
            case 0: return `${this.toString()} (empty)`;
            case 1: return util_1.inspect(errors[0]);
            default: return `${errors.length} errors:\n${errors.map((error, errorIndex) => {
                const isLastError = errorIndex + 1 === errors.length;
                const formattedError = util_1.inspect(error, Object.assign({}, options, { depth: options.depth == null ? null : options.depth - 1 }));
                let lines = formattedError.split(/\r\n|\r|\n/);
                const firstLinePrefix = isLastError ? "└" : "├";
                const restLinePrefix = isLastError ? " " : "│";
                lines = lines.map((line, lineIndex) => {
                    const isFirstLine = lineIndex === 0;
                    return `${isFirstLine ? firstLinePrefix : restLinePrefix} ${line}`;
                });
                return lines.join("\n");
            }).join("\n")}`;
        }
    }
}
exports.PrettyMultiError = PrettyMultiError;
PrettyMultiError.prototype.name = Error.prototype.name;
PrettyMultiError.prototype.toString = Error.prototype.toString;
//# sourceMappingURL=format-verror.js.map