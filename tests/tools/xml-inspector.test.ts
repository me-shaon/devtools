import { describe, it, expect } from "vitest";
import { inspectXml, parseXml } from "@/utils/xml-inspector";
describe("XML inspector", () => {
  const xml = '<root><item id="1">Hello</item><item id="2">世界</item></root>';
  it("returns nodes, attributes and scalar queries", () => {
    expect(inspectXml(xml, "//item/@id", "")).toBe("1\n2");
    expect(inspectXml(xml, "count(//item)", "")).toBe("2");
    expect(inspectXml(xml, "string(//item[2])", "")).toBe("世界");
    expect(inspectXml(xml, "boolean(//missing)", "")).toBe("false");
    expect(inspectXml(xml, "//missing", "")).toBe("No matches");
  });
  it("rejects malformed XML, external declarations, oversized input and malformed mappings", () => {
    expect(() => parseXml("<a>")).toThrow();
    expect(() =>
      parseXml('<!DOCTYPE x SYSTEM "https://example.com"><x/>'),
    ).toThrow(/DTD/);
    expect(() => parseXml("x".repeat(1000001))).toThrow(/limited/);
    expect(() => inspectXml(xml, "//item", "invalid")).toThrow(/prefix/);
  });
  it("allows DOCTYPE text inside comments and CDATA", () => {
    expect(
      inspectXml("<r><!-- <!DOCTYPE x> --><![CDATA[<!ENTITY y>]]></r>", "string(/r)", ""),
    ).toBe("<!ENTITY y>");
    expect(() => parseXml("<!-- note --><!DOCTYPE x><x/>")).toThrow(/DTD/);
  });
  it("queries a parsed document", () =>
    expect(inspectXml(parseXml(xml), "count(//item)", "")).toBe("2"));
  it("retains namespace declarations on serialization", () =>
    expect(inspectXml('<r xmlns="urn:test"><i/></r>', "", "")).toContain(
      'xmlns="urn:test"',
    ));
});
