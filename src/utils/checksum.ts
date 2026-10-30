export const CRC_PRESETS = {
  "CRC-8/SMBUS": {
    width: 8,
    polynomial: 0x07,
    init: 0,
    xor: 0,
    reflected: false,
  },
  "CRC-16/ARC": {
    width: 16,
    polynomial: 0x8005,
    init: 0,
    xor: 0,
    reflected: true,
  },
  "CRC-16/MODBUS": {
    width: 16,
    polynomial: 0x8005,
    init: 0xffff,
    xor: 0,
    reflected: true,
  },
  "CRC-16/CCITT-FALSE": {
    width: 16,
    polynomial: 0x1021,
    init: 0xffff,
    xor: 0,
    reflected: false,
  },
  "CRC-32/ISO-HDLC": {
    width: 32,
    polynomial: 0x04c11db7,
    init: 0xffffffff,
    xor: 0xffffffff,
    reflected: true,
  },
  "CRC-32C": {
    width: 32,
    polynomial: 0x1edc6f41,
    init: 0xffffffff,
    xor: 0xffffffff,
    reflected: true,
  },
} as const;
export type CrcPreset = keyof typeof CRC_PRESETS;
export function decodeHex(input: string): Uint8Array {
  const text = input.replace(/\s/g, "");
  if (!/^(?:[a-f0-9]{2})*$/i.test(text))
    throw new Error(
      "Enter complete hex byte pairs, separated by optional spaces.",
    );
  return Uint8Array.from(text.match(/../g) ?? [], (x) => parseInt(x, 16));
}
const tables = new Map<CrcPreset, Uint32Array>();
// One 256-entry table per preset turns the 8 bit steps for each byte into one lookup.
function crcTable(preset: CrcPreset): Uint32Array {
  const cached = tables.get(preset);
  if (cached) return cached;
  const { width, polynomial, reflected } = CRC_PRESETS[preset];
  const top = 2 ** (width - 1);
  const mask = 2 ** width - 1;
  let poly: number = polynomial;
  if (reflected) {
    poly = 0;
    for (let i = 0; i < width; i++)
      poly = (poly * 2 + ((polynomial >>> i) & 1)) >>> 0;
  }
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = reflected ? n : n * 2 ** (width - 8);
    for (let bit = 0; bit < 8; bit++)
      value = reflected
        ? (value >>> 1) ^ (value & 1 ? poly : 0)
        : value >= top
          ? (((value - top) * 2) ^ poly) >>> 0
          : value * 2;
    table[n] = (value >>> 0) & mask;
  }
  tables.set(preset, table);
  return table;
}
export function crc(bytes: Uint8Array, preset: CrcPreset): string {
  const { width, init, xor, reflected } = CRC_PRESETS[preset];
  const table = crcTable(preset);
  const shift = width - 8;
  const mask = width === 32 ? 0xffffffff : (1 << width) - 1;
  let value: number = init;
  for (let i = 0; i < bytes.length; i++)
    value = reflected
      ? table[(value ^ bytes[i]) & 0xff] ^ (value >>> 8)
      : (table[((value >>> shift) ^ bytes[i]) & 0xff] ^ (value << 8)) & mask;
  return ((value ^ xor) >>> 0)
    .toString(16)
    .padStart(width / 4, "0")
    .toUpperCase();
}
export function luhnCheckDigit(input: string): string {
  if (!/^\d+$/.test(input))
    throw new Error("Enter digits only, without spaces or punctuation.");
  let sum = 0;
  for (let i = input.length - 1, double = true; i >= 0; i--, double = !double) {
    let digit = Number(input[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return String((10 - (sum % 10)) % 10);
}
export function luhnValid(input: string): boolean {
  if (!/^\d{2,}$/.test(input))
    throw new Error("Enter at least two digits, including the check digit.");
  return luhnCheckDigit(input.slice(0, -1)) === input.slice(-1);
}
