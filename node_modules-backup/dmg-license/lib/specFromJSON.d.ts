import { LicenseSpec, Options as MainOptions } from ".";
import { PrettyVError as PrettyVError } from "./util/format-verror";
export declare class BadJSONLicenseSpecError extends PrettyVError {
}
export default function specFromJSON(spec: string | object, options?: FromJSONOptions): LicenseSpec;
export interface FromJSONOptions extends MainOptions {
    specSourceURL?: string;
}
