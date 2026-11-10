import { describe, expect, it } from "vitest";
import { scrollRatio, scrollToRatio } from "@/utils/scroll-sync";

const box = (scrollHeight: number, clientHeight: number, scrollTop = 0) => {
  const element = document.createElement("div");
  Object.defineProperty(element, "scrollHeight", { value: scrollHeight });
  Object.defineProperty(element, "clientHeight", { value: clientHeight });
  element.scrollTop = scrollTop;
  return element;
};

describe("scroll sync", () => {
  it("reads the scroll position as a fraction of the scrollable distance", () => {
    expect(scrollRatio(box(1000, 200, 0))).toBe(0);
    expect(scrollRatio(box(1000, 200, 400))).toBe(0.5);
    expect(scrollRatio(box(1000, 200, 800))).toBe(1);
  });

  it("reads 0 when the content fits", () => {
    expect(scrollRatio(box(200, 200))).toBe(0);
  });

  it("scrolls to the same fraction", () => {
    const element = box(2200, 200);
    expect(scrollToRatio(element, 0.5)).toBe(1000);
    expect(element.scrollTop).toBe(1000);
    expect(scrollToRatio(box(200, 200), 0.5)).toBe(0);
  });
});
