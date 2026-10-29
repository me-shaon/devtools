import { describe, it, expect } from "vitest";
import { ALL_TOOLS, TOOL_COMPONENTS } from "@/app/toolRegistry";
import { buildToolManifest } from "@/utils/tool-manifest";
import { parseDeepLink } from "@/utils/deep-link";
describe("tool registration", () => {
  it.each([
    "xml-inspector",
    "checksum",
    "asn1-inspector",
    "stopwatch",
  ] as const)("registers %s for discovery and lazy loading", (id) => {
    expect(ALL_TOOLS.find((t) => t.id === id)?.keywords.length).toBeGreaterThan(
      0,
    );
    expect(TOOL_COMPONENTS[id]).toBeDefined();
    expect(
      buildToolManifest(ALL_TOOLS, "test").tools.some((t) => t.id === id),
    ).toBe(true);
    expect(
      parseDeepLink(
        `devtoolsapp://open/${id}`,
        new Set(ALL_TOOLS.map((t) => t.id)),
      ),
    ).toMatchObject({ type: "tool", toolId: id });
  });
});
