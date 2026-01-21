"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crc_1 = require("crc");
const _1 = require(".");
const Context_1 = require("./Context");
const Labels_1 = require("./Labels");
const Language_1 = require("./Language");
const errors_1 = require("./util/errors");
const PromiseEach_1 = require("./util/PromiseEach");
function warnAboutLanguageIDCollisions(kind, errors, context) {
    return (languageIDs) => {
        const plural = languageIDs.size !== 1;
        context.warning(new Error(`More than one ${kind} was assigned to the language${plural ? "s" : ""} ${Array.from(languageIDs)
            .map(languageID => {
            const language = Language_1.default.byID[languageID];
            return `${language.englishName} (${language.langTags.join("; ")})`;
        })
            .join(", ")}. ${plural ? "In each case, t" : "T"}he first applicable ${kind} has been used.`), errors);
    };
}
function hashAssembledLicense(content) {
    return [content.body.type, content.body.data, content.labels].reduce((hash, next) => crc_1.crc32(next, hash), 0);
}
function assembledLicensesEqual(a, b) {
    return a.body.type === b.body.type
        && a.body.data.equals(b.body.data)
        && a.labels.equals(b.labels);
}
async function assembleLoadedLicenses(bodies, labelSets, errors, context) {
    const assembled = new Map();
    for (const [languageID, bodyPromise] of bodies) {
        try {
            const [body, labels] = await PromiseEach_1.default([
                bodyPromise,
                labelSets(Language_1.default.byID[languageID])
            ]);
            assembled.set(languageID, {
                body,
                labels,
                languageIDs: [languageID]
            });
        }
        catch (e) {
            errors.add(e);
        }
    }
    const hashes = new Map();
    for (const license of assembled.values()) {
        const hash = hashAssembledLicense(license);
        const withThisHash = hashes.get(hash);
        if (!withThisHash)
            hashes.set(hash, [license]);
        else {
            let hashCollision = true;
            for (const other of withThisHash)
                if (assembledLicensesEqual(license, other)) {
                    hashCollision = false;
                    other.languageIDs.push(...license.languageIDs);
                    for (const languageID of license.languageIDs)
                        assembled.set(languageID, other);
                    break;
                }
            if (hashCollision)
                withThisHash.push(license);
        }
    }
    return assembled;
}
function chooseDefaultLanguageID(spec, outputs, context) {
    // Use the configured default language, if available.
    {
        const configuredDefaultLanguage = spec.defaultLang;
        switch (typeof configuredDefaultLanguage) {
            case "number":
                return configuredDefaultLanguage;
            case "string":
                const lookup = Language_1.default.bySpec(configuredDefaultLanguage, context)[0];
                if (lookup)
                    return lookup.languageID;
        }
    }
    // Use the first language of the first license body section.
    for (const body of spec.body)
        for (const lang of Language_1.default.bySpec(body.lang))
            return lang.languageID;
    // Just pick one arbitrarily. This should never happen, but just in case.
    for (const output of outputs)
        for (const lang of output.languageIDs)
            return lang;
}
function labelCache(spec, errors, context) {
    const labelSpecs = Language_1.indexByLanguage(function* () {
        const { labels, rawLabels } = spec;
        if (labels)
            for (const label of labels)
                yield label;
        if (rawLabels)
            for (const label of rawLabels)
                yield label;
    }(), {
        onCollisions: warnAboutLanguageIDCollisions("label set", errors, context)
    });
    const preparedCache = new Map();
    return (lang) => {
        const { languageID } = lang;
        let result = preparedCache.get(languageID);
        if (!result) {
            result = Labels_1.default.prepareSpec(labelSpecs.get(languageID), lang, context);
            preparedCache.set(languageID, result);
        }
        return result;
    };
}
async function assembleLicenses(spec, optionsOrContext) {
    const context = optionsOrContext instanceof Context_1.default ? optionsOrContext : new Context_1.default(optionsOrContext);
    const errors = new errors_1.ErrorBuffer();
    const labelSets = labelCache(spec, errors, context);
    const bodies = Language_1.indexByLanguage(spec.body, {
        map: (body, lang) => _1.BodySpec.prepare(body, lang, context),
        onCollisions: warnAboutLanguageIDCollisions("license body", errors, context)
    });
    if (!bodies.size)
        errors.throw(new Error("No license bodies were provided."));
    let result;
    try {
        const assembled = await assembleLoadedLicenses(bodies, labelSets, errors, context);
        const inOrder = Array.from(assembled.values());
        const defaultLanguageID = chooseDefaultLanguageID(spec, inOrder, context);
        result = {
            byLanguageID: assembled,
            defaultLanguageID,
            inOrder
        };
    }
    catch (e) {
        errors.add(e);
    }
    errors.check();
    return result;
}
exports.default = assembleLicenses;
//# sourceMappingURL=assembleLicenses.js.map