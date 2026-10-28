import { VideoError } from "@/utils/video-format";

/**
 * Reads and removes metadata in Matroska and WebM files. Removed elements
 * become Void elements of the same size, and removed strings become zero
 * bytes, so the seek index and the cues stay valid.
 */

export interface EbmlElement {
  id: number;
  start: number;
  dataStart: number;
  /** null when the size is unknown, as in live recordings. */
  size: number | null;
  end: number;
}

/** Reads a variable-size integer. IDs keep the marker bit, sizes do not. */
export function readVint(b: Uint8Array, o: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } | null {
  const first = b[o];
  if (first === undefined || first === 0) return null;
  let length = 1;
  let mask = 0x80;
  while (!(first & mask)) {
    length++;
    mask >>= 1;
  }
  if (o + length > b.length) return null;
  let value = keepMarker ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < length; i++) {
    value = value * 256 + b[o + i];
    if (b[o + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

/** Reads the element header in `h`, where h[0] is at file offset `start`. */
export function elementAt(h: Uint8Array, start: number, parentEnd: number): EbmlElement {
  const id = readVint(h, 0, true);
  const size = id && id.length <= 4 ? readVint(h, id.length, false) : null;
  if (!id || !size) throw new VideoError(`The element at byte ${start} is not valid Matroska data.`);
  const dataStart = start + id.length + size.length;
  const end = size.unknown ? parentEnd : dataStart + size.value;
  if (end > parentEnd) throw new VideoError(`The element at byte ${start} runs past the end of its parent.`);
  return { id: id.value, start, dataStart, size: size.unknown ? null : size.value, end };
}

/** A Void element of `total` bytes: ID 0xEC, a size, and zero data. */
export function voidElement(total: number): Uint8Array {
  if (total < 2) throw new Error("A Void element needs at least 2 bytes.");
  const out = new Uint8Array(total);
  out[0] = 0xec;
  // A size field of n bytes. Short elements use a longer size field that holds 0.
  const n = total <= 9 ? total - 1 : 8;
  let value = total - 1 - n;
  for (let i = n; i >= 1; i--) {
    out[i] = value % 256;
    value = Math.floor(value / 256);
  }
  out[1] |= 0x80 >> (n - 1);
  return out;
}
