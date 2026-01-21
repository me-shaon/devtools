"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Context {
    constructor(options) {
        this.options = options;
        if (options.resolvePath)
            this.resolvePath = options.resolvePath.bind(options);
    }
    static from(contextOrOptions) {
        if (contextOrOptions instanceof Context)
            return contextOrOptions;
        else
            return new Context(contextOrOptions);
    }
    resolvePath(path) {
        return path;
    }
    nonFatalError(error, errorBuffer) {
        const reporter = this.options.onNonFatalError;
        if (reporter) {
            if (errorBuffer)
                errorBuffer.catching(() => reporter(error));
            else
                reporter(error);
        }
        else
            throw error;
    }
    warning(error, errorBuffer) {
        const reporter = this.options.onNonFatalError;
        if (reporter) {
            if (errorBuffer)
                errorBuffer.catching(() => reporter(error));
            else
                reporter(error);
        }
    }
    get canWarn() {
        return !!this.options.onNonFatalError;
    }
}
exports.default = Context;
//# sourceMappingURL=Context.js.map