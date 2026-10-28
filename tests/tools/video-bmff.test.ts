import { describe, expect, it } from "vitest";
import { blankBox, children, headerAt } from "@/utils/video-bmff";
import { box, cat, latin, u32 } from "./video-fixtures";

describe("ISO BMFF boxes", () => {
  it("reads 32-bit, 64-bit, to-the-end, and uuid headers", () => {
    expect(headerAt(cat(u32(16), latin("free"), new Uint8Array(8)), 100, 200)).toMatchObject({ type: "free", start: 100, size: 16, headerSize: 8, large: false });
    expect(headerAt(cat(u32(1), latin("mdat"), u32(0), u32(40)), 0, 100)).toMatchObject({ type: "mdat", size: 40, headerSize: 16, large: true });
    expect(headerAt(cat(u32(0), latin("mdat")), 10, 90)).toMatchObject({ size: 80 });
    expect(headerAt(cat(u32(40), latin("uuid"), new Uint8Array(16).fill(0xab)), 0, 100)).toMatchObject({ headerSize: 24, uuid: "ab".repeat(16) });
  });

  it("rejects a box that does not fit its parent", () => {
    expect(() => headerAt(cat(u32(500), latin("moov")), 0, 100)).toThrow(/byte 0 has an invalid size/);
    expect(() => headerAt(cat(u32(4), latin("moov")), 0, 100)).toThrow(/invalid size/);
  });

  it("walks child boxes and stops at a QuickTime zero terminator", () => {
    const buf = cat(box("aaaa", [1]), box("bbbb"), u32(0));
    expect([...children(buf, 1000, 0, buf.length)].map((b) => [b.type, b.start])).toEqual([["aaaa", 1000], ["bbbb", 1009]]);
  });

  it("turns a box into a zero-filled free box of the same size", () => {
    const patch = blankBox({ type: "udta", start: 50, headerSize: 8, size: 12, large: false });
    expect(patch.offset).toBe(50);
    expect(Array.from(patch.bytes)).toEqual([0, 0, 0, 12, 0x66, 0x72, 0x65, 0x65, 0, 0, 0, 0]);
    const large = blankBox({ type: "uuid", start: 0, headerSize: 32, size: 40, large: true });
    expect(Array.from(large.bytes.subarray(0, 16))).toEqual([0, 0, 0, 1, 0x66, 0x72, 0x65, 0x65, 0, 0, 0, 0, 0, 0, 0, 40]);
  });
});
