import Tuple from "./Tuple";
/**
 * Same as `Promise.all`, except:
 *
 * 1. The returned `Promise` resolves or rejects only after *all* of the provided `Promise`s resolve or reject.
 * 2. If more than one of the provided `Promise`s reject, the returned promise rejects with a `MultiError` containing *all* of the rejection reasons.
 *
 * @param ctor - Which `Promise` implementation to use. Defaults to the native implementation.
 */
declare function PromiseEach<Ps extends Tuple<PromiseLike<any> | any>>(promises: Ps, ctor?: PromiseConstructor): Promise<{
    [K in keyof Ps]: Ps[K] extends PromiseLike<infer T> ? T : Ps[K];
}>;
export default PromiseEach;
