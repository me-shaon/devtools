/// <reference types="node" />
import { Localization, Options } from ".";
import Context from "./Context";
import Language from "./Language";
export declare type BodySpec = BodySpec.BodyInline | BodySpec.BodyInFile;
export declare namespace BodySpec {
    interface BaseBodySpec extends Localization {
        type?: "rtf" | "plain";
    }
    interface BodyInline extends BaseBodySpec {
        charset?: never;
        file?: never;
        text: string;
    }
    interface BodyInFile extends BaseBodySpec {
        charset?: "UTF-8" | string;
        file: string;
        text?: never;
    }
    function prepare(spec: BodySpec, lang: Language, contextOrOptions?: Context | Options): Promise<{
        data: Buffer;
        type: "RTF " | "TEXT";
    }>;
}
export default BodySpec;
