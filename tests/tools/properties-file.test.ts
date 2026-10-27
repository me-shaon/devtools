import { describe, expect, it } from "vitest";
import { expandKeys, formatProperties, parseProperties, propertiesKey } from "@/utils/properties-file";
import { ConversionError } from "@/utils/conversion-error";

describe("parseProperties", () => {
  it("reads =, :, and whitespace separators and skips comments", () => {
    const text = "# comment\n! also a comment\na=1\nb: 2\nc 3\n  d = four  \n\n";
    expect(parseProperties(text)).toEqual([["a", "1"], ["b", "2"], ["c", "3"], ["d", "four  "]]);
  });

  it("joins lines that end with a backslash and drops the next line's indent", () => {
    expect(parseProperties("list=a, \\\n    b, \\\n    c\nnext=1")).toEqual([["list", "a, b, c"], ["next", "1"]]);
  });

  it("does not join a line that ends with an escaped backslash", () => {
    expect(parseProperties("path=C:\\\\\nnext=1")).toEqual([["path", "C:\\"], ["next", "1"]]);
  });

  it("unescapes keys and values, including unicode escapes", () => {
    expect(parseProperties("my\\ key\\=x=tab\\there\\nnew \\u00e9\\u4e2d \\q")).toEqual([["my key=x", "tab\there\nnew é中 q"]]);
  });

  it("accepts a key with no value", () => {
    expect(parseProperties("empty\nalso=")).toEqual([["empty", ""], ["also", ""]]);
  });

  it("keeps the last value for a duplicate key in the first key's place", () => {
    expect(parseProperties("a=1\nb=2\na=3")).toEqual([["a", "3"], ["b", "2"]]);
  });

  it("reports an invalid unicode escape with its line", () => {
    try {
      parseProperties("a=1\nb=\\u12g4");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConversionError);
      expect((error as ConversionError).line).toBe(2);
      expect((error as Error).message).toMatch(/^Line 2, column 1: .*\\u/);
    }
  });
});

describe("expandKeys", () => {
  it("nests dot keys and turns [n] into arrays", () => {
    const entries: [string, string][] = [
      ["server.port", "8080"],
      ["spring.datasource.url", "jdbc:x"],
      ["spring.datasource.username", "sa"],
      ["app.hosts[0]", "a"],
      ["app.hosts[1]", "b"],
      ["app.users[0].name", "ann"],
    ];
    expect(expandKeys(entries)).toEqual({
      server: { port: "8080" },
      spring: { datasource: { url: "jdbc:x", username: "sa" } },
      app: { hosts: ["a", "b"], users: [{ name: "ann" }] },
    });
  });

  it("keeps keys with empty parts as they are", () => {
    expect(expandKeys([["a..b", "1"], [".x", "2"]])).toEqual({ "a..b": "1", ".x": "2" });
  });

  it("reports a key that is both a value and a parent", () => {
    expect(() => expandKeys([["a", "1"], ["a.b", "2"]])).toThrow(/"a.b".*"a"/);
  });
});

describe("formatProperties", () => {
  it("escapes special characters and non-ASCII text", () => {
    expect(formatProperties([["my key:x", " lead\nline é"], ["path", "C:\\tmp"]])).toBe(
      "my\\ key\\:x=\\ lead\\nline \\u00e9\npath=C:\\\\tmp\n",
    );
  });

  it("round trips through parseProperties", () => {
    const entries: [string, string][] = [["a b=c", "x = y # z"], ["u", "中\t!"]];
    expect(parseProperties(formatProperties(entries))).toEqual(entries);
  });
});

describe("propertiesKey", () => {
  it("joins names with dots and indexes with brackets", () => {
    expect(propertiesKey(["app", "users", 0, "name"])).toBe("app.users[0].name");
  });
});
