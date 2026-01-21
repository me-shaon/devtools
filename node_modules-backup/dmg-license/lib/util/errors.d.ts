/**
 * Accumulates multiple errors, to all be thrown together instead of one at a time.
 */
export declare class ErrorBuffer {
    errors: Error[];
    /**
     * Adds the given error(s) (or other objects, which are converted to errors).
     */
    add(...errors: unknown[]): void;
    /**
     * Adds the given error, then throws it. If other errors have been added already, throws a `MultiError` instead.
     */
    throw(error: unknown): never;
    /**
     * Catches errors thrown from the given function, adding them to the array of accumulated errors.
     */
    catching<T>(fun: () => T): T | undefined;
    /**
     * Catches errors thrown from the given async function or promise, adding them to the array of accumulated errors.
     */
    catchingAsync<T>(fun: Promise<T> | (() => Promise<T>)): Promise<T | undefined>;
    /**
     * Throws any accumulated errors.
     */
    check(): void;
    readonly isEmpty: boolean;
}
