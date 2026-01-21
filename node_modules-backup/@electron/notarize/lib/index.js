"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notarize = exports.validateAuthorizationArgs = void 0;
const debug_1 = __importDefault(require("debug"));
const promise_retry_1 = __importDefault(require("promise-retry"));
const check_signature_1 = require("./check-signature");
const notarytool_1 = require("./notarytool");
const staple_1 = require("./staple");
const d = (0, debug_1.default)('electron-notarize');
var validate_args_1 = require("./validate-args");
Object.defineProperty(exports, "validateAuthorizationArgs", { enumerable: true, get: function () { return validate_args_1.validateNotaryToolAuthorizationArgs; } });
function notarize(_a) {
    var { appPath } = _a, otherOptions = __rest(_a, ["appPath"]);
    return __awaiter(this, void 0, void 0, function* () {
        if (otherOptions.tool === 'legacy') {
            throw new Error('Notarization with the legacy altool system was decommisioned as of November 2023');
        }
        yield (0, check_signature_1.checkSignatures)({ appPath });
        d('notarizing using notarytool');
        if (!(yield (0, notarytool_1.isNotaryToolAvailable)())) {
            throw new Error('notarytool is not available, you must be on at least Xcode 13 or provide notarytoolPath');
        }
        yield (0, notarytool_1.notarizeAndWaitForNotaryTool)(Object.assign({ appPath }, otherOptions));
        yield (0, promise_retry_1.default)(() => (0, staple_1.stapleApp)({ appPath }), {
            retries: 3,
        });
    });
}
exports.notarize = notarize;
//# sourceMappingURL=index.js.map