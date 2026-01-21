/// <reference types="node" />
import { LicenseSpec, Options } from ".";
import Context from "./Context";
export interface AssembledLicense {
    body: {
        data: Buffer;
        type: "RTF " | "TEXT";
    };
    labels: Buffer;
    languageIDs: number[];
}
export interface AssembledLicenseSet {
    inOrder: AssembledLicense[];
    byLanguageID: Map<number, AssembledLicense>;
    defaultLanguageID: number;
}
export default function assembleLicenses(spec: LicenseSpec, optionsOrContext: Options | Context): Promise<AssembledLicenseSet>;
