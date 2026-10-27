import { describe, expect, it } from "vitest";
import {
  buildEventPayload,
  buildGeoPayload,
  buildMailtoPayload,
  buildSmsPayload,
  buildTelPayload,
  buildVCardPayload,
  buildWifiPayload,
  escapeVCardText,
  escapeWifiValue,
} from "@/utils/qr-payload";
import { parseMailtoPayload, parseQrPayload, parseWifiPayload } from "@/utils/qr-reader";

describe("escapeWifiValue", () => {
  it("escapes backslash, semicolon, comma, colon and double quote", () => {
    expect(escapeWifiValue('a\\b;c,d:e"f')).toBe('a\\\\b\\;c\\,d\\:e\\"f');
  });

  it("leaves other characters alone", () => {
    expect(escapeWifiValue("Café 5G!")).toBe("Café 5G!");
  });
});

describe("buildWifiPayload", () => {
  it("builds a WPA payload", () => {
    expect(buildWifiPayload({ ssid: "Home", password: "secret", security: "WPA", hidden: false })).toBe(
      "WIFI:T:WPA;S:Home;P:secret;;",
    );
  });

  it("marks a hidden network", () => {
    expect(buildWifiPayload({ ssid: "Lab", password: "pw", security: "WPA", hidden: true })).toBe(
      "WIFI:T:WPA;S:Lab;P:pw;H:true;;",
    );
  });

  it("omits the password for an open network", () => {
    expect(buildWifiPayload({ ssid: "Cafe", password: "ignored", security: "nopass", hidden: false })).toBe(
      "WIFI:T:nopass;S:Cafe;;",
    );
  });

  it("escapes special characters in the name and password", () => {
    const payload = buildWifiPayload({ ssid: 'My;Net,"1"', password: "p:a\\ss", security: "WPA", hidden: false });
    expect(payload).toBe('WIFI:T:WPA;S:My\\;Net\\,\\"1\\";P:p\\:a\\\\ss;;');
  });

  it("round-trips through the QR Reader parser", () => {
    const payload = buildWifiPayload({ ssid: 'a;b,c:d"e\\f', password: ";;\\", security: "WEP", hidden: true });
    expect(parseWifiPayload(payload)).toEqual([
      { label: "Network name", value: 'a;b,c:d"e\\f' },
      { label: "Security", value: "WEP" },
      { label: "Password", value: ";;\\" },
      { label: "Hidden network", value: "Yes" },
    ]);
  });

  it("returns an empty string without a network name", () => {
    expect(buildWifiPayload({ ssid: "", password: "x", security: "WPA", hidden: false })).toBe("");
  });
});

describe("escapeVCardText", () => {
  it("escapes backslash, semicolon, comma and new lines", () => {
    expect(escapeVCardText("a\\b;c,d\r\ne\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
});

describe("buildVCardPayload", () => {
  it("builds a vCard 3.0 with CRLF line breaks", () => {
    expect(
      buildVCardPayload({
        firstName: "Ada",
        lastName: "Lovelace",
        organization: "Analytical, Inc.",
        title: "Engineer",
        phone: "+44 20 1234",
        email: "ada@example.com",
        website: "https://example.com",
        address: "",
        note: "",
      }),
    ).toBe(
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "N:Lovelace;Ada;;;",
        "FN:Ada Lovelace",
        "ORG:Analytical\\, Inc.",
        "TITLE:Engineer",
        "TEL;TYPE=CELL:+44 20 1234",
        "EMAIL:ada@example.com",
        "URL:https://example.com",
        "END:VCARD",
      ].join("\r\n"),
    );
  });

  it("escapes names and puts the address in the street field", () => {
    const payload = buildVCardPayload({
      firstName: "Jean;Luc",
      lastName: "",
      organization: "",
      title: "",
      phone: "",
      email: "",
      website: "",
      address: "1 Main St, Springfield",
      note: "line 1\nline 2",
    });
    expect(payload).toContain("N:;Jean\\;Luc;;;");
    expect(payload).toContain("FN:Jean\\;Luc");
    expect(payload).toContain("ADR:;;1 Main St\\, Springfield;;;;");
    expect(payload).toContain("NOTE:line 1\\nline 2");
  });

  it("returns an empty string without a name or organization", () => {
    expect(
      buildVCardPayload({ firstName: " ", lastName: "", organization: "", title: "", phone: "1", email: "", website: "", address: "", note: "" }),
    ).toBe("");
  });

  it("uses the organization as the display name when there is no name", () => {
    const payload = buildVCardPayload({ firstName: "", lastName: "", organization: "Acme", title: "", phone: "", email: "", website: "", address: "", note: "" });
    expect(payload).toContain("FN:Acme");
  });
});

describe("buildMailtoPayload", () => {
  it("builds an address-only link", () => {
    expect(buildMailtoPayload({ to: "team@example.com", subject: "", body: "" })).toBe("mailto:team@example.com");
  });

  it("encodes the subject and body, with CRLF line breaks", () => {
    const payload = buildMailtoPayload({ to: "a@example.com", subject: "Hi & bye?", body: "Line 1\nLine 2 100%" });
    expect(payload).toBe("mailto:a@example.com?subject=Hi%20%26%20bye%3F&body=Line%201%0D%0ALine%202%20100%25");
  });

  it("keeps several recipients readable", () => {
    expect(buildMailtoPayload({ to: "a@x.com, b@x.com", subject: "", body: "" })).toBe("mailto:a@x.com,b@x.com");
  });

  it("round-trips through the QR Reader parser", () => {
    const payload = buildMailtoPayload({ to: "a@example.com", subject: "Q&A = fun", body: "x+y" });
    expect(parseMailtoPayload(payload)).toEqual([
      { label: "To", value: "a@example.com" },
      { label: "Subject", value: "Q&A = fun" },
      { label: "Body", value: "x+y" },
    ]);
  });

  it("returns an empty string without an address", () => {
    expect(buildMailtoPayload({ to: "", subject: "Hello", body: "" })).toBe("");
  });
});

describe("buildTelPayload", () => {
  it("removes visual separators", () => {
    expect(buildTelPayload("+1 (555) 123-4567")).toBe("tel:+15551234567");
  });

  it("keeps * and # for service codes", () => {
    expect(buildTelPayload("*21#")).toBe("tel:*21#");
  });

  it("returns an empty string without digits", () => {
    expect(buildTelPayload(" - ")).toBe("");
  });
});

describe("buildSmsPayload", () => {
  it("builds an SMSTO payload with a message", () => {
    expect(buildSmsPayload({ number: "+1 555 0100", message: "Hello: world" })).toBe("SMSTO:+15550100:Hello: world");
  });

  it("builds an SMSTO payload without a message", () => {
    expect(buildSmsPayload({ number: "5550100", message: "" })).toBe("SMSTO:5550100:");
  });

  it("is recognized by the QR Reader parser", () => {
    expect(parseQrPayload(buildSmsPayload({ number: "5550100", message: "Hi" })).kind).toBe("sms");
  });
});

describe("buildGeoPayload", () => {
  it("builds a geo URI", () => {
    expect(buildGeoPayload({ latitude: " 52.5200 ", longitude: "13.405" })).toEqual({ payload: "geo:52.52,13.405" });
  });

  it("rejects coordinates out of range", () => {
    expect(buildGeoPayload({ latitude: "91", longitude: "0" }).error).toMatch(/latitude/i);
    expect(buildGeoPayload({ latitude: "0", longitude: "-181" }).error).toMatch(/longitude/i);
  });

  it("rejects text that is not a number", () => {
    expect(buildGeoPayload({ latitude: "north", longitude: "1" }).error).toMatch(/latitude/i);
  });

  it("returns an empty payload until both values are present", () => {
    expect(buildGeoPayload({ latitude: "1", longitude: "" })).toEqual({ payload: "" });
  });
});

describe("buildEventPayload", () => {
  const base = { title: "Launch", start: "2026-10-27T09:00", end: "2026-10-27T10:30", allDay: false, location: "", description: "" };

  it("builds a VEVENT with floating local times", () => {
    expect(buildEventPayload(base)).toEqual({
      payload: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "SUMMARY:Launch",
        "DTSTART:20261027T090000",
        "DTEND:20261027T103000",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    });
  });

  it("escapes text fields", () => {
    const { payload } = buildEventPayload({ ...base, title: "A, B; C", location: "Room 1\\2", description: "Bring:\nlaptop" });
    expect(payload).toContain("SUMMARY:A\\, B\\; C");
    expect(payload).toContain("LOCATION:Room 1\\\\2");
    expect(payload).toContain("DESCRIPTION:Bring:\\nlaptop");
  });

  it("builds an all-day event that ends the day after the last day", () => {
    const { payload } = buildEventPayload({ ...base, allDay: true, start: "2026-12-31", end: "2026-12-31" });
    expect(payload).toContain("DTSTART;VALUE=DATE:20261231");
    expect(payload).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("accepts date-time values for an all-day event", () => {
    const { payload } = buildEventPayload({ ...base, allDay: true });
    expect(payload).toContain("DTSTART;VALUE=DATE:20261027");
    expect(payload).toContain("DTEND;VALUE=DATE:20261028");
  });

  it("omits the end when it is empty", () => {
    const { payload } = buildEventPayload({ ...base, end: "" });
    expect(payload).not.toContain("DTEND");
  });

  it("rejects an end before the start", () => {
    expect(buildEventPayload({ ...base, end: "2026-10-27T08:00" }).error).toMatch(/end/i);
  });

  it("returns an empty payload without a title or start", () => {
    expect(buildEventPayload({ ...base, title: "" })).toEqual({ payload: "" });
    expect(buildEventPayload({ ...base, start: "" })).toEqual({ payload: "" });
  });
});
