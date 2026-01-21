import { SquirrelWindowsOptions } from './options';
/**
 * This method uses @electron/windows-sign to create a fake signtool.exe
 * that can be called by Squirrel - but then just calls @electron/windows-sign
 * to actually perform the signing.
 *
 * That's useful for users who need a high degree of customization of the signing
 * process but still want to use @electron/windows-installer.
 */
export declare function createSignTool(options: SquirrelWindowsOptions): Promise<void>;
/**
 * Ensure that signtool.exe is actually the "real" signtool.exe, not our
 * fake substitute.
 */
export declare function resetSignTool(): Promise<void>;
