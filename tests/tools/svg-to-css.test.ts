import { describe, expect, it } from "vitest";
import { convertSvg, encodeMiniSvg, type SvgConversion } from "@/utils/svg-to-css";

const ICON = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: an editor -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" width="24" height="24" viewBox="0 0 24 24" inkscape:version="1.3">
  <metadata><rdf>x</rdf></metadata>
  <sodipodi:namedview id="view" />
  <path fill="#ff0000" d="M12 2 L22 22 H2 Z" style="font-family: 'Open Sans'" />
  <text x="2" y="20">100% {ok} &lt;tag&gt; &amp; "q"</text>
</svg>`;

const convert = (input: string): SvgConversion => {
  const result = convertSvg(input);
  if (!result.ok) throw new Error(result.error);
  return result;
};

/** Parses SVG and returns a canonical form to compare two encodings of the same image. */
const canonical = (svg: string) => {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  return new XMLSerializer().serializeToString(doc.documentElement);
};

describe("convertSvg", () => {
  it("strips the prolog, comments, metadata, and editor namespaces", () => {
    const { svg } = convert(ICON);
    expect(svg).not.toMatch(/<\?xml|<!--|metadata|inkscape|sodipodi/);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="24"')).toBe(true);
    expect(svg).not.toMatch(/\n/);
  });

  it("encodes only the characters a data URI needs", () => {
    const { miniDataUri } = convert(ICON);
    expect(miniDataUri.startsWith("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'")).toBe(true);
    expect(miniDataUri).toContain("fill='%23ff0000'");
    expect(miniDataUri).toContain("100%25 %7Bok%7D");
    expect(miniDataUri).not.toMatch(/["#<>{}]/);
    expect(miniDataUri).not.toMatch(/%[^0-9A-F]|%.[^0-9A-F]/);
  });

  it("round-trips the mini data URI to the same SVG", () => {
    const { svg, miniDataUri } = convert(ICON);
    const decoded = decodeURIComponent(miniDataUri.slice("data:image/svg+xml,".length));
    expect(canonical(decoded)).toBe(canonical(svg));
    expect(decoded).toContain("font-family: &apos;Open Sans&apos;");
  });

  it("builds a Base64 data URI from UTF-8 bytes", () => {
    const { svg, base64DataUri } = convert('<svg xmlns="http://www.w3.org/2000/svg"><text>café ✓</text></svg>');
    const binary = atob(base64DataUri.slice("data:image/svg+xml;base64,".length));
    const text = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    expect(text).toBe(svg);
    expect(text).toContain("café ✓");
  });

  it("removes scripts, event handlers, and javascript links", () => {
    const result = convert(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)"><script>alert(2)</script><a xlink:href="javascript:alert(3)"><rect onclick="x()" width="1" height="1"/></a></svg>',
    );
    expect(result.scripts).toBe(1);
    expect(result.handlers).toBe(3);
    for (const output of [result.svg, decodeURIComponent(result.miniDataUri), result.backgroundCss, result.maskCss]) {
      expect(output).not.toMatch(/script|onload|onclick|javascript/i);
    }
  });

  it("adds a missing SVG namespace", () => {
    const result = convert('<svg viewBox="0 0 16 16"><use xlink:href="#a"/></svg>');
    expect(result.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result.svg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(result.notes).toHaveLength(2);
    expect(result.width).toBe("16");
  });

  it("builds CSS and img snippets", () => {
    const result = convert(ICON);
    expect(result.backgroundCss).toBe(`background-image: url("${result.miniDataUri}");`);
    expect(result.maskCss).toContain(`-webkit-mask-image: url("${result.miniDataUri}");`);
    expect(result.maskCss).toContain("mask-image");
    expect(result.imgTag).toMatch(/^<img src="data:image\/svg\+xml,[^"]+" alt="" width="24" height="24">$/);
    expect(result.imgTag).toContain("&amp;amp;");
  });

  it("reports XML errors and non-SVG roots", () => {
    const broken = convertSvg('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>');
    expect(broken.ok).toBe(false);
    expect(!broken.ok && broken.error).toBeTruthy();
    const html = convertSvg("<div>x</div>");
    expect(!html.ok && html.error).toMatch(/<div>/);
  });

  it("encodes whitespace and special characters", () => {
    expect(encodeMiniSvg("<a b='#'>\n{50%}\"</a>")).toBe("%3Ca b='%23'%3E %7B50%25%7D%22%3C/a%3E");
  });
});
