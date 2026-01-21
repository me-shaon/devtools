"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const iconv_corefoundation_1 = require("iconv-corefoundation");
const Context_1 = require("./Context");
const util_1 = require("./util");
const format_verror_1 = require("./util/format-verror");
var BodySpec;
(function (BodySpec) {
    async function prepare(spec, lang, contextOrOptions = {}) {
        const context = Context_1.default.from(contextOrOptions);
        const fpath = spec.file && context.resolvePath(spec.file);
        function encodeBodyText(text) {
            try {
                if (typeof text === "string")
                    return lang.charset.encode(text);
                else
                    return iconv_corefoundation_1.transcode(text, spec.charset || "UTF-8", lang.charset);
            }
            catch (e) {
                throw new format_verror_1.PrettyVError(e, "Cannot encode %s license text", lang.englishName);
            }
        }
        let data;
        if (fpath) {
            let ftext;
            try {
                ftext = await util_1.readFileP(fpath);
            }
            catch (e) {
                throw new format_verror_1.PrettyVError(e, "Cannot read %s license text from “%s”", lang.englishName, fpath);
            }
            data = encodeBodyText(ftext);
        }
        else
            data = encodeBodyText(spec.text);
        let type;
        if (spec.type === "rtf" || (fpath && fpath.endsWith(".rtf")))
            type = "RTF ";
        else
            type = "TEXT";
        return { data, type };
    }
    BodySpec.prepare = prepare;
})(BodySpec = exports.BodySpec || (exports.BodySpec = {}));
Object.defineProperty(BodySpec, Symbol.toStringTag, { value: "BodySpec" });
exports.default = BodySpec;
//# sourceMappingURL=BodySpec.js.map