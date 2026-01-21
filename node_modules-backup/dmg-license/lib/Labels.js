"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const iconv_corefoundation_1 = require("iconv-corefoundation");
const smart_buffer_1 = require("smart-buffer");
const Context_1 = require("./Context");
const util_1 = require("./util");
const errors_1 = require("./util/errors");
const format_verror_1 = require("./util/format-verror");
const PromiseEach_1 = require("./util/PromiseEach");
const { freeze } = Object;
class NoDefaultLabelsError extends Error {
    constructor(lang, message) {
        super(message || `There are no default labels for ${lang.englishName}. You must provide your own labels for this language.`);
        this.lang = lang;
    }
}
exports.NoDefaultLabelsError = NoDefaultLabelsError;
NoDefaultLabelsError.prototype.name = NoDefaultLabelsError.name;
class LabelEncodingError extends format_verror_1.PrettyVError {
    constructor(labelDescription, lang, cause, ...params) {
        super({ cause: typeof cause === "string" ? undefined : cause }, `Cannot encode %s for %s${typeof cause === "string" ? "%s" : cause ? "" : "."}`, labelDescription, lang.englishName, typeof cause === "string" ? cause : undefined, ...params);
    }
}
exports.LabelEncodingError = LabelEncodingError;
LabelEncodingError.prototype.name = LabelEncodingError.name;
var Labels;
(function (Labels) {
    Labels.names = freeze(["languageName", "agree", "disagree", "print", "save", "message"]);
    Labels.descriptions = freeze({
        agree: "“Agree” button label",
        disagree: "“Disagree” button label",
        languageName: "Language name",
        message: "License agreement instructions text",
        print: "“Print” button label",
        save: "“Save” button label"
    });
    async function fromPromises(labels) {
        const labelPromises = [];
        const result = {};
        for (const key of Labels.names) {
            const p = labels[key];
            if (p) {
                labelPromises.push(p.then(label => {
                    result[key] = label;
                }));
            }
        }
        await PromiseEach_1.default(labelPromises);
        return result;
    }
    Labels.fromPromises = fromPromises;
    function mapAsync(labels, fun, options) {
        return fromPromises(map(labels, fun, options));
    }
    Labels.mapAsync = mapAsync;
    function map(labels, fun, { onNoLanguageName } = {}) {
        const result = {};
        Labels.forEach(labels, (label, key) => {
            result[key] = fun(label, key, labels);
        }, {
            onNoLanguageName: onNoLanguageName ? () => {
                result.languageName = onNoLanguageName();
            } : undefined
        });
        return result;
    }
    Labels.map = map;
    function forEach(labels, fun, { onNoLanguageName } = {}) {
        for (const name of Labels.names) {
            const label = labels[name];
            if (label === undefined && name === "languageName") {
                if (onNoLanguageName)
                    onNoLanguageName();
            }
            else
                fun(label, name, labels);
        }
    }
    Labels.forEach = forEach;
    function create(fun, { includeLanguageName = false } = {}) {
        const labels = {};
        Labels.names.forEach((key, index) => {
            if (includeLanguageName || key !== "languageName")
                labels[key] = fun(key, index);
        });
        return labels;
    }
    Labels.create = create;
    function createAsync(fun, options) {
        return fromPromises(create(fun, options));
    }
    Labels.createAsync = createAsync;
    /**
     * Prepares a label set for insertion into a disk image as a `STR#` resource.
     *
     * @remarks
     * Throws {@link LabelEncodingError} if there is a problem encoding some of the labels.
     *
     * Throws {@link verror#MultiError} if there is more than one error.
     *
     * @param labels - The label set to prepare.
     *
     * @param lang - The language to prepare the label set for. This determines the target character set.
     *
     * @returns A `Buffer` in `STR#` format.
     */
    function prepare(labels, lang) {
        const sbuf = new smart_buffer_1.SmartBuffer();
        function writeStr(string, description, isDefaultLanguageName = false) {
            let data;
            try {
                data = lang.charset.encode(string);
            }
            catch (e) {
                errors.add(isDefaultLanguageName && e instanceof iconv_corefoundation_1.NotRepresentableError ?
                    new NoDefaultLabelsError(lang, `The default languageName label for ${lang.englishName}, “${lang.localizedName}”, is not representable in ${lang.charset}, the native character set for that language. Please provide a languageName label for this language that is representable in that character set.`) :
                    new LabelEncodingError(description, lang, e));
                return;
            }
            const length = data.length;
            if (length > 255) {
                const e = new LabelEncodingError(description, lang, "the label is too large to write into a STR# resource. The maximum size is 255 bytes, but it is %d bytes.", length);
                e.text = data;
                errors.add(e);
                return;
            }
            if (errors.isEmpty) {
                sbuf.writeUInt8(length);
                sbuf.writeBuffer(data);
            }
        }
        // Magic
        sbuf.writeUInt16BE(6);
        // Labels
        const errors = new errors_1.ErrorBuffer();
        Labels.forEach(labels, (label, key) => writeStr(label, Labels.descriptions[key]), { onNoLanguageName() {
                // If no language name is provided, try the languageName in the built-in labels, or failing that, the language's localizedName.
                writeStr(lang.labels && lang.labels.languageName || lang.localizedName, Labels.descriptions.languageName, true);
            } });
        errors.check();
        return sbuf.toBuffer();
    }
    Labels.prepare = prepare;
    /**
     * Prepares the given language's default label set for insertion into a disk image as a `STR#` resource.
     *
     * @remarks
     * Throws {@link NoDefaultLabelsError} if there is no default label set for the given language.
     *
     * Throws {@link LabelEncodingError} if there is a problem encoding some of the labels.
     *
     * Throws a {@link verror#MultiError} if there is more than one error.
     *
     * @param lang - The language to prepare the label set for.
     *
     * @param contextOrOptions - Context of an existing {@link dmgLicense} run, or options for one (when calling this function standalone).
     *
     * @returns A `Buffer` in `STR#` format.
     */
    function prepareDefault(lang) {
        const labels = lang.labels;
        if (!labels)
            throw new NoDefaultLabelsError(lang);
        return Labels.prepare(labels, lang);
    }
    Labels.prepareDefault = prepareDefault;
    /**
     * Prepares a label set for insertion into a disk image as a `STR#` resource.
     *
     * @remarks
     * This function delegates to `prepareDefault` or `prepare` as appropriate.
     *
     * Throws {@link NoDefaultLabelsError} if `labels` is `null` or `undefined` and there is no default label set for the given language.
     *
     * Throws {@link LabelEncodingError} if there is a problem encoding some of the labels.
     *
     * Throws a {@link verror#MultiError} if there is more than one error.
     *
     * @param labels - An object describing the label set to prepare. If `null` or `undefined`, the default label set for the given language is used instead.
     *
     * @param lang - The language to prepare the label set for. This determines the target character set, and if `labels` is `null` or `undefined`, which language's default label set to use.
     *
     * @param contextOrOptions - Context of an existing {@link dmgLicense} run, or options for one (when calling this function standalone). Used to resolve relative paths if `labels` is a `LabelsSpec.LabelsRaw`.
     *
     * @returns A `Buffer` in `STR#` format.
     */
    async function prepareSpec(labels, lang, contextOrOptions) {
        if (!labels)
            return prepareDefault(lang);
        else if (labels.file) {
            const context = Context_1.default.from(contextOrOptions);
            return util_1.readFileP(context.resolvePath(labels.file));
        }
        else
            return prepare(labels, lang);
    }
    Labels.prepareSpec = prepareSpec;
})(Labels = exports.Labels || (exports.Labels = {}));
Object.defineProperty(Labels, Symbol.toStringTag, { value: "Labels" });
exports.default = Labels;
//# sourceMappingURL=Labels.js.map