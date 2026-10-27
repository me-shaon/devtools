import jsQR from "jsqr";

/** Images are scaled down so that the longest side is at most this many pixels before decoding. */
export const MAX_DECODE_SIDE = 2000;

export interface Point {
  x: number;
  y: number;
}

export interface QrLocation {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export interface QrDecodeResult {
  text: string;
  location: QrLocation;
}

export interface ImagePixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Scales a size down, keeping the aspect ratio, so that the longest side fits `maxSide`. Never scales up. */
export function fitWithin(width: number, height: number, maxSide = MAX_DECODE_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide || longest === 0) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Finds and decodes one QR code in RGBA pixels. Returns null when there is no readable code. */
export function decodeQrPixels({ data, width, height }: ImagePixels): QrDecodeResult | null {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return null;
  const code = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
  if (!code) return null;
  const { topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner } = code.location;
  return {
    text: code.data,
    location: {
      topLeft: { x: topLeftCorner.x, y: topLeftCorner.y },
      topRight: { x: topRightCorner.x, y: topRightCorner.y },
      bottomRight: { x: bottomRightCorner.x, y: bottomRightCorner.y },
      bottomLeft: { x: bottomLeftCorner.x, y: bottomLeftCorner.y },
    },
  };
}

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this image. Use a PNG, JPEG, GIF, WebP, or BMP file."));
    image.src = url;
  });

/** Draws an image file on a white background, scaled to fit `maxSide`, and returns its RGBA pixels. */
export async function readImagePixels(blob: Blob, maxSide = MAX_DECODE_SIDE): Promise<ImagePixels> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, maxSide);
    if (!width || !height) throw new Error("This image has no pixels.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not prepare the image for decoding.");
    // A white background makes transparent PNG codes readable.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    return { data: imageData.data, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Returns the first image file in a clipboard or drag-and-drop item list. */
export function firstImageFile(items: DataTransferItemList | null | undefined, files?: FileList | null): File | null {
  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
  }
  if (files) {
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) return file;
    }
  }
  return null;
}

export type QrPayloadKind = "url" | "wifi" | "email" | "phone" | "sms" | "text";

export interface QrPayloadField {
  label: string;
  value: string;
}

export interface QrPayload {
  kind: QrPayloadKind;
  label: string;
  fields: QrPayloadField[];
  /** A link the system can open: http(s) or mailto. */
  href?: string;
}

const KIND_LABELS: Record<QrPayloadKind, string> = {
  url: "URL",
  wifi: "Wi-Fi network",
  email: "Email",
  phone: "Phone number",
  sms: "SMS",
  text: "Plain text",
};

/**
 * Splits the body of a Wi-Fi payload into fields. Backslash escapes the next character,
 * so "\;" is a literal semicolon.
 */
function splitWifiFields(body: string): Map<string, string> {
  const fields = new Map<string, string>();
  let key = "";
  let value = "";
  let inValue = false;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === "\\" && i + 1 < body.length) {
      if (inValue) value += body[i + 1];
      else key += body[i + 1];
      i++;
    } else if (!inValue && char === ":") {
      inValue = true;
    } else if (char === ";") {
      if (key) fields.set(key.toUpperCase(), value);
      key = "";
      value = "";
      inValue = false;
    } else if (inValue) {
      value += char;
    } else {
      key += char;
    }
  }
  if (key) fields.set(key.toUpperCase(), value);
  return fields;
}

const SECURITY_LABELS: Record<string, string> = {
  WPA: "WPA/WPA2",
  WPA2: "WPA2",
  WPA3: "WPA3",
  SAE: "WPA3",
  WEP: "WEP",
  NOPASS: "None",
  "": "None",
};

export function parseWifiPayload(text: string): QrPayloadField[] | null {
  if (!/^WIFI:/i.test(text)) return null;
  const fields = splitWifiFields(text.slice(5));
  if (!fields.has("S")) return null;
  const security = (fields.get("T") ?? "").toUpperCase();
  const rows: QrPayloadField[] = [
    { label: "Network name", value: fields.get("S") ?? "" },
    { label: "Security", value: SECURITY_LABELS[security] ?? (fields.get("T") ?? "") },
  ];
  const password = fields.get("P");
  if (password !== undefined && security !== "NOPASS") rows.push({ label: "Password", value: password });
  if (/^true$/i.test(fields.get("H") ?? "")) rows.push({ label: "Hidden network", value: "Yes" });
  return rows;
}

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export function parseMailtoPayload(text: string): QrPayloadField[] | null {
  const match = /^mailto:([^?]*)(?:\?(.*))?$/is.exec(text);
  if (!match) return null;
  const rows: QrPayloadField[] = [{ label: "To", value: safeDecode(match[1]) }];
  const params = new URLSearchParams(match[2] ?? "");
  const named: Array<[string, string]> = [["cc", "Cc"], ["bcc", "Bcc"], ["subject", "Subject"], ["body", "Body"]];
  for (const [key, label] of named) {
    const value = params.get(key);
    if (value) rows.push({ label, value });
  }
  return rows;
}

/** Recognizes common QR payload formats and splits them into labeled fields. */
export function parseQrPayload(raw: string): QrPayload {
  const text = raw.trim();

  const wifi = parseWifiPayload(text);
  if (wifi) return { kind: "wifi", label: KIND_LABELS.wifi, fields: wifi };

  const email = parseMailtoPayload(text);
  if (email) return { kind: "email", label: KIND_LABELS.email, fields: email, href: text };

  const tel = /^tel:(.+)$/i.exec(text);
  if (tel) return { kind: "phone", label: KIND_LABELS.phone, fields: [{ label: "Number", value: safeDecode(tel[1]) }] };

  const sms = /^(?:smsto|sms):([^:?]+)(?:[:?](?:body=)?(.*))?$/is.exec(text);
  if (sms) {
    const fields = [{ label: "Number", value: sms[1] }];
    if (sms[2]) fields.push({ label: "Message", value: safeDecode(sms[2]) });
    return { kind: "sms", label: KIND_LABELS.sms, fields };
  }

  if (/^https?:\/\/\S+$/i.test(text)) {
    try {
      const url = new URL(text);
      return { kind: "url", label: KIND_LABELS.url, fields: [{ label: "Host", value: url.host }], href: url.href };
    } catch {
      /* Not a valid URL. Show it as text. */
    }
  }

  return { kind: "text", label: KIND_LABELS.text, fields: [] };
}
