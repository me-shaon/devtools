"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetSignTool = exports.createSignTool = void 0;
var path_1 = __importDefault(require("path"));
var semver_1 = __importDefault(require("semver"));
var fs_extra_1 = __importDefault(require("fs-extra"));
var VENDOR_PATH;
var ORIGINAL_SIGN_TOOL_PATH;
var BACKUP_SIGN_TOOL_PATH;
var SIGN_LOG_PATH;
/**
 * This method uses @electron/windows-sign to create a fake signtool.exe
 * that can be called by Squirrel - but then just calls @electron/windows-sign
 * to actually perform the signing.
 *
 * That's useful for users who need a high degree of customization of the signing
 * process but still want to use @electron/windows-installer.
 */
function createSignTool(options) {
    return __awaiter(this, void 0, void 0, function () {
        var createSeaSignTool;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!options.windowsSign) {
                        throw new Error('Signtool should only be created if windowsSign options are set');
                    }
                    VENDOR_PATH = options.vendorDirectory || path_1.default.join(__dirname, '..', 'vendor');
                    ORIGINAL_SIGN_TOOL_PATH = path_1.default.join(VENDOR_PATH, 'signtool.exe');
                    BACKUP_SIGN_TOOL_PATH = path_1.default.join(VENDOR_PATH, 'signtool-original.exe');
                    SIGN_LOG_PATH = path_1.default.join(VENDOR_PATH, 'electron-windows-sign.log');
                    return [4 /*yield*/, getCreateSeaSignTool()];
                case 1:
                    createSeaSignTool = _a.sent();
                    return [4 /*yield*/, resetSignTool()];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, fs_extra_1.default.remove(SIGN_LOG_PATH)];
                case 3:
                    _a.sent();
                    // Make a backup of signtool.exe
                    return [4 /*yield*/, fs_extra_1.default.copy(ORIGINAL_SIGN_TOOL_PATH, BACKUP_SIGN_TOOL_PATH, { overwrite: true })];
                case 4:
                    // Make a backup of signtool.exe
                    _a.sent();
                    // Create a new signtool.exe using @electron/windows-sign
                    return [4 /*yield*/, createSeaSignTool({
                            path: ORIGINAL_SIGN_TOOL_PATH,
                            windowsSign: options.windowsSign
                        })];
                case 5:
                    // Create a new signtool.exe using @electron/windows-sign
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
exports.createSignTool = createSignTool;
/**
 * Ensure that signtool.exe is actually the "real" signtool.exe, not our
 * fake substitute.
 */
function resetSignTool() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!fs_extra_1.default.existsSync(BACKUP_SIGN_TOOL_PATH)) return [3 /*break*/, 3];
                    // Reset the backup of signtool.exe
                    return [4 /*yield*/, fs_extra_1.default.copy(BACKUP_SIGN_TOOL_PATH, ORIGINAL_SIGN_TOOL_PATH, { overwrite: true })];
                case 1:
                    // Reset the backup of signtool.exe
                    _a.sent();
                    return [4 /*yield*/, fs_extra_1.default.remove(BACKUP_SIGN_TOOL_PATH)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
exports.resetSignTool = resetSignTool;
/**
 * @electron/windows-installer only requires Node.js >= 8.0.0.
 * @electron/windows-sign requires Node.js >= 16.0.0.
 * @electron/windows-sign's "fake signtool.exe" feature requires
 * Node.js >= 20.0.0, the first version to contain the "single
 * executable" feature with proper support.
 *
 * Since this is overall a very niche feature and only benefits
 * consumers with rather advanced codesigning needs, we did not
 * want to make Node.js v18 a hard requirement for @electron/windows-installer.
 *
 * Instead, @electron/windows-sign is an optional dependency - and
 * if it didn't install, we'll throw a useful error here.
 *
 * @returns
 */
function getCreateSeaSignTool() {
    return __awaiter(this, void 0, void 0, function () {
        var createSeaSignTool, error_1, message;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('@electron/windows-sign')); })];
                case 1:
                    createSeaSignTool = (_a.sent()).createSeaSignTool;
                    return [2 /*return*/, createSeaSignTool];
                case 2:
                    error_1 = _a.sent();
                    message = 'In order to use windowsSign options, @electron/windows-sign must be installed as a dependency.';
                    if (semver_1.default.lte(process.version, '20.0.0')) {
                        message += " You are currently using Node.js ".concat(process.version, ". Please upgrade to Node.js 19 or later and reinstall all dependencies to ensure that @electron/windows-sign is available.");
                    }
                    else {
                        message += " ".concat(error_1);
                    }
                    throw new Error(message);
                case 3: return [2 /*return*/];
            }
        });
    });
}
//# sourceMappingURL=sign.js.map