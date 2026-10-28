import { describe, expect, it } from "vitest";
import { applyPatches, blobSource, bytesSource, patchedBlob, sortPatches } from "@/utils/byte-source";

const readAll = (blob: Blob) =>
  new Promise<Uint8Array>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });

describe("byte sources", () => {
  it("reads ranges from bytes and stops at the end", async () => {
    const source = bytesSource(Uint8Array.from([1, 2, 3, 4, 5]));
    expect(source.size).toBe(5);
    expect(Array.from(await source.read(1, 2))).toEqual([2, 3]);
    expect(Array.from(await source.read(3, 10))).toEqual([4, 5]);
  });

  it("reads ranges from a Blob", async () => {
    const source = blobSource(new Blob([Uint8Array.from([9, 8, 7, 6])]));
    expect(source.size).toBe(4);
    expect(Array.from(await source.read(2, 5))).toEqual([7, 6]);
  });
});

describe("patches", () => {
  it("overwrites bytes in place and keeps the size", () => {
    const out = applyPatches(Uint8Array.from([0, 1, 2, 3, 4, 5]), [
      { offset: 4, bytes: Uint8Array.from([9]) },
      { offset: 1, bytes: Uint8Array.from([7, 7]) },
    ]);
    expect(Array.from(out)).toEqual([0, 7, 7, 3, 9, 5]);
  });

  it("rejects overlapping patches and patches past the end", () => {
    expect(() => sortPatches([{ offset: 0, bytes: new Uint8Array(3) }, { offset: 2, bytes: new Uint8Array(1) }], 10)).toThrow(/overlap at byte 2/);
    expect(() => sortPatches([{ offset: 8, bytes: new Uint8Array(3) }], 10)).toThrow(/past the end/);
  });

  it("builds the same bytes as a Blob from slices of the original", async () => {
    const original = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
    const patches = [{ offset: 0, bytes: Uint8Array.from([9]) }, { offset: 5, bytes: Uint8Array.from([8, 8]) }];
    const blob = patchedBlob(new Blob([original]), patches, "video/mp4");
    expect(blob.type).toBe("video/mp4");
    expect(Array.from(await readAll(blob))).toEqual(Array.from(applyPatches(original, patches)));
  });
});
