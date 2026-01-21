"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = require("./errors");
async function PromiseEach(promises, ctor = Promise) {
    const results = await ctor.all(promises.map((promise) => promise instanceof ctor
        ? promise.then((resolved) => ({ resolved }), (rejected) => ({ rejected }))
        : promise));
    const rejections = new errors_1.ErrorBuffer();
    for (const result of results)
        if ("rejected" in result)
            rejections.add(result.rejected);
    rejections.check();
    return results.map(t => t.resolved);
}
exports.default = PromiseEach;
//# sourceMappingURL=PromiseEach.js.map