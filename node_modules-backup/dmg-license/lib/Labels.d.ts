/// <reference types="node" />
import { Options } from ".";
import Context from "./Context";
import Language, { Localization } from "./Language";
import { PrettyVError } from "./util/format-verror";
export declare class NoDefaultLabelsError extends Error {
    readonly lang: Language;
    constructor(lang: Language, message?: string);
}
export declare class LabelEncodingError extends PrettyVError {
    text?: Buffer;
    constructor(labelDescription: string, lang: Language, cause?: Error | string, ...params: unknown[]);
}
export interface Labels<T = string> {
    languageName?: T;
    agree: T;
    disagree: T;
    print: T;
    save: T;
    message: T;
}
export declare namespace Labels {
    type WithLanguageName<T = string> = Labels<T> & {
        languageName: T;
    };
    type WithoutLanguageName<T = string> = Labels<T> & {
        languageName?: never;
    };
    const names: readonly ("message" | "languageName" | "agree" | "disagree" | "print" | "save")[];
    const descriptions: Readonly<{
        languageName: string;
        agree: string;
        disagree: string;
        print: string;
        save: string;
        message: string;
    }>;
    function fromPromises<T>(labels: Labels.WithoutLanguageName<Promise<T>>): Promise<Labels.WithoutLanguageName<T>>;
    function fromPromises<T>(labels: Labels.WithLanguageName<Promise<T>>): Promise<Labels.WithLanguageName<T>>;
    function fromPromises<T>(labels: Labels<Promise<T>>): Promise<Labels<T>>;
    interface MapOptions<T, U> {
        onNoLanguageName?(): U;
    }
    function mapAsync<T, U>(labels: Labels.WithLanguageName<T>, fun: (label: T, key: keyof Labels, labels: Labels<T>) => Promise<U>, options?: MapOptions<T, Promise<U>>): Promise<Labels.WithLanguageName<U>>;
    function mapAsync<T, U>(labels: Labels.WithoutLanguageName<T>, fun: (label: T, key: keyof Labels, labels: Labels<T>) => Promise<U>, options?: MapOptions<T, Promise<U>> & {
        onNoLanguageName?: never;
    }): Promise<Labels.WithoutLanguageName<U>>;
    function mapAsync<T, U>(labels: Labels<T>, fun: (label: T, key: keyof Labels, labels: Labels<T>) => Promise<U>, options: MapOptions<T, Promise<U>> & {
        onNoLanguageName(): Promise<U>;
    }): Promise<Labels.WithLanguageName<U>>;
    function mapAsync<T, U>(labels: Labels<T>, fun: (label: T, key: keyof Labels, labels: Labels<T>) => Promise<U>, options?: MapOptions<T, Promise<U>>): Promise<Labels<U>>;
    function map<T, U>(labels: Labels.WithLanguageName<T>, fun: (label: T, key: keyof Labels, labels: Labels<T>) => U, options?: MapOptions<T, U>): Labels.WithLanguageName<U>;
    function map<T, U>(labels: Labels.WithoutLanguageName<T>, fun: (label: T, key: keyof Labels, labels: Labels<T>) => U, options?: MapOptions<T, U> & {
        onNoLanguageName?: never;
    }): Labels.WithoutLanguageName<U>;
    function map<T, U>(labels: Labels<T>, fun: (label: T, key: keyof Labels, labels: Labels<T>) => U, options: MapOptions<T, U> & {
        onNoLanguageName(): U;
    }): Labels.WithLanguageName<U>;
    function map<T, U>(labels: Labels<T>, fun: (label: T, key: keyof Labels, labels: Labels<T>) => U, options?: MapOptions<T, U>): Labels<U>;
    interface ForEachOptions {
        onNoLanguageName?(): void;
    }
    function forEach<T>(labels: Labels<T>, fun: (label: T, key: keyof Labels, labels: Labels<T>) => void, { onNoLanguageName }?: ForEachOptions): void;
    interface CreateOptions {
        includeLanguageName?: boolean;
    }
    function create<T>(fun: (key: keyof Labels, index: number) => T, options: CreateOptions & {
        includeLanguageName: true;
    }): Labels.WithLanguageName<T>;
    function create<T>(fun: (key: keyof Labels, index: number) => T, options?: CreateOptions & {
        includeLanguageName?: false;
    }): Labels.WithoutLanguageName<T>;
    function create<T>(fun: (key: keyof Labels, index: number) => T, options?: CreateOptions): Labels<T>;
    function createAsync<T>(fun: (key: keyof Labels, index: number) => Promise<T>, options: CreateOptions & {
        includeLanguageName: true;
    }): Promise<Labels.WithLanguageName<T>>;
    function createAsync<T>(fun: (key: keyof Labels, index: number) => Promise<T>, options?: CreateOptions & {
        includeLanguageName?: false;
    }): Promise<Labels.WithoutLanguageName<T>>;
    function createAsync<T>(fun: (key: keyof Labels, index: number) => Promise<T>, options?: CreateOptions): Promise<Labels<T>>;
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
    function prepare(labels: Labels, lang: Language): Buffer;
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
    function prepareDefault(lang: Language): Buffer;
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
    function prepareSpec(labels: LabelsSpec | null | undefined, lang: Language, contextOrOptions: Context | Options): Promise<Buffer>;
}
export default Labels;
export interface NoLabels extends Partial<Labels<undefined>> {
}
export declare type LabelsSpec = LabelsSpec.LabelsInline | LabelsSpec.LabelsRaw;
export declare namespace LabelsSpec {
    interface LabelsInline extends Localization, Labels {
        file?: never;
    }
    interface LabelsRaw extends Localization, NoLabels {
        file: string;
    }
}
