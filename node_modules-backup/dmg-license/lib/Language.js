"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const FS = require("fs");
const iconv_corefoundation_1 = require("iconv-corefoundation");
const Path = require("path");
const util_1 = require("./util");
class NoSuchLanguageError extends Error {
    constructor(lang) {
        super(`No known languages found for specification ${Array.isArray(lang) ? `[${lang.join(", ")}]` : lang}.`);
        this.lang = lang;
    }
}
exports.NoSuchLanguageError = NoSuchLanguageError;
NoSuchLanguageError.prototype.name = NoSuchLanguageError.name;
class Language {
    static add(lang) {
        Language.byID[lang.languageID] = lang;
        for (const tag of lang.langTags)
            Language.byTag[tag.toLowerCase()] = lang;
    }
    static bySpec(lang, context) {
        const langs = [];
        for (const specLang of util_1.arrayify(lang)) {
            const lang = typeof specLang === "number"
                ? Language.byID[specLang]
                : Language.byTag[specLang.toLowerCase()];
            if (lang)
                langs.push(lang);
            else if (context && context.canWarn)
                context.warning(new NoSuchLanguageError(specLang));
        }
        if (langs.length)
            return langs;
        else
            throw new NoSuchLanguageError(lang);
    }
    toString() {
        return `${this.englishName} (language ${this.languageID}${this.langTags.length === 0 ? "" : `; ${this.langTags.join(", ")}`})`;
    }
}
Language.byTag = {};
Language.byID = [];
exports.Language = Language;
exports.default = Language;
{
    const langJSON = JSON.parse(FS.readFileSync(Path.resolve(__dirname, "..", "language-info.json"), { encoding: "utf8" }));
    const labelsByName = {};
    for (const labelsName in langJSON.labels)
        labelsByName[labelsName] = langJSON.labels[labelsName];
    const charsetCache = new Map();
    for (const idStr in langJSON.languages) {
        const rawLang = langJSON.languages[idStr];
        const entry = new class extends Language {
            constructor() {
                super(...arguments);
                this.charset = (() => {
                    let charset = charsetCache.get(rawLang.charset);
                    if (!charset) {
                        charset = iconv_corefoundation_1.StringEncoding.byIANACharSetName(rawLang.charset);
                        charsetCache.set(rawLang.charset, charset);
                    }
                    return charset;
                })();
                this.doubleByteCharset = rawLang.doubleByteCharset || false;
                this.englishName = rawLang.englishName;
                this.labels = rawLang.labels ? labelsByName[rawLang.labels] : undefined;
                this.languageID = Number(idStr);
                this.langTags = rawLang.langTags;
                this.localizedName = rawLang.localizedName;
            }
        }();
        Language.add(entry);
    }
}
function indexByLanguage(objects, { filter, map, onCollisions } = {}) {
    const result = new Map();
    const seen = new Set();
    const collisions = onCollisions && new Set();
    for (const object of objects)
        if (!filter || filter(object))
            for (const lang of Language.bySpec(object.lang)) {
                const { languageID } = lang;
                if (seen.has(languageID)) {
                    if (collisions)
                        collisions.add(languageID);
                }
                else {
                    seen.add(languageID);
                    const mapped = map ? map(object, lang) : object;
                    if (mapped !== undefined)
                        result.set(lang.languageID, mapped);
                }
            }
    if (collisions && collisions.size)
        onCollisions(collisions);
    return result;
}
exports.indexByLanguage = indexByLanguage;
//# sourceMappingURL=Language.js.map