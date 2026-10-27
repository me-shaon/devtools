import { describe, expect, it } from "vitest";
import { parseDeepLink } from "@/utils/deep-link";

const known = new Set(["json-viewer", "hash-generator"]);

describe("parseDeepLink", () => {
  it("opens a known tool", () => {
    expect(parseDeepLink("devtoolsapp://open/json-viewer", known)).toEqual({ type: "tool", toolId: "json-viewer" });
    expect(parseDeepLink("devtoolsapp://tool/hash-generator", known)).toEqual({ type: "tool", toolId: "hash-generator" });
    expect(parseDeepLink("devtoolsapp://open/JSON-Viewer/", known)).toEqual({ type: "tool", toolId: "json-viewer" });
  });

  it("rejects unknown tools, other schemes, and malformed links", () => {
    expect(parseDeepLink("devtoolsapp://open/not-a-tool", known)).toBeNull();
    expect(parseDeepLink("devtoolsapp://open", known)).toBeNull();
    expect(parseDeepLink("https://open/json-viewer", known)).toBeNull();
    expect(parseDeepLink("devtoolsapp://delete/everything", known)).toBeNull();
    expect(parseDeepLink("not a url", known)).toBeNull();
  });

  it("opens the command palette with a query", () => {
    expect(parseDeepLink("devtoolsapp://search?q=yaml%20json", known)).toEqual({ type: "search", query: "yaml json" });
    expect(parseDeepLink("devtoolsapp://search/hash", known)).toEqual({ type: "search", query: "hash" });
    expect(parseDeepLink("devtoolsapp://search", known)).toEqual({ type: "search", query: "" });
  });

  it("shows the home page", () => {
    expect(parseDeepLink("devtoolsapp://", known)).toEqual({ type: "home" });
    expect(parseDeepLink("devtoolsapp://home", known)).toEqual({ type: "home" });
  });
});
