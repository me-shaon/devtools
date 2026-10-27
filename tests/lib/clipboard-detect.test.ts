import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "@/app/toolRegistry";
import { detectPastedContent } from "@/utils/clipboard-detect";

const ids = new Set<string>([...ALL_TOOLS.map((tool) => tool.id), "certificate-decoder", "curl-to-code", "svg-to-css"]);
const first = (text: string) => detectPastedContent(text, ids)[0]?.toolId;

describe("detectPastedContent", () => {
  it("recognises common developer content", () => {
    expect(first("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U")).toBe("jwt-decoder");
    expect(first('{"name": "DevTools", "tools": [1, 2]}')).toBe("json-viewer");
    expect(first("550e8400-e29b-41d4-a716-446655440000")).toBe("uuid-generator");
    expect(first("1761562800")).toBe("timestamp");
    expect(first("1761562800123")).toBe("timestamp");
    expect(first("*/5 * * * *")).toBe("cron-calculator");
    expect(first("#3b82f6")).toBe("color-palette");
    expect(first("https://example.com/search?q=dev%20tools")).toBe("url-encoder");
    expect(first("SGVsbG8sIERldlRvb2xzIHVzZXJzIQ==")).toBe("base64");
    expect(first("curl -X POST https://api.example.com -d 'a=1'")).toBe("curl-to-code");
    expect(first("SELECT id, name FROM users WHERE id = 1")).toBe("code-formatter");
    expect(first("-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----")).toBe("certificate-decoder");
  });

  it("ignores plain text, hex digests, and numbers that are not timestamps", () => {
    expect(first("hello world")).toBeUndefined();
    expect(first("d41d8cd98f00b204e9800998ecf8427e")).toBeUndefined();
    expect(first("42")).toBeUndefined();
    expect(first("9999999999999")).toBeUndefined();
    expect(first("abcdefghijklmnopqrst")).toBeUndefined();
  });

  it("only suggests tools that exist", () => {
    expect(detectPastedContent("curl https://example.com", new Set(["json-viewer"]))).toEqual([]);
  });

  it("returns at most three suggestions, surest first", () => {
    const suggestions = detectPastedContent('{"a": 1}', ids);
    expect(suggestions.map((s) => s.toolId)).toEqual(["json-viewer", "json-typescript"]);
  });
});
