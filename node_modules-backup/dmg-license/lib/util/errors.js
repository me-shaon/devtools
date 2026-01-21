"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const verror_1 = require("verror");
const format_verror_1 = require("./format-verror");
/**
 * Accumulates multiple errors, to all be thrown together instead of one at a time.
 */
class ErrorBuffer {
    constructor() {
        this.errors = [];
    }
    /**
     * Adds the given error(s) (or other objects, which are converted to errors).
     */
    add(...errors) {
        for (let error of errors) {
            if (error instanceof verror_1.MultiError)
                this.add(...error.errors());
            else {
                if (!(error instanceof Error))
                    error = new Error(String(error));
                else if (this.errors.indexOf(error) !== -1) {
                    /* Deduplicate errors.
                     *
                     * Consider this scenario:
                     * 1. Promise A is started.
                     * 2. Promise B is started. It awaits the result of A.
                     * 3. Promise C is started. It also awaits the result of A.
                     * 4. PromiseEach is called, to collect the results of promises B and C.
                     * 5. Promise A rejects with error E.
                     * 6. Promise B, previously waiting on A, rejects with E.
                     * 7. Promise C, previously waiting on A, also rejects with E.
                     * 8. PromiseEach collects the results of [B, C]. They are { B: rejection(E), C: rejection(E) }.
                     * 9. PromiseEach finds that B rejected with E, so it adds E to its ErrorBuffer.
                     * 10. PromiseEach finds that C rejected with E, so it adds E to its ErrorBuffer.
                     * 11. PromiseEach rejects with [E, E].
                     *
                     * But, if ErrorBuffer deduplicates the errors it receives, then step 10 has no effect, because E is already in the ErrorBuffer. As a result, in step 11, PromiseEach rejects with E instead of [E, E].
                     *
                     * Note that this deduplication only applies to instances of Error. When other values are passed in, they are converted to a new instance of Error each time, so there is no chance to deduplicate them.
                     */
                    continue;
                }
                this.errors.push(error);
            }
        }
    }
    /**
     * Adds the given error, then throws it. If other errors have been added already, throws a `MultiError` instead.
     */
    throw(error) {
        const throwSingle = !this.errors.length;
        this.add(error);
        throw throwSingle ? error : format_verror_1.PrettyVError.errorFromList(this.errors);
    }
    /**
     * Catches errors thrown from the given function, adding them to the array of accumulated errors.
     */
    catching(fun) {
        try {
            return fun();
        }
        catch (e) {
            this.add(e);
        }
    }
    /**
     * Catches errors thrown from the given async function or promise, adding them to the array of accumulated errors.
     */
    async catchingAsync(fun) {
        try {
            if (typeof fun === "function")
                return await fun();
            else
                return await fun;
        }
        catch (e) {
            this.add(e);
        }
    }
    /**
     * Throws any accumulated errors.
     */
    check() {
        const error = format_verror_1.PrettyVError.errorFromList(this.errors);
        if (error)
            throw error;
    }
    get isEmpty() {
        return !this.errors.length;
    }
}
exports.ErrorBuffer = ErrorBuffer;
//# sourceMappingURL=errors.js.map