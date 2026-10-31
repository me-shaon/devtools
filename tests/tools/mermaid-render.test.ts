import { describe, expect, it } from "vitest";
import mermaid from "mermaid";
import { errorSummary, LOCKED_SETTINGS, sizeSvg, svgDataUrl } from "@/utils/mermaid-render";
import { MERMAID_TEMPLATES } from "@/utils/mermaid-templates";

describe("sizeSvg", () => {
  it("sets a fixed size from the viewBox and drops the max-width style", () => {
    const result = sizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="-8 -8 240.5 120" style="max-width: 240.5px; background: red;"><g/></svg>',
    );
    expect(result.width).toBe(241);
    expect(result.height).toBe(120);
    expect(result.svg).toContain('width="241"');
    expect(result.svg).toContain('height="120"');
    expect(result.svg).not.toContain("max-width");
    expect(result.svg).toContain("background: red");
  });

  it("falls back to the width and height attributes without a viewBox", () => {
    const result = sizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="40"/>');
    expect([result.width, result.height]).toEqual([50, 40]);
  });
});

describe("errorSummary", () => {
  it("drops the parser's list of expected tokens", () => {
    const error = new Error("Parse error on line 2:\n...A --> \n------^\nExpecting 'SEMI', 'NEWLINE', got 'EOF'");
    expect(errorSummary(error)).toBe("Parse error on line 2:\n...A --> \n------^");
  });

  it("keeps short messages and handles values that are not errors", () => {
    expect(errorSummary(new Error("No diagram type detected"))).toBe("No diagram type detected");
    expect(errorSummary("")).toBe("The diagram could not be rendered.");
  });
});

describe("svgDataUrl", () => {
  it("encodes the SVG so # and quotes survive", () => {
    expect(svgDataUrl('<svg fill="#fff"/>')).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%20fill%3D%22%23fff%22%2F%3E");
  });
});

describe("Mermaid settings", () => {
  it("keeps the security level and plain text labels out of reach of %%{init}%% directives", () => {
    expect(LOCKED_SETTINGS).toEqual(expect.arrayContaining(["securityLevel", "htmlLabels", "secure"]));
  });
});

describe("MERMAID_TEMPLATES", () => {
  it.each(MERMAID_TEMPLATES.map((template) => [template.label, template.source]))("%s parses", async (_label, source) => {
    await expect(mermaid.parse(source)).resolves.toBeTruthy();
  });
});
