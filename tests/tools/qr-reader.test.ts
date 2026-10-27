import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import {
  decodeQrPixels,
  fitWithin,
  parseMailtoPayload,
  parseQrPayload,
  parseWifiPayload,
  type ImagePixels,
} from "@/utils/qr-reader";

/** Renders a QR code to RGBA pixels with a 4-module quiet zone, as an image file would hold it. */
function qrPixels(text: string, { scale = 4, invert = false } = {}): ImagePixels {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const quiet = 4;
  const width = (modules.size + quiet * 2) * scale;
  const light = invert ? 0 : 255;
  const dark = invert ? 255 : 0;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const row = Math.floor(y / scale) - quiet;
      const col = Math.floor(x / scale) - quiet;
      const inside = row >= 0 && col >= 0 && row < modules.size && col < modules.size;
      const value = inside && modules.get(row, col) ? dark : light;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { data, width, height: width };
}

describe("decodeQrPixels", () => {
  it.each(["hello", "https://example.com/a?b=1", "WIFI:S:Home;T:WPA;P:secret;;", "Unicode: éè 你好"])(
    "decodes a generated code: %s",
    (text) => {
      const result = decodeQrPixels(qrPixels(text));
      expect(result?.text).toBe(text);
    },
  );

  it("returns the corner points inside the image", () => {
    const pixels = qrPixels("corners", { scale: 5 });
    const result = decodeQrPixels(pixels);
    expect(result).not.toBeNull();
    const { topLeft, bottomRight } = result!.location;
    expect(topLeft.x).toBeLessThan(bottomRight.x);
    expect(topLeft.y).toBeLessThan(bottomRight.y);
    // The code starts after the 4-module quiet zone of 20 px.
    expect(topLeft.x).toBeGreaterThan(15);
    expect(bottomRight.x).toBeLessThan(pixels.width);
  });

  it("reads light codes on a dark background", () => {
    expect(decodeQrPixels(qrPixels("inverted", { invert: true }))?.text).toBe("inverted");
  });

  it("returns null when there is no code", () => {
    const blank = { data: new Uint8ClampedArray(100 * 100 * 4).fill(255), width: 100, height: 100 };
    expect(decodeQrPixels(blank)).toBeNull();
    expect(decodeQrPixels({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toBeNull();
  });
});

describe("fitWithin", () => {
  it("scales the longest side down to the limit and keeps the ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(1000, 6000)).toEqual({ width: 333, height: 2000 });
  });

  it("does not scale small images up", () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
  });
});

describe("parseQrPayload", () => {
  it("parses Wi-Fi settings, including escaped characters", () => {
    expect(parseWifiPayload("WIFI:T:WPA;S:My\\;Net;P:pa\\:ss\\\\word;H:true;;")).toEqual([
      { label: "Network name", value: "My;Net" },
      { label: "Security", value: "WPA/WPA2" },
      { label: "Password", value: "pa:ss\\word" },
      { label: "Hidden network", value: "Yes" },
    ]);
    const open = parseQrPayload("WIFI:S:Cafe;T:nopass;P:;;");
    expect(open.kind).toBe("wifi");
    expect(open.fields).toEqual([
      { label: "Network name", value: "Cafe" },
      { label: "Security", value: "None" },
    ]);
    expect(parseWifiPayload("WIFI:T:WPA;;")).toBeNull();
  });

  it("parses mailto links", () => {
    expect(parseMailtoPayload("mailto:a@example.com?subject=Hi%20there&body=Line+one")).toEqual([
      { label: "To", value: "a@example.com" },
      { label: "Subject", value: "Hi there" },
      { label: "Body", value: "Line one" },
    ]);
    const payload = parseQrPayload("MAILTO:b@example.com");
    expect(payload).toMatchObject({ kind: "email", label: "Email", href: "MAILTO:b@example.com" });
  });

  it("recognizes URLs and gives a link to open", () => {
    const payload = parseQrPayload("https://example.com/path?q=1");
    expect(payload).toMatchObject({ kind: "url", label: "URL", href: "https://example.com/path?q=1" });
    expect(payload.fields).toEqual([{ label: "Host", value: "example.com" }]);
    expect(parseQrPayload("javascript:alert(1)").kind).toBe("text");
    expect(parseQrPayload("https://exa mple.com").kind).toBe("text");
  });

  it("recognizes phone numbers, SMS, and plain text", () => {
    expect(parseQrPayload("tel:+1-555-0100")).toMatchObject({ kind: "phone", fields: [{ label: "Number", value: "+1-555-0100" }] });
    expect(parseQrPayload("tel:+1-555-0100").href).toBeUndefined();
    expect(parseQrPayload("SMSTO:+15550100:Hello")).toMatchObject({
      kind: "sms",
      fields: [{ label: "Number", value: "+15550100" }, { label: "Message", value: "Hello" }],
    });
    expect(parseQrPayload("just some words")).toMatchObject({ kind: "text", label: "Plain text", fields: [] });
  });
});
