"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Plist = require("plist");
const assembleLicenses_1 = require("./assembleLicenses");
const BodySpec_1 = require("./BodySpec");
exports.BodySpec = BodySpec_1.default;
const Context_1 = require("./Context");
const Labels_1 = require("./Labels");
exports.Labels = Labels_1.Labels;
const makeLicensePlist_1 = require("./makeLicensePlist");
const specFromJSON_1 = require("./specFromJSON");
const writePlistToDmg_1 = require("./writePlistToDmg");
var Language_1 = require("./Language");
exports.Language = Language_1.Language;
var specFromJSON_2 = require("./specFromJSON");
exports.BadJSONLicenseSpecError = specFromJSON_2.BadJSONLicenseSpecError;
var Labels_2 = require("./Labels");
exports.LabelEncodingError = Labels_2.LabelEncodingError;
exports.NoDefaultLabelsError = Labels_2.NoDefaultLabelsError;
async function dmgLicense(imagePath, spec, options) {
    return await writePlistToDmg_1.default(imagePath, (await dmgLicensePlist(spec, options)).plist);
}
exports.dmgLicense = dmgLicense;
exports.default = dmgLicense;
async function dmgLicensePlist(spec, options) {
    const context = new Context_1.default(options);
    const plist = makeLicensePlist_1.default(await assembleLicenses_1.default(spec, context), context);
    return {
        plist,
        get plistText() {
            return Plist.build(plist);
        }
    };
}
exports.dmgLicensePlist = dmgLicensePlist;
async function dmgLicenseFromJSON(imagePath, specJSON, options) {
    return await dmgLicense(imagePath, specFromJSON_1.default(specJSON, options), options);
}
exports.dmgLicenseFromJSON = dmgLicenseFromJSON;
async function dmgLicensePlistFromJSON(specJSON, options) {
    return await dmgLicensePlist(specFromJSON_1.default(specJSON, options), options);
}
exports.dmgLicensePlistFromJSON = dmgLicensePlistFromJSON;
//# sourceMappingURL=index.js.map