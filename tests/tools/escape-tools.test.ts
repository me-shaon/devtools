import { describe, expect, it } from "vitest";
import {
  convertDomain,
  convertIdn,
  decodePunycode,
  encodePunycode,
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

// RFC 3492 section 7.1 sample strings (B, C, L, M, P, R, S).
const RFC_3492_VECTORS: [string, string][] = [
  ["\u4ED6\u4EEC\u4E3A\u4EC0\u4E48\u4E0D\u8BF4\u4E2D\u6587", "ihqwcrb4cv8a8dqg056pqjye"],
  ["\u4ED6\u5011\u7232\u4EC0\u9EBD\u4E0D\u8AAA\u4E2D\u6587", "ihqwctvzc91f659drss3x8bo0yb"],
  ["3\u5E74B\u7D44\u91D1\u516B\u5148\u751F", "3B-ww4c5e180e575a65lsy2b"],
  ["\u5B89\u5BA4\u5948\u7F8E\u6075-with-SUPER-MONKEYS", "-with-SUPER-MONKEYS-pc58ag80a8qai00g7n9n"],
  ["Maji\u3067Koi\u3059\u308B5\u79D2\u524D", "MajiKoi5-783gue6qz075azm5e"],
  ["почемужеонинеговорятпорусски", "b1abfaaepdrnnbgefbadotcwatmq2g4l"],
  ["PorquénopuedensimplementehablarenEspañol", "PorqunopuedensimplementehablarenEspaol-fmd56a"],
];

describe("Punycode", () => {
  it.each(RFC_3492_VECTORS)("encodes and decodes %s", (unicode, ascii) => {
    expect(encodePunycode(unicode)).toBe(ascii);
    expect(decodePunycode(ascii)).toBe(unicode);
  });

  it("decodes digits in any case", () => {
    expect(decodePunycode("B1ABFAAEPDRNNBGEFBADOTCWATMQ2G4L")).toBe("почемужеонинеговорятпорусски");
  });

  it("rejects invalid input", () => {
    expect(() => decodePunycode("zz")).toThrow(/middle of a number/);
    expect(() => decodePunycode("a!")).toThrow(/not a Punycode digit/);
  });
});

describe("IDN", () => {
  it.each([
    ["münchen.de", "xn--mnchen-3ya.de"],
    ["bücher.de", "xn--bcher-kva.de"],
    ["例え.テスト", "xn--r8jz45g.xn--zckzah"],
    ["☃.net", "xn--n3h.net"],
  ])("converts %s to %s and back", (unicode, ascii) => {
    expect(convertDomain(unicode, "toAscii")).toBe(ascii);
    expect(convertDomain(ascii, "toUnicode")).toBe(unicode);
  });

  it("lowercases and NFC normalizes before encoding", () => {
    expect(convertDomain("MÜNCHEN.de", "toAscii")).toBe("xn--mnchen-3ya.de");
    expect(convertDomain("mu\u0308nchen.de", "toAscii")).toBe("xn--mnchen-3ya.de");
  });

  it("keeps ASCII labels unchanged and splits on ideographic full stops", () => {
    expect(convertDomain("WWW.bücher.DE", "toAscii")).toBe("WWW.xn--bcher-kva.DE");
    expect(convertDomain("日本語\u3002jp", "toAscii")).toBe("xn--wgv71a119e.jp");
    expect(convertDomain("example.com", "toUnicode")).toBe("example.com");
  });

  it("converts only the host of a URL or an email address", () => {
    expect(convertIdn("https://user:pw@bücher.de:8080/pfad?q=ü#top", "toAscii")).toEqual({
      ok: true,
      value: "https://user:pw@xn--bcher-kva.de:8080/pfad?q=ü#top",
    });
    expect(convertIdn("jörg@münchen.de", "toAscii")).toEqual({ ok: true, value: "jörg@xn--mnchen-3ya.de" });
    expect(convertIdn("http://xn--n3h.net/a", "toUnicode")).toEqual({ ok: true, value: "http://☃.net/a" });
    expect(convertIdn("http://[::1]:80/", "toAscii")).toEqual({ ok: true, value: "http://[::1]:80/" });
  });

  it("converts one line at a time", () => {
    expect(convertIdn("bücher.de\n\n☃.net", "toAscii")).toEqual({ ok: true, value: "xn--bcher-kva.de\n\nxn--n3h.net" });
  });

  it("reports invalid xn-- labels", () => {
    expect(convertIdn("xn--zz.de", "toUnicode")).toMatchObject({ ok: false, error: expect.stringContaining('"xn--zz"') });
    expect(convertIdn("ok.de\nxn--.de", "toUnicode")).toMatchObject({ ok: false, error: expect.stringMatching(/^Line 2: /) });
    expect(convertIdn("xn--abc.de", "toUnicode").ok).toBe(false);
    expect(convertIdn("xn--zz.de", "toAscii").ok).toBe(false);
  });

  it("rejects labels longer than 63 characters", () => {
    expect(convertIdn(`${"ü".repeat(60)}.de`, "toAscii")).toMatchObject({ ok: false, error: expect.stringContaining("63") });
  });
});
