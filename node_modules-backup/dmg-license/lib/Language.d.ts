import { StringEncoding } from "iconv-corefoundation";
import Context from "./Context";
import Labels from "./Labels";
export declare class NoSuchLanguageError extends Error {
    lang: LangSpecs;
    constructor(lang: LangSpecs);
}
export declare abstract class Language {
    static byTag: {
        [langTag: string]: Language | undefined;
    };
    static byID: Array<Language | undefined>;
    static add(lang: Language): void;
    static bySpec(lang: LangSpecs, context?: Context): Language[];
    abstract charset: StringEncoding;
    abstract doubleByteCharset: boolean;
    abstract englishName: string;
    abstract labels?: Labels;
    abstract languageID: number;
    abstract langTags: string[];
    abstract localizedName: string;
    toString(): string;
}
export default Language;
export declare type LangSpec = string | number;
export declare type LangSpecs = LangSpec | LangSpec[];
export interface Localization {
    lang: LangSpecs;
}
declare namespace indexByLanguage {
    interface Options<T, U> {
        filter?(object: T): boolean;
        map?(object: T, lang: Language): U | undefined;
        onCollisions?(languageIDs: Set<number>): void;
    }
}
declare function indexByLanguage<T extends Localization>(objects: Iterable<T>, options?: indexByLanguage.Options<T, T> & {
    map?: never;
}): Map<number, T>;
declare function indexByLanguage<T extends Localization, U>(objects: Iterable<T>, options: indexByLanguage.Options<T, U> & {
    map(object: T, lang: Language): U;
}): Map<number, Exclude<U, undefined>>;
export { indexByLanguage };
