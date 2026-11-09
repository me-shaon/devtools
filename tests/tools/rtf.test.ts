import { describe, expect, it } from "vitest";
import { decompressRtf, deEncapsulateRtf } from "@/utils/rtf";

const hex = (text: string) => Uint8Array.from(text.trim().split(/\s+/), (byte) => parseInt(byte, 16));
const ascii = (text: string) => Uint8Array.from(text, (ch) => ch.charCodeAt(0));
const latin1 = (bytes: Uint8Array) => String.fromCharCode(...bytes);
const MAX = 1024 * 1024;

/** An uncompressed (MELA) stream, as [MS-OXRTFCP] 2.1.3.1.1 describes it. */
const mela = (raw: Uint8Array) => {
  const out = new Uint8Array(16 + raw.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, raw.length + 12, true);
  view.setUint32(4, raw.length, true);
  view.setUint32(8, 0x414c454d, true);
  out.set(raw, 16);
  return out;
};

describe("decompressRtf", () => {
  it("decompresses example 1 of [MS-OXRTFCP] section 3.1.1", () => {
    const bytes = hex(`2d 00 00 00 2b 00 00 00 4c 5a 46 75 f1 c5 c7 a7 03 00 0a 00 72 63 70 67 31 32 35 42 32 0a f3 20
      68 65 6c 09 00 20 62 77 05 b0 6c 64 7d 0a 80 0f a0`);
    expect(latin1(decompressRtf(bytes, MAX))).toBe("{\\rtf1\\ansi\\ansicpg1252\\pard hello world}\r\n");
  });

  it("decompresses example 2, a reference that crosses the write position", () => {
    const bytes = hex("1a 00 00 00 1c 00 00 00 4c 5a 46 75 e2 d4 4b 51 41 00 04 20 57 58 59 5a 0d 6e 7d 01 0e b0");
    expect(latin1(decompressRtf(bytes, MAX))).toBe("{\\rtf1 WXYZWXYZWXYZWXYZWXYZ}");
  });

  it("reads the uncompressed form", () => {
    expect(latin1(decompressRtf(mela(ascii("{\\rtf1 plain}")), MAX))).toBe("{\\rtf1 plain}");
  });

  it("rejects a damaged stream, a short stream, and a size over the limit", () => {
    const bytes = hex("1a 00 00 00 1c 00 00 00 4c 5a 46 75 e2 d4 4b 51 41 00 04 20 57 58 59 5a 0d 6e 7d 01 0e b0");
    const damaged = bytes.slice();
    damaged[20] ^= 0xff;
    expect(() => decompressRtf(damaged, MAX)).toThrow(/damaged/);
    expect(() => decompressRtf(bytes.subarray(0, 10), MAX)).toThrow();
    expect(() => decompressRtf(bytes, 10)).toThrow(/too large/);
  });

  it("stops when the data is longer than the declared size", () => {
    const bytes = hex("1a 00 00 00 05 00 00 00 4c 5a 46 75 e2 d4 4b 51 41 00 04 20 57 58 59 5a 0d 6e 7d 01 0e b0");
    expect(() => decompressRtf(bytes, MAX)).toThrow(/larger than/);
  });
});

