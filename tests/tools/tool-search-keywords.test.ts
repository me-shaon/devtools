import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "@/app/toolRegistry";
import { searchTools } from "@/utils/tool-search";

const ids = (query: string) => searchTools([...ALL_TOOLS], query).map((tool) => tool.id);

describe("searchTools keywords", () => {
  it("finds tools by keyword", () => {
    expect(ids("sha")[0]).toBe("hash-generator");
    expect(ids("yml")[0]).toBe("yaml-json");
    expect(ids("YAML to JSON")[0]).toBe("yaml-json");
    expect(ids("toml")[0]).toBe("yaml-json");
    expect(ids("dotenv")[0]).toBe("yaml-json");
    expect(ids("properties")[0]).toBe("yaml-json");
    expect(ids("diff")[0]).toBe("text-compare");
    expect(ids("nanoid")[0]).toBe("random-string");
  });

  it("still ranks an exact name above a keyword match", () => {
    expect(ids("base64")[0]).toBe("base64");
    expect(ids("JSON Viewer")[0]).toBe("json-viewer");
  });

  it("does not match keywords fuzzily", () => {
    // "uid" is not a keyword prefix, so only name matches can find tools.
    expect(searchTools([{ id: "a", name: "Alpha", category: "X", keywords: ["unique id"] }], "qq")).toEqual([]);
  });

  it("gives every tool at least one keyword", () => {
    for (const tool of ALL_TOOLS) expect(tool.keywords.length, tool.id).toBeGreaterThan(0);
  });
});
