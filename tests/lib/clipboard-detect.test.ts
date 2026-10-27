import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "@/app/toolRegistry";
import { detectPastedContent } from "@/utils/clipboard-detect";

const ids = new Set<string>([...ALL_TOOLS.map((tool) => tool.id), "certificate-decoder", "curl-to-code", "svg-to-css"]);
const first = (text: string) => detectPastedContent(text, ids)[0]?.toolId;

describe("detectPastedContent", () => {
  it("recognises common developer content", () => {
    expect(first("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U")).toBe("jwt-decoder");
    expect(first('{"name": "DevTools", "tools": [1, 2]}')).toBe("json-viewer");
    expect(detectPastedContent("{'name': 'Ada', 'admin': True}", ids)[0]).toMatchObject({ toolId: "json-viewer", label: "a data literal" });
    expect(first('{"id"=>1, :role=>:admin}')).toBe("json-viewer");
    expect(first("550e8400-e29b-41d4-a716-446655440000")).toBe("uuid-generator");
    expect(first("1761562800")).toBe("timestamp");
    expect(first("1761562800123")).toBe("timestamp");
    expect(first("1761562800123456")).toBe("timestamp");
    expect(first("1761562800123456789")).toBe("timestamp");
    expect(first("*/5 * * * *")).toBe("cron-calculator");
    expect(first("0 2 * * * /usr/bin/backup.sh --full")).toBe("cron-calculator");
    expect(first("0 0 12 ? * MON-FRI 2030")).toBe("cron-calculator");
    expect(first("@daily")).toBe("cron-calculator");
    expect(first("#3b82f6")).toBe("color-palette");
    expect(first("oklch(62.3% 0.188 259.8)")).toBe("color-palette");
    expect(first("0xDEADBEEF")).toBe("number-base");
    expect(first("0b1010_1010")).toBe("number-base");
    expect(first("https://example.com/search?q=dev%20tools")).toBe("url-encoder");
    expect(first("SGVsbG8sIERldlRvb2xzIHVzZXJzIQ==")).toBe("base64");
    expect(first("curl -X POST https://api.example.com -d 'a=1'")).toBe("curl-to-code");
    expect(first("SELECT id, name FROM users WHERE id = 1")).toBe("code-formatter");
    expect(first("-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----")).toBe("certificate-decoder");
    expect(first('a:1:{s:4:"name";s:3:"bob";}')).toBe("php-tools");
    expect(first('user|s:3:"bob";')).toBe("php-tools");
    expect(first("<?php\nreturn [\n    'debug' => true,\n];")).toBe("php-tools");
    expect(first("array('a' => 1)")).toBe("php-tools");
  });

  it("recognises compressed data in Base64", () => {
    expect(detectPastedContent("H4sIAAAAAAAAE6tWykvMTVWyUipKzUlNLE5V0lEqSy0qzszPU7IyrAUAtwLMOh4AAAA=", ids)[0]).toMatchObject({ toolId: "compression", label: "GZIP data" });
    expect(first("H4sIAAAAAAAAE6tWykvMTVWyUipKzUlNLE5V0lEq\nSy0qzszPU7IyrAUAtwLMOh4AAAA=")).toBe("compression");
    expect(first("SDRzSUFBQUFBQUFBRTZ0V3lrdk1UVld5VWlwS3pVbE5MRTVWMGxFcVN5MHF6c3pQVTdJeXJBVUF0d0xNT2g0QUFBQT0=")).toBe("compression");
    expect(detectPastedContent("eJzLSM3JyVfIQCcBaAMIsQ==", ids)[0]).toMatchObject({ toolId: "compression", label: "zlib data" });
    expect(first("eJustSomeWordsThatLookLikeBase64")).not.toBe("compression");
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

  it("sends TOML and .env files to the config converter", () => {
    const detect = (text: string) => detectPastedContent(text, ids)[0];
    expect(detect('[package]\nname = "demo"\nversion = "0.1.0"')).toMatchObject({ toolId: "yaml-json", label: "TOML" });
    expect(detect("# local\nDB_HOST=localhost\nexport DB_PORT=5432")).toMatchObject({ toolId: "yaml-json", label: ".env" });
    expect(detect("name: demo\nversion: 1")).toMatchObject({ toolId: "yaml-json", label: "YAML" });
    expect(first("PATH=/usr/bin")).toBeUndefined();
    expect(first("[link]\nsee the docs")).toBeUndefined();
  });

  it("sends a JSON Schema to the schema validator", () => {
    const suggestions = detectPastedContent('{"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object"}', ids);
    expect(suggestions[0]).toMatchObject({ toolId: "json-schema", label: "a JSON Schema" });
    expect(suggestions.map((s) => s.toolId)).toContain("json-viewer");
  });

  it("returns at most three suggestions, surest first", () => {
    const suggestions = detectPastedContent('{"a": 1}', ids);
    expect(suggestions.map((s) => s.toolId)).toEqual(["json-viewer", "json-typescript"]);
  });
});
