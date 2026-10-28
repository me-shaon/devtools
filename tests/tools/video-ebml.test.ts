import { describe, expect, it } from "vitest";
import { elementAt, readVint, voidElement } from "@/utils/video-ebml";
import { cat } from "./video-fixtures";

describe("EBML basics", () => {
  it("reads sizes without the marker bit and IDs with it", () => {
    expect(readVint(Uint8Array.from([0x81]), 0, false)).toEqual({ value: 1, length: 1, unknown: false });
    expect(readVint(Uint8Array.from([0x40, 0x02]), 0, false)).toEqual({ value: 2, length: 2, unknown: false });
    expect(readVint(Uint8Array.from([0x01, 255, 255, 255, 255, 255, 255, 255]), 0, false)).toMatchObject({ length: 8, unknown: true });
    expect(readVint(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]), 0, true)).toMatchObject({ value: 0x1a45dfa3, length: 4 });
    expect(readVint(Uint8Array.from([0x00]), 0, false)).toBeNull();
  });

  it("reads an element and its end", () => {
    expect(elementAt(Uint8Array.from([0x7b, 0xa9, 0x83, 1, 2, 3]), 10, 100)).toEqual({ id: 0x7ba9, start: 10, dataStart: 13, size: 3, end: 16 });
    expect(elementAt(cat([0x1f, 0x43, 0xb6, 0x75], [0x01, 255, 255, 255, 255, 255, 255, 255]), 0, 500)).toMatchObject({ size: null, end: 500 });
    expect(() => elementAt(Uint8Array.from([0x7b, 0xa9, 0x90]), 0, 10)).toThrow(/past the end/);
  });

  it("builds Void elements of any size from 2 bytes", () => {
    expect(Array.from(voidElement(2))).toEqual([0xec, 0x80]);
    expect(Array.from(voidElement(5))).toEqual([0xec, 0x10, 0, 0, 0]);
    expect(Array.from(voidElement(9))).toEqual([0xec, 0x01, 0, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(voidElement(100).subarray(0, 9))).toEqual([0xec, 0x01, 0, 0, 0, 0, 0, 0, 91]);
    for (const total of [2, 3, 8, 9, 10, 127, 128, 70000]) expect(elementAt(voidElement(total), 0, total).end).toBe(total);
  });
});
