"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Ajv = require("ajv");
const format_verror_1 = require("./util/format-verror");
const ajv = new Ajv({
    allErrors: true,
    format: "full",
    jsonPointers: true
});
const validator = ajv.compile(require("../schema.json"));
class BadJSONLicenseSpecError extends format_verror_1.PrettyVError {
}
exports.BadJSONLicenseSpecError = BadJSONLicenseSpecError;
function specFromJSON(spec, options) {
    if (typeof spec === "string") {
        try {
            spec = JSON.parse(spec);
        }
        catch (e) {
            if (!(e instanceof Error))
                e = new Error(e);
            throw new BadJSONLicenseSpecError(e, "JSON license specification is not well formed");
        }
    }
    const dataPath = options && options.specSourceURL || "";
    try {
        if (!validator(spec, dataPath)) {
            throw new BadJSONLicenseSpecError({
                info: {
                    errors: validator.errors
                }
            }, "JSON license specification is not valid:\n· %s", ajv.errorsText(validator.errors, { dataVar: "", separator: "\n· " }));
        }
    }
    finally {
        delete ajv.errors;
        delete validator.errors;
    }
    return spec;
}
exports.default = specFromJSON;
//# sourceMappingURL=specFromJSON.js.map