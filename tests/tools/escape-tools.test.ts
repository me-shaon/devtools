import { describe, expect, it } from "vitest";
import {
  decodeBackslash,
  decodeHex,
  decodeHtml,
  decodeUnicode,
  encodeBackslash,
  encodeHex,
  encodeHtml,
  encodeUnicode,
} from "@/utils/escape";

describe("HTML entities", () => {
  it("escapes markup characters", () => {
    expect(encodeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
  });

  it("escapes non-ASCII as numeric entities when asked", () => {
    expect(encodeHtml("café 😀", { nonAscii: true })).toBe("caf&#xE9; &#x1F600;");
  });

  it("decodes named, decimal, and hex references", () => {
    expect(decodeHtml("&lt;p&gt;caf&eacute; &#169; &#x1F600; &amp;amp;")).toBe("<p>café © 😀 &amp;");
  });

  it("leaves unknown names and bare ampersands alone", () => {
    expect(decodeHtml("&bogus; & &amp")).toBe("&bogus; & &amp");
    expect(decodeHtml("&constructor;")).toBe("&constructor;");
  });

  it("replaces invalid numeric references with U+FFFD", () => {
    expect(decodeHtml("&#0;&#xD800;&#x110000;")).toBe("���");
  });

  it("round trips text", () => {
    const text = `<script>alert("x")</script> & ünïcødé 👨\u200D👩\u200D👧`;
    expect(decodeHtml(encodeHtml(text))).toBe(text);
    expect(decodeHtml(encodeHtml(text, { nonAscii: true }))).toBe(text);
  });
});

describe("Backslash escapes", () => {
  it("escapes quotes, backslashes, and control characters", () => {
    expect(encodeBackslash('a"b\\c\n\t\u0001\u2028')).toBe('a\\"b\\\\c\\n\\t\\u0001\\u2028');
  });

  it("decodes JS escapes", () => {
    const result = decodeBackslash("line\\n\\t\\'q\\' \\x41 \\u00e9 \\u{1F600} \\q");
    expect(result).toEqual({ ok: true, value: "line\n\t'q' A é 😀 q" });
  });

  it("drops line continuations", () => {
    expect(decodeBackslash("a\\\r\nb")).toEqual({ ok: true, value: "ab" });
  });

  it("reports malformed escapes", () => {
    expect(decodeBackslash("abc\\")).toMatchObject({ ok: false });
    expect(decodeBackslash("\\u12G4")).toMatchObject({ ok: false, error: expect.stringMatching(/4 hex digits/) });
    expect(decodeBackslash("\\xZ1")).toMatchObject({ ok: false });
    expect(decodeBackslash("\\u{110000}")).toMatchObject({ ok: false });
  });

  it("round trips text", () => {
    const text = 'He said "hi"\r\n\\path\t👍';
    expect(decodeBackslash(encodeBackslash(text))).toEqual({ ok: true, value: text });
    expect(JSON.parse(`"${encodeBackslash(text)}"`)).toBe(text);
  });
});

describe("Unicode escapes", () => {
  it("escapes non-ASCII as surrogate pairs or braces", () => {
    expect(encodeUnicode("café 😀")).toBe("caf\\u00E9 \\uD83D\\uDE00");
    expect(encodeUnicode("😀", { braces: true })).toBe("\\u{1F600}");
    expect(encodeUnicode("ab", { all: true })).toBe("\\u0061\\u0062");
  });

  it("decodes escapes and keeps other text", () => {
    expect(decodeUnicode("caf\\u00e9 \\uD83D\\uDE00 \\u{1F44D} \\n")).toEqual({ ok: true, value: "café 😀 👍 \\n" });
  });

  it("reports malformed escapes", () => {
    expect(decodeUnicode("\\u00")).toMatchObject({ ok: false });
    expect(decodeUnicode("\\u{}")).toMatchObject({ ok: false });
  });

  it("round trips a ZWJ sequence", () => {
    const text = "👨\u200D👩\u200D👧 é";
    expect(decodeUnicode(encodeUnicode(text))).toEqual({ ok: true, value: text });
    expect(decodeUnicode(encodeUnicode(text, { braces: true }))).toEqual({ ok: true, value: text });
  });
});

describe("Hex", () => {
  it("encodes UTF-8 bytes", () => {
    expect(encodeHex("Hi é")).toBe("486920c3a9");
    expect(encodeHex("Hi", { spaced: true, uppercase: true })).toBe("48 69");
  });

  it("decodes several input styles", () => {
    expect(decodeHex("48 65 6c 6c 6f")).toEqual({ ok: true, value: "Hello" });
    expect(decodeHex("0x48,0x69")).toEqual({ ok: true, value: "Hi" });
    expect(decodeHex("\\x48\\x69")).toEqual({ ok: true, value: "Hi" });
    expect(decodeHex("48:69")).toEqual({ ok: true, value: "Hi" });
    expect(decodeHex("efbbbf41")).toEqual({ ok: true, value: "\uFEFFA" });
  });

  it("reports an odd digit count", () => {
    expect(decodeHex("486")).toMatchObject({ ok: false, error: expect.stringMatching(/3 digits/) });
  });

  it("reports invalid characters", () => {
    expect(decodeHex("48zz")).toMatchObject({ ok: false, error: expect.stringMatching(/"z"/) });
  });

  it("reports invalid UTF-8", () => {
    expect(decodeHex("c3")).toMatchObject({ ok: false, error: expect.stringMatching(/UTF-8/) });
  });

  it("round trips text", () => {
    const text = "👨\u200D👩\u200D👧 naïve\n";
    expect(decodeHex(encodeHex(text, { spaced: true }))).toEqual({ ok: true, value: text });
  });
});
