import * as Plist from "plist";
import { PlistObject } from "plist";
import BodySpec from "./BodySpec";
import { Labels, LabelsSpec, NoLabels } from "./Labels";
import { LangSpec, LangSpecs, Localization } from "./Language";
import { FromJSONOptions } from "./specFromJSON";
export { Language } from "./Language";
export { BadJSONLicenseSpecError } from "./specFromJSON";
export { FromJSONOptions, Labels, NoLabels, BodySpec, LabelsSpec, LangSpec, LangSpecs, Localization };
export { LabelEncodingError, NoDefaultLabelsError } from "./Labels";
export interface LicenseSpec {
    body: BodySpec[];
    labels?: LabelsSpec.LabelsInline[];
    rawLabels?: LabelsSpec.LabelsRaw[];
    defaultLang?: LangSpec;
}
export interface Options {
    resolvePath?(path: string): string;
    onNonFatalError?(error: Error): void;
}
export declare function dmgLicense(imagePath: string, spec: LicenseSpec, options: Options): Promise<void>;
export default dmgLicense;
export declare function dmgLicensePlist(spec: LicenseSpec, options: Options): Promise<{
    plist: PlistObject;
    plistText: string;
}>;
export declare function dmgLicenseFromJSON(imagePath: string, specJSON: string | object, options: FromJSONOptions): Promise<void>;
export declare function dmgLicensePlistFromJSON(specJSON: string | object, options: FromJSONOptions): Promise<{
    plist: Plist.PlistObject;
    plistText: string;
}>;