describe("deEncapsulateRtf", () => {
  it("recovers the HTML of the [MS-OXRTFEX] section 3.1 example", () => {
    const rtf = `{\\rtf1\\ANSI\\ansicpg1251\\fromhtml1 \\deff0
{\\fonttbl {\\f0\\fmodern Courier New;}{\\f1\\fswiss Arial;}{\\f2\\fswiss\\fcharset0 Arial;}}
{\\colortbl\\red0\\green0\\blue0;\\red0\\green0\\blue255;}
{\\*\\htmltag64}
\\uc1\\pard\\plain\\deftab360 \\f0\\fs24
{\\*\\htmltag <HTML><head>\\par
<style>\\par
<!--\\par
 /* Style Definitions */\\par
 p.MsoNormal, li.MsoNormal \\{font-family:Arial;\\}\\par
-->\\par
</style>\\par
\\tab <!-- This is a HTML comment.\\par
There is a horizontal tab (%x09) character before the comment, \\par
and some new lines inside the comment. -->\\par
</head>\\par
<body>\\par
<p\\par
class="MsoNormal">}
{\\htmlrtf \\f1 \\htmlrtf0 Note the line break inside a P tag. {\\*\\htmltag <b>}{\\htmlrtf \\b
\\htmlrtf0 This is a bold text{\\*\\htmltag </b>}} \\htmlrtf\\par\\htmlrtf0}
\\htmlrtf \\par \\htmlrtf0
{\\*\\htmltag </p>\\par
<p class="MsoNormal">\\par}
{\\htmlrtf \\f1 \\htmlrtf0 This is a normal text with a character references:
{\\*\\htmltag &nbsp;}\\htmlrtf \\'a0\\htmlrtf0 {\\*\\htmltag &lt;}\\htmlrtf <\\htmlrtf0 {\\*\\htmltag
&uml;}\\htmlrtf {\\f2\\'a8}\\htmlrtf0{\\*\\htmltag <br>\\par}\\htmlrtf\\line\\htmlrtf0
characters which have special meaning in RTF: \\{\\}\\\\{\\*\\htmltag
<br>\\par}\\htmlrtf\\line\\htmlrtf0\\htmlrtf\\par\\htmlrtf0}
{\\*\\htmltag </p>\\par
<ol>\\par
    <li class="MsoNormal">}{\\htmlrtf
{{\\*\\pn\\pnlvlbody\\pndec\\pnstart1\\pnindent360{\\pntxta.}}\\li360\\fi-360{\\pntext 1.\\tab} \\f1
\\htmlrtf0 This is a list item}\\htmlrtf\\par\\htmlrtf0}
{\\*\\htmltag \\par
</ol>\\par
</body>\\par
</HTML>\\par }}`;
    const result = deEncapsulateRtf(ascii(rtf));
    expect(result?.kind).toBe("html");
    const html = result!.value;
    expect(html).toContain("<HTML><head>\r\n<style>");
    expect(html).toContain("p.MsoNormal, li.MsoNormal {font-family:Arial;}");
    expect(html).toContain("\t<!-- This is a HTML comment.");
    expect(html).toContain('class="MsoNormal">Note the line break inside a P tag. <b>This is a bold text</b> </p>');
    // The space after \htmlrtf0 is the delimiter of the control word, so the spaces between the references are not in this RTF
    expect(html).toContain("character references:&nbsp;&lt;&uml;<br>");
    expect(html).toContain("special meaning in RTF: {}\\<br>");
    expect(html).toContain('<li class="MsoNormal">This is a list item');
    expect(html).toContain("</ol>\r\n</body>\r\n</HTML>");
    // RTF that was not in the HTML stays out
    expect(html).not.toContain("1.\t");
    expect(html).not.toContain("Courier");
    expect(html).not.toContain(" ");
  });

  it("recovers plain text and decodes code page escapes and Unicode escapes", () => {
    const rtf = "{\\rtf1\\ansi\\ansicpg1251\\fromtext \\deff0{\\fonttbl{\\f0\\fswiss Arial;}}\\uc1\\pard\\f0 \\'cf\\'f0\\'e8\\'e2\\'e5\\'f2, caf\\u233?\\tab x\\par\r\nnext\\lquote q\\rquote}";
    expect(deEncapsulateRtf(ascii(rtf))).toEqual({ kind: "text", value: "Привет, café\tx\r\nnext‘q’" });
  });

  it("uses the code page of the current font", () => {
    const rtf = "{\\rtf1\\ansi\\ansicpg1252\\fromtext{\\fonttbl{\\f0 Arial;}{\\f1\\fcharset204 Arial CYR;}}\\f0 \\'e9 {\\f1 \\'e9}}";
    expect(deEncapsulateRtf(ascii(rtf))?.value).toBe("é й");
  });

  it("does not convert plain RTF", () => {
    expect(deEncapsulateRtf(ascii("{\\rtf1\\ansi\\deff0 {\\fonttbl{\\f0 Arial;}}\\f0 Hello}"))).toBeNull();
    expect(deEncapsulateRtf(ascii("not rtf"))).toBeNull();
  });

  it("ends without hanging on unbalanced groups and stray backslashes", () => {
    const result = deEncapsulateRtf(ascii("{\\rtf1\\fromtext {{{ \\ text \\'zz \\u}"));
    expect(result?.kind).toBe("text");
  });
});
