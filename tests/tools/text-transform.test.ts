import { describe, it, expect } from "vitest";
import { transformText } from "@/utils/text-transform";
describe("text transformations", () => {
  it("splits, joins, wraps and replaces literally", () => {
    expect(transformText("a,,b", "split", ",")).toBe("a\n\nb");
    expect(transformText("a\r\nb", "join", ",")).toBe("a,b");
    expect(transformText("a\r\nb", "wrap", "[", "]")).toBe("[a]\r\n[b]");
    expect(transformText("a$a", "replace", "a", "$&")).toBe("$&$$&");
  });
  it("treats a final line break as the end of the last line", () => {
    expect(transformText("a\nb\n", "join", ",")).toBe("a,b");
    expect(transformText("a\nb\n", "wrap", "[", "]")).toBe("[a]\n[b]\n");
    expect(transformText("a\n\nb", "join", ",")).toBe("a,,b");
  });
  it("calculates sum/product and rejects invalid or unsafe numbers", () => {
    expect(transformText("2\n3\n", "product")).toBe("6");
    expect(transformText("1.5\n2.5", "sum")).toBe("4");
    expect(() => transformText("1\nx", "sum")).toThrow();
    expect(() => transformText("9007199254740992", "sum")).toThrow();
  });
});
