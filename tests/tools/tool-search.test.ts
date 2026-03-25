import { describe, expect, it } from "vitest";
import { searchTools } from "@/utils/tool-search";

const tools = [
  { id: "json-viewer", name: "JSON Viewer", category: "Development Tools" },
  { id: "json-typescript", name: "JSON to TypeScript", category: "Development Tools" },
  { id: "image-converter", name: "Image Converter", category: "Media" },
];

describe("tool search", () => {
  it("prioritizes direct name matches", () => {
    const results = searchTools(tools, "json");

    expect(results[0]?.id).toBe("json-viewer");
    expect(results[1]?.id).toBe("json-typescript");
  });

  it("supports fuzzy subsequence matching", () => {
    const results = searchTools(tools, "imgcnv");

    expect(results[0]?.id).toBe("image-converter");
  });

  it("matches category names too", () => {
    const results = searchTools(tools, "media");

    expect(results[0]?.id).toBe("image-converter");
  });
});
