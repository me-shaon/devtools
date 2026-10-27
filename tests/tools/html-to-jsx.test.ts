import { describe, expect, it } from "vitest";
import { cssPropertyToKey, escapeJsxText, htmlToJsx, parseInlineStyle } from "@/utils/html-to-jsx";

const jsx = (html: string, options = {}) => {
  const result = htmlToJsx(html, options);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("htmlToJsx", () => {
  it("renames class and for", () => {
    expect(jsx('<label class="a b" for="name">Name</label>')).toBe('<label className="a b" htmlFor="name">Name</label>');
  });

  it("converts inline styles to objects with camelCase keys", () => {
    expect(jsx('<div style="background-color: red; margin-top:4px; --gap: 2px"></div>')).toBe(
      '<div style={{ backgroundColor: "red", marginTop: "4px", "--gap": "2px" }} />',
    );
  });

  it("handles vendor prefixes and semicolons inside values", () => {
    expect(cssPropertyToKey("-webkit-transition")).toBe("WebkitTransition");
    expect(cssPropertyToKey("-ms-flex")).toBe("msFlex");
    expect(parseInlineStyle('background: url("a;b.png"); color: red')).toEqual([
      ["background", 'url("a;b.png")'],
      ["color", "red"],
    ]);
  });

  it("self-closes void and empty elements", () => {
    expect(jsx('<img src="a.png" alt=""><br>')).toBe('<>\n  <img src="a.png" alt="" />\n  <br />\n</>');
    expect(jsx("<div></div>")).toBe("<div />");
  });

  it("writes boolean attributes without a value", () => {
    expect(jsx('<button disabled type="button">Go</button>')).toBe('<button disabled type="button">Go</button>');
    expect(jsx("<input readonly checked>")).toBe("<input readOnly defaultChecked />");
  });

  it("turns event attributes into camelCase props with a placeholder", () => {
    const result = htmlToJsx('<button onclick="save()" ondblclick="x()">Save</button>');
    expect(result.ok && result.value).toBe(
      "<button onClick={() => {} /* save() */} onDoubleClick={() => {} /* x() */}>\n  Save\n</button>",
    );
    expect(result.ok && result.handlers).toBe(2);
  });

  it("converts comments to JSX comments", () => {
    expect(jsx("<div><!-- note */ here --><p>a</p></div>")).toBe("<div>{/* note * / here */}<p>a</p></div>");
  });

  it("converts SVG attributes", () => {
    expect(
      jsx('<svg viewBox="0 0 24 24"><use xlink:href="#icon" stroke-width="2" fill-opacity=".5"></use></svg>'),
    ).toBe('<svg viewBox="0 0 24 24">\n  <use xlinkHref="#icon" strokeWidth="2" fillOpacity=".5" />\n</svg>');
  });

  it("keeps SVG element case", () => {
    expect(jsx("<svg><linearGradient id=\"g\"></linearGradient></svg>")).toBe('<svg><linearGradient id="g" /></svg>');
  });

  it("escapes braces and angle brackets in text", () => {
    expect(jsx("<p>{a} &lt; b</p>")).toBe('<p>{"{"}a{"}"} &lt; b</p>');
    expect(escapeJsxText("&copy; x")).toBe("&amp;copy; x");
    expect(jsx("<p>a&nbsp;b</p>")).toBe("<p>a&nbsp;b</p>");
  });

  it("preserves whitespace in pre", () => {
    expect(jsx("<pre>  line 1\n    line 2</pre>")).toBe("<pre>{`  line 1\n    line 2`}</pre>");
    expect(jsx("<pre><code>a {\n  b\n}</code></pre>")).toBe("<pre><code>{`a {\n  b\n}`}</code></pre>");
  });

  it("keeps spaces between inline elements when it breaks lines", () => {
    const long = "This sentence is long enough that the paragraph has to be split over lines";
    expect(jsx(`<p>${long} <b>bold</b> end</p>`)).toBe(`<p>\n  ${long}{" "}\n  <b>bold</b>\n  {" "}end\n</p>`);
  });

  it("wraps several roots in a fragment and indents with two spaces", () => {
    expect(jsx("<h1>A</h1>\n<p>B</p>")).toBe("<>\n  <h1>A</h1>\n  <p>B</p>\n</>");
  });

  it("wraps the result in a named component", () => {
    expect(jsx("<p>Hi</p>", { component: true, componentName: "Greeting" })).toBe(
      "export function Greeting() {\n  return (\n    <p>Hi</p>\n  );\n}",
    );
    const bad = htmlToJsx("<p>Hi</p>", { component: true, componentName: "greeting" });
    expect(bad.ok).toBe(false);
  });

  it("converts form values to default values", () => {
    expect(jsx('<input value="a"><textarea>hi</textarea>')).toBe('<>\n  <input defaultValue="a" />\n  <textarea defaultValue="hi" />\n</>');
  });

  it("keeps data and aria attributes", () => {
    expect(jsx('<div data-id="1" aria-label="x" tabindex="0"></div>')).toBe('<div data-id="1" aria-label="x" tabIndex="0" />');
  });

  it("returns an empty result for blank input", () => {
    expect(jsx("   ")).toBe("");
  });
});
