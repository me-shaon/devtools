import { NotaryToolStartOptions } from './types';
export declare function isNotaryToolAvailable(notarytoolPath?: string): Promise<boolean>;
export declare function notarizeAndWaitForNotaryTool(opts: NotaryToolStartOptions): Promise<void>;
