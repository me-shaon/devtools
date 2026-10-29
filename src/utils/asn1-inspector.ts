import { decodeHex } from "./checksum";
export interface AsnNode {
  offset: number;
  header: number;
  length: number;
  tag: number;
  tagClass: string;
  constructed: boolean;
  name: string;
  value: string;
  hex: string;
  children: AsnNode[];
}
const names: Record<number, string> = {
  1: "BOOLEAN",
  2: "INTEGER",
  3: "BIT STRING",
  4: "OCTET STRING",
  5: "NULL",
  6: "OBJECT IDENTIFIER",
  10: "ENUMERATED",
  12: "UTF8String",
  16: "SEQUENCE",
  17: "SET",
  18: "NumericString",
  19: "PrintableString",
  20: "TeletexString",
  22: "IA5String",
  23: "UTCTime",
  24: "GeneralizedTime",
  30: "BMPString",
};
export function decodeAsnInput(
  input: string,
  format: "pem" | "hex" | "base64",
): Uint8Array {
  if (input.length > 3000000)
    throw new Error("Input is limited to 3 million characters.");
  if (format === "hex") return decodeHex(input);
  let body = input.trim();
  if (format === "pem") {
    const match =
      /^-----BEGIN ([A-Z0-9 ]+)-----([\s\S]+?)-----END \1-----$/.exec(body);
    if (!match)
      throw new Error("Enter one complete PEM block with matching labels.");
    body = match[2];
  }
  body = body.replace(/\s/g, "");
  if (!body || !/^[A-Za-z0-9+/]*={0,2}$/.test(body) || body.length % 4 === 1)
    throw new Error("Invalid Base64 data.");
  try {
    return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  } catch {
    throw new Error("Invalid Base64 data.");
  }
}
function primitive(tag: number, bytes: Uint8Array): string {
  if (tag === 1) {
    if (bytes.length !== 1)
      throw new Error("BOOLEAN must contain exactly one byte.");
    return bytes[0] ? "true" : "false";
  }
  if (tag === 2 || tag === 10) {
    if (!bytes.length) throw new Error("INTEGER cannot be empty.");
    if (bytes.length > 512) return "Integer too large for decimal preview";
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    if (bytes[0] & 128) n -= 1n << BigInt(bytes.length * 8);
    return n.toString();
  }
  if (tag === 5) {
    if (bytes.length) throw new Error("NULL must have zero length.");
    return "null";
  }
  if (tag === 6) {
    if (bytes.length > 4096) throw new Error("OID exceeds 4,096 bytes.");
    const arcs: bigint[] = [];
    let value = 0n;
    if (!bytes.length) throw new Error("OID cannot be empty.");
    for (const b of bytes) {
      value = (value << 7n) | BigInt(b & 127);
      if (!(b & 128)) {
        arcs.push(value);
        value = 0n;
      }
    }
    if (bytes[bytes.length - 1] & 128) throw new Error("Truncated OID.");
    const first = arcs.shift()!;
    const root = first < 40n ? 0n : first < 80n ? 1n : 2n;
    return [root, first - root * 40n, ...arcs].join(".");
  }
  if ([12, 18, 19, 22, 23, 24].includes(tag))
    return new TextDecoder().decode(bytes.slice(0, 4096));
  // T.61 has no TextDecoder. Latin-1 shows its ASCII range correctly and never fails.
  if (tag === 20) return new TextDecoder("latin1").decode(bytes.slice(0, 4096));
  if (tag === 30) {
    if (bytes.length % 2) throw new Error("BMPString requires pairs of bytes.");
    return new TextDecoder("utf-16be").decode(bytes.slice(0, 4096));
  }
  return "";
}
export function parseAsn1(bytes: Uint8Array): AsnNode[] {
  if (bytes.length > 1000000) throw new Error("ASN.1 data is limited to 1 MB.");
  if (!bytes.length) throw new Error("Enter ASN.1 data.");
  let count = 0;
  function parse(start: number, end: number, depth: number): AsnNode[] {
    if (depth > 40) throw new Error("Nesting exceeds 40 levels.");
    const nodes: AsnNode[] = [];
    let pos = start;
    const read = () => {
      if (pos >= end) throw new Error(`Truncated data at byte ${pos}.`);
      return bytes[pos++];
    };
    while (pos < end) {
      if (++count > 10000) throw new Error("More than 10,000 ASN.1 nodes.");
      const offset = pos,
        first = read(),
        cls = first >>> 6,
        constructed = Boolean(first & 32);
      let tag = first & 31;
      if (tag === 31) {
        tag = 0;
        let b: number;
        do {
          b = read();
          tag = tag * 128 + (b & 127);
          if (tag > 0x7fffffff) throw new Error("Tag number is too large.");
        } while (b & 128);
      }
      let length = read();
      if (length === 128)
        throw new Error(
          "Indefinite-length BER is not supported. Use definite-length DER/BER.",
        );
      if (length & 128) {
        const size = length & 127;
        if (size > 4) throw new Error("Length field is too large.");
        length = 0;
        for (let i = 0; i < size; i++) length = length * 256 + read();
      }
      const header = pos - offset,
        stop = pos + length;
      if (stop > end)
        throw new Error(
          `Value at byte ${offset} extends beyond its container.`,
        );
      if (cls === 0 && tag === 0)
        throw new Error("Unexpected end-of-content tag.");
      const valueBytes = bytes.subarray(pos, stop);
      const hex =
        Array.from(valueBytes.subarray(0, 256), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(" ") + (length > 256 ? " …" : "");
      nodes.push({
        offset,
        header,
        length,
        tag,
        tagClass: ["Universal", "Application", "Context-specific", "Private"][
          cls
        ],
        constructed,
        name: cls === 0 ? (names[tag] ?? `Tag ${tag}`) : `Tag ${tag}`,
        value: !constructed && cls === 0 ? primitive(tag, valueBytes) : "",
        hex,
        children: constructed ? parse(pos, stop, depth + 1) : [],
      });
      pos = stop;
    }
    return nodes;
  }
  return parse(0, bytes.length, 0);
}
