import { DEEP_LINK_SCHEME } from "@/utils/deep-link";

/** Bump when the shape changes, so launchers can tell old files apart. */
export const TOOL_MANIFEST_VERSION = 1;

export interface ToolManifest {
  version: number;
  appVersion: string;
  scheme: string;
  tools: { id: string; name: string; category: string; keywords: string[] }[];
}

/**
 * The tool list that launchers such as the Raycast extension read from the app data folder.
 * It always matches the installed version, so a launcher never lists a tool that cannot open.
 */
export function buildToolManifest(
  tools: readonly { id: string; name: string; category: string; keywords: readonly string[] }[],
  appVersion: string,
): ToolManifest {
  return {
    version: TOOL_MANIFEST_VERSION,
    appVersion,
    scheme: DEEP_LINK_SCHEME,
    tools: tools.map(({ id, name, category, keywords }) => ({ id, name, category, keywords: [...keywords] })),
  };
}
