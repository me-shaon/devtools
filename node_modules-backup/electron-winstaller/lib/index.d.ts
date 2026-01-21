import { SquirrelWindowsOptions } from './options';
export { SquirrelWindowsOptions } from './options';
export { SquirrelWindowsOptions as Options } from './options';
/**
 * A utility function to convert SemVer version strings into NuGet-compatible
 * version strings.
 * @param version A SemVer version string
 * @returns A NuGet-compatible version string
 * @see {@link https://semver.org/ | Semantic Versioning specification}
 * @see {@link https://learn.microsoft.com/en-us/nuget/concepts/package-versioning?tabs=semver20sort | NuGet versioning specification}
 */
export declare function convertVersion(version: string): string;
/**
 * This package's main function, which creates a Squirrel.Windows executable
 * installer and optionally code-signs the output.
 *
 * @param options Options for installer generation and signing
 * @see {@link https://github.com/Squirrel/Squirrel.Windows | Squirrel.Windows}
 */
export declare function createWindowsInstaller(options: SquirrelWindowsOptions): Promise<void>;
