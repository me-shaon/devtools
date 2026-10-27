import { describe, expect, it } from "vitest";
import { formatCode, minifyCss, minifyHtml, minifyJs, minifySql, minifyXml } from "@/utils/code-formatter";

const beautify = (input: string, language: Parameters<typeof formatCode>[1]["language"], indent: "2" | "4" | "tab" = "2") =>
  formatCode(input, { language, mode: "beautify", indent });

describe("formatCode beautify", () => {
  it("formats HTML with the chosen indent", async () => {
    expect(await beautify("<div><p>a</p></div>", "html")).toBe("<div>\n  <p>a</p>\n</div>");
    expect(await beautify("<div><p>a</p></div>", "html", "tab")).toBe("<div>\n\t<p>a</p>\n</div>");
  });
  it("formats CSS", async () => {
    expect(await beautify("a{color:red;margin:0}", "css", "4")).toBe("a {\n    color: red;\n    margin: 0\n}");
  });
  it("formats JavaScript", async () => {
    expect(await beautify("function f(a,b){return a+b}", "javascript")).toBe("function f(a, b) {\n  return a + b\n}");
  });
  it("formats XML and keeps text inline", async () => {
    expect(await beautify("<root><item id=\"1\"><name>Ana</name></item></root>", "xml")).toBe(
      '<root>\n  <item id="1">\n    <name>Ana</name>\n  </item>\n</root>',
    );
  });
  it("formats SQL with a dialect", async () => {
    expect(await formatCode("select a, b from t where x = 1", { language: "sql", mode: "beautify", indent: "2", dialect: "postgresql" })).toBe(
      "select\n  a,\n  b\nfrom\n  t\nwhere\n  x = 1",
    );
  });
  it("reports invalid SQL with a short message", async () => {
    await expect(beautify("select ( from", "sql")).rejects.toThrow(/^Parse error.*line 1 column \d+$/);
  });
  it("returns an empty string for blank input", async () => {
    expect(await beautify("   ", "javascript")).toBe("");
  });
});

describe("minifiers", () => {
  it("minifies CSS without touching strings or calc spacing", () => {
    expect(minifyCss('/* c */ a , b > c { color : red ; content: " ; } " ; width: calc(1px + 2px) ; }')).toBe(
      'a,b>c{color :red;content:" ; } ";width:calc(1px + 2px)}',
    );
    expect(minifyCss("@media screen and (max-width: 600px) { a { margin: 0 auto; } }")).toBe(
      "@media screen and (max-width:600px){a{margin:0 auto}}",
    );
  });
  it("minifies HTML and keeps pre and script content", () => {
    const html = '<html>\n  <body>\n    <!-- note -->\n    <p class="a   b"  id=x>Hi   <b>x</b> <i>y</i></p>\n    <pre>  keep\n  me</pre>\n    <script> if (a < b) {} </script>\n  </body>\n</html>';
    expect(minifyHtml(html)).toBe(
      '<html><body><p class="a   b" id=x>Hi <b>x</b> <i>y</i></p><pre>  keep\n  me</pre><script> if (a < b) {} </script></body></html>',
    );
  });
  it("minifies XML and keeps CDATA", () => {
    expect(minifyXml('<?xml version="1.0"?>\n<root>\n  <!-- c -->\n  <a  x="1" >text</a>\n  <![CDATA[ <raw> ]]>\n</root>')).toBe(
      '<?xml version="1.0"?><root><a x="1">text</a><![CDATA[ <raw> ]]></root>',
    );
  });
  it("minifies SQL and keeps quoted values", () => {
    expect(minifySql("SELECT a, b -- c\nFROM   t /* x */ WHERE name = 'it''s  ok' AND id IN ( 1 , 2 ) ;")).toBe(
      "SELECT a,b FROM t WHERE name = 'it''s  ok' AND id IN(1,2);",
    );
  });
  it("minifies JavaScript without breaking strings, regex, or templates", () => {
    const js = 'const a = 1 + +b; // note\nlet re = /a\\/[/]b/g.test(x) ? a / 2 : `t ${ {k: 1}.k } end`;\nconst s = "a // b";';
    expect(minifyJs(js)).toBe('const a=1+ +b;let re=/a\\/[/]b/g.test(x)?a/2:`t ${{k:1}.k} end`;const s="a // b";');
  });
  it("keeps line breaks that automatic semicolon insertion depends on", () => {
    expect(minifyJs("function f() {\n  return\n  1\n}\ni++\nj")).toBe("function f(){return\n1}\ni++\nj");
    expect(minifyJs("x = y\n  .map(z => z)")).toBe("x=y.map(z=>z)");
  });
  it("keeps spaces that separate tokens", () => {
    expect(minifyJs("let n = 1 .toString(); r = /x/ in o; a - -b")).toBe("let n=1 .toString();r=/x/ in o;a- -b");
  });
  it("reports unterminated literals", () => {
    expect(() => minifyJs('const s = "open')).toThrow("Unterminated string literal.");
    expect(() => minifyCss("a { /* open")).toThrow(/Unterminated comment/);
  });
  it("runs minify through formatCode", async () => {
    expect(await formatCode("a { color: red; }", { language: "css", mode: "minify", indent: "2" })).toBe("a{color:red}");
  });
});
