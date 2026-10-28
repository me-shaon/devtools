/** Random access to file bytes, so a large video is never read into memory at once. */
export interface ByteSource {
  readonly size: number;
  /** Reads up to `length` bytes at `offset`. Returns fewer bytes at the end of the source. */
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** A same-size overwrite. Cleaning never moves bytes, so the offsets inside the file stay valid. */
export interface Patch {
  offset: number;
  bytes: Uint8Array;
}

export const bytesSource = (bytes: Uint8Array): ByteSource => ({
  size: bytes.length,
  read: async (offset, length) => bytes.slice(offset, Math.min(offset + length, bytes.length)),
});

const readBlob = (blob: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsArrayBuffer(blob);
  });

export const blobSource = (blob: Blob): ByteSource => ({
  size: blob.size,
  read: (offset, length) => readBlob(blob.slice(offset, Math.min(offset + length, blob.size))),
});

/** Sorts the patches and checks that they stay inside the file and do not overlap. */
export function sortPatches(patches: Patch[], size: number): Patch[] {
  const sorted = [...patches].sort((a, b) => a.offset - b.offset);
  let end = 0;
  for (const patch of sorted) {
    if (patch.offset < end) throw new Error(`Two changes overlap at byte ${patch.offset}.`);
    end = patch.offset + patch.bytes.length;
    if (end > size) throw new Error(`A change at byte ${patch.offset} goes past the end of the file.`);
  }
  return sorted;
}

export function applyPatches(bytes: Uint8Array, patches: Patch[]): Uint8Array {
  const out = bytes.slice();
  for (const patch of sortPatches(patches, bytes.length)) out.set(patch.bytes, patch.offset);
  return out;
}

/** Builds the clean file from slices of the original, so only the changed bytes are held in memory. */
export function patchedBlob(blob: Blob, patches: Patch[], type = blob.type): Blob {
  const parts: BlobPart[] = [];
  let position = 0;
  for (const patch of sortPatches(patches, blob.size)) {
    if (patch.offset > position) parts.push(blob.slice(position, patch.offset));
    parts.push(patch.bytes as BlobPart);
    position = patch.offset + patch.bytes.length;
  }
  if (position < blob.size) parts.push(blob.slice(position));
  return new Blob(parts, { type });
}
