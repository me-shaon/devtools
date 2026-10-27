/** The URL scheme the app registers, as in devtoolsapp://open/json-viewer. */
export const DEEP_LINK_SCHEME = "devtoolsapp";

export type DeepLinkAction =
  | { type: "tool"; toolId: string }
  | { type: "search"; query: string }
  | { type: "home" };

/**
 * Reads a devtoolsapp:// link. Supported forms:
 * - devtoolsapp://open/<tool-id> (also devtoolsapp://tool/<tool-id>) opens a tool.
 * - devtoolsapp://search?q=<text> opens the command palette with that text.
 * - devtoolsapp:// or devtoolsapp://home shows the home page.
 * Returns null for other schemes, unknown tool ids, and malformed links.
 */
export function parseDeepLink(url: string, knownToolIds: ReadonlySet<string>): DeepLinkAction | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== `${DEEP_LINK_SCHEME}:`) return null;

  // The part after "//" is the host in some runtimes and part of the path in others.
  const segments = [parsed.hostname, ...parsed.pathname.split("/")]
    .map((segment) => decodeURIComponent(segment).trim())
    .filter(Boolean);
  const [action, target] = segments;

  if (!action || action === "home") return { type: "home" };
  if (action === "open" || action === "tool") {
    const toolId = target?.toLowerCase();
    return toolId && knownToolIds.has(toolId) ? { type: "tool", toolId } : null;
  }
  if (action === "search") {
    return { type: "search", query: (parsed.searchParams.get("q") ?? target ?? "").trim() };
  }
  return null;
}
