import { describe, it, expect } from "vitest";
import {
  phpUnserialize,
  formatPrintR,
  formatVarDump,
  isValidSerialized,
} from "@/utils/php-unserialize";

describe("PHP Unserialize Utils", () => {
  describe("phpUnserialize", () => {
    it("should parse a simple string", () => {
      const result = phpUnserialize('s:5:"hello";');
      expect(result).toEqual({ type: "string", value: "hello" });
    });

    it("should parse an empty string", () => {
      const result = phpUnserialize('s:0:"";');
      expect(result).toEqual({ type: "string", value: "" });
    });

    it("should parse an integer", () => {
      const result = phpUnserialize("i:42;");
      expect(result).toEqual({ type: "int", value: 42 });
    });

    it("should parse a negative integer", () => {
      const result = phpUnserialize("i:-7;");
      expect(result).toEqual({ type: "int", value: -7 });
    });

    it("should parse zero integer", () => {
      const result = phpUnserialize("i:0;");
      expect(result).toEqual({ type: "int", value: 0 });
    });

    it("should parse a float", () => {
      const result = phpUnserialize("d:3.14;");
      expect(result).toEqual({ type: "float", value: 3.14 });
    });

    it("should parse a negative float", () => {
      const result = phpUnserialize("d:-2.5;");
      expect(result).toEqual({ type: "float", value: -2.5 });
    });

    it("should parse boolean true", () => {
      const result = phpUnserialize("b:1;");
      expect(result).toEqual({ type: "bool", value: true });
    });

    it("should parse boolean false", () => {
      const result = phpUnserialize("b:0;");
      expect(result).toEqual({ type: "bool", value: false });
    });

    it("should parse null", () => {
      const result = phpUnserialize("N;");
      expect(result).toEqual({ type: "null" });
    });

    it("should parse an indexed array", () => {
      const result = phpUnserialize(
        'a:2:{i:0;s:5:"Apple";i:1;s:6:"Orange";}',
      );
      expect(result).toEqual({
        type: "array",
        entries: [
          {
            key: { type: "int", value: 0 },
            value: { type: "string", value: "Apple" },
          },
          {
            key: { type: "int", value: 1 },
            value: { type: "string", value: "Orange" },
          },
        ],
      });
    });

    it("should parse an associative array", () => {
      const result = phpUnserialize(
        'a:2:{s:4:"name";s:5:"Alice";s:3:"age";i:30;}',
      );
      expect(result).toEqual({
        type: "array",
        entries: [
          {
            key: { type: "string", value: "name" },
            value: { type: "string", value: "Alice" },
          },
          {
            key: { type: "string", value: "age" },
            value: { type: "int", value: 30 },
          },
        ],
      });
    });

    it("should parse a nested array (user example)", () => {
      const input =
        'a:2:{i:0;s:12:"Sample array";i:1;a:2:{i:0;s:5:"Apple";i:1;s:6:"Orange";}}';
      const result = phpUnserialize(input);
      expect(result).toEqual({
        type: "array",
        entries: [
          {
            key: { type: "int", value: 0 },
            value: { type: "string", value: "Sample array" },
          },
          {
            key: { type: "int", value: 1 },
            value: {
              type: "array",
              entries: [
                {
                  key: { type: "int", value: 0 },
                  value: { type: "string", value: "Apple" },
                },
                {
                  key: { type: "int", value: 1 },
                  value: { type: "string", value: "Orange" },
                },
              ],
            },
          },
        ],
      });
    });

    it("should parse an empty array", () => {
      const result = phpUnserialize("a:0:{}");
      expect(result).toEqual({ type: "array", entries: [] });
    });

    it("should parse an object", () => {
      const result = phpUnserialize(
        'O:8:"stdClass":1:{s:4:"name";s:5:"Alice";}',
      );
      expect(result).toEqual({
        type: "object",
        className: "stdClass",
        properties: [
          {
            key: { type: "string", value: "name" },
            value: { type: "string", value: "Alice" },
          },
        ],
      });
    });

    it("should throw error for empty input", () => {
      expect(() => phpUnserialize("")).toThrow(
        "Please enter a serialized PHP string.",
      );
      expect(() => phpUnserialize("   ")).toThrow(
        "Please enter a serialized PHP string.",
      );
    });

    it("should throw error for invalid input", () => {
      expect(() => phpUnserialize("xyz")).toThrow();
    });

    it("should throw error for malformed string", () => {
      expect(() => phpUnserialize("s:99:\"short\";")).toThrow();
    });
  });

  describe("isValidSerialized", () => {
    it("should return true for valid serialized strings", () => {
      expect(isValidSerialized('s:5:"hello";')).toBe(true);
      expect(isValidSerialized("i:42;")).toBe(true);
      expect(isValidSerialized("N;")).toBe(true);
      expect(
        isValidSerialized(
          'a:2:{i:0;s:5:"Apple";i:1;s:6:"Orange";}',
        ),
      ).toBe(true);
    });

    it("should return false for invalid strings", () => {
      expect(isValidSerialized("")).toBe(false);
      expect(isValidSerialized("not serialized")).toBe(false);
      expect(isValidSerialized("xyz{broken")).toBe(false);
    });
  });

  describe("formatPrintR", () => {
    it("should format a simple string", () => {
      const parsed = phpUnserialize('s:5:"hello";');
      expect(formatPrintR(parsed)).toBe("hello");
    });

    it("should format an integer", () => {
      const parsed = phpUnserialize("i:42;");
      expect(formatPrintR(parsed)).toBe("42");
    });

    it("should format boolean true as 1", () => {
      const parsed = phpUnserialize("b:1;");
      expect(formatPrintR(parsed)).toBe("1");
    });

    it("should format boolean false as empty string", () => {
      const parsed = phpUnserialize("b:0;");
      expect(formatPrintR(parsed)).toBe("");
    });

    it("should format null as empty string", () => {
      const parsed = phpUnserialize("N;");
      expect(formatPrintR(parsed)).toBe("");
    });

    it("should format a nested array matching user example", () => {
      const input =
        'a:2:{i:0;s:12:"Sample array";i:1;a:2:{i:0;s:5:"Apple";i:1;s:6:"Orange";}}';
      const parsed = phpUnserialize(input);
      const result = formatPrintR(parsed);
      const expected = [
        "Array",
        "(",
        "    [0] => Sample array",
        "    [1] => Array",
        "        (",
        "            [0] => Apple",
        "            [1] => Orange",
        "        )",
        "",
        ")",
      ].join("\n");
      expect(result).toBe(expected);
    });

    it("should format an object", () => {
      const parsed = phpUnserialize(
        'O:8:"stdClass":1:{s:4:"name";s:5:"Alice";}',
      );
      const result = formatPrintR(parsed);
      expect(result).toContain("stdClass Object");
      expect(result).toContain("[name] => Alice");
    });
  });

  describe("formatVarDump", () => {
    it("should format a string with type and length", () => {
      const parsed = phpUnserialize('s:5:"hello";');
      expect(formatVarDump(parsed)).toBe('string(5) "hello"');
    });

    it("should format an integer with type", () => {
      const parsed = phpUnserialize("i:42;");
      expect(formatVarDump(parsed)).toBe("int(42)");
    });

    it("should format a float with type", () => {
      const parsed = phpUnserialize("d:3.14;");
      expect(formatVarDump(parsed)).toBe("float(3.14)");
    });

    it("should format boolean true", () => {
      const parsed = phpUnserialize("b:1;");
      expect(formatVarDump(parsed)).toBe("bool(true)");
    });

    it("should format boolean false", () => {
      const parsed = phpUnserialize("b:0;");
      expect(formatVarDump(parsed)).toBe("bool(false)");
    });

    it("should format null as NULL", () => {
      const parsed = phpUnserialize("N;");
      expect(formatVarDump(parsed)).toBe("NULL");
    });

    it("should format a nested array matching user example", () => {
      const input =
        'a:2:{i:0;s:12:"Sample array";i:1;a:2:{i:0;s:5:"Apple";i:1;s:6:"Orange";}}';
      const parsed = phpUnserialize(input);
      const result = formatVarDump(parsed);
      const expected = [
        "array(2) {",
        "  [0]=>",
        '  string(12) "Sample array"',
        "  [1]=>",
        "  array(2) {",
        "    [0]=>",
        '    string(5) "Apple"',
        "    [1]=>",
        '    string(6) "Orange"',
        "  }",
        "}",
      ].join("\n");
      expect(result).toBe(expected);
    });

    it("should format an object with class name", () => {
      const parsed = phpUnserialize(
        'O:8:"stdClass":1:{s:4:"name";s:5:"Alice";}',
      );
      const result = formatVarDump(parsed);
      expect(result).toContain("object(stdClass)");
      expect(result).toContain('["name"]=>');
      expect(result).toContain('string(5) "Alice"');
    });

    it("should format an associative array with string keys", () => {
      const parsed = phpUnserialize(
        'a:2:{s:4:"name";s:5:"Alice";s:3:"age";i:30;}',
      );
      const result = formatVarDump(parsed);
      expect(result).toContain('["name"]=>');
      expect(result).toContain('string(5) "Alice"');
      expect(result).toContain('["age"]=>');
      expect(result).toContain("int(30)");
    });
  });
});
