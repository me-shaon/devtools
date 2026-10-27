/**
 * Builders for the text that common QR code types carry: Wi-Fi, contact (vCard), email,
 * phone, SMS, location and calendar event. Each builder returns an empty payload until
 * the required fields are present.
 */

export type WifiSecurity = "WPA" | "WEP" | "nopass";

export interface WifiFields {
  ssid: string;
  password: string;
  security: WifiSecurity;
  hidden: boolean;
}

/** Wi-Fi payload values escape \ ; , : and " with a backslash. */
export const escapeWifiValue = (value: string) => value.replace(/[\\;,:"]/g, (char) => `\\${char}`);

/** Builds a WIFI: payload, the format that iOS and Android cameras join. */
export function buildWifiPayload({ ssid, password, security, hidden }: WifiFields): string {
  if (!ssid) return "";
  let payload = `WIFI:T:${security};S:${escapeWifiValue(ssid)};`;
  if (security !== "nopass") payload += `P:${escapeWifiValue(password)};`;
  if (hidden) payload += "H:true;";
  return `${payload};`;
}

export interface ContactFields {
  firstName: string;
  lastName: string;
  organization: string;
  title: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  note: string;
}

/** vCard and iCalendar text values escape \ ; and , and write new lines as \n. */
export const escapeVCardText = (value: string) =>
  value.replace(/[\\;,]/g, (char) => `\\${char}`).replace(/\r\n|\r|\n/g, "\\n");

/** Builds a vCard 3.0 contact. vCard needs CRLF line breaks. */
export function buildVCardPayload(fields: ContactFields): string {
  const value = (key: keyof ContactFields) => escapeVCardText(fields[key].trim());
  const first = value("firstName");
  const last = value("lastName");
  const organization = value("organization");
  const displayName = [first, last].filter(Boolean).join(" ") || organization;
  if (!displayName) return "";

  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${last};${first};;;`, `FN:${displayName}`];
  const add = (line: string, text: string) => {
    if (text) lines.push(`${line}${text}`);
  };
  add("ORG:", organization);
  add("TITLE:", value("title"));
  add("TEL;TYPE=CELL:", value("phone"));
  add("EMAIL:", value("email"));
  add("URL:", value("website"));
  // One free-form line goes in the street field, so readers show it as the address.
  if (value("address")) lines.push(`ADR:;;${value("address")};;;;`);
  add("NOTE:", value("note"));
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export interface EmailFields {
  to: string;
  subject: string;
  body: string;
}

/** Percent-encodes a mailto value. Mail clients expect CRLF line breaks (RFC 6068). */
const encodeMailtoValue = (value: string) => encodeURIComponent(value.replace(/\r?\n/g, "\r\n"));

/** Builds a mailto: link with an optional subject and body. */
export function buildMailtoPayload({ to, subject, body }: EmailFields): string {
  const recipients = to
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .map((address) => encodeURIComponent(address).replace(/%40/g, "@"));
  if (recipients.length === 0) return "";

  const query = [
    subject && `subject=${encodeMailtoValue(subject)}`,
    body && `body=${encodeMailtoValue(body)}`,
  ].filter(Boolean);
  return `mailto:${recipients.join(",")}${query.length ? `?${query.join("&")}` : ""}`;
}

/** Keeps the characters a dialer uses: digits, a leading +, * and #. */
const cleanPhoneNumber = (number: string) => number.replace(/[^\d+*#]/g, "");

/** Builds a tel: link. Spaces, dashes, dots and parentheses are removed. */
export function buildTelPayload(number: string): string {
  const cleaned = cleanPhoneNumber(number);
  return /\d/.test(cleaned) ? `tel:${cleaned}` : "";
}

export interface SmsFields {
  number: string;
  message: string;
}

/** Builds an SMSTO: payload. iOS and Android cameras both open it in the messages app. */
export function buildSmsPayload({ number, message }: SmsFields): string {
  const cleaned = cleanPhoneNumber(number);
  return /\d/.test(cleaned) ? `SMSTO:${cleaned}:${message}` : "";
}

export interface PayloadResult {
  payload: string;
  error?: string;
}

export interface GeoFields {
  latitude: string;
  longitude: string;
}

const parseCoordinate = (text: string, limit: number) => {
  const trimmed = text.trim();
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Math.abs(value) <= limit ? value : null;
};

/** Builds a geo: URI. Map apps open it at the point. */
export function buildGeoPayload({ latitude, longitude }: GeoFields): PayloadResult {
  if (!latitude.trim() || !longitude.trim()) return { payload: "" };
  const lat = parseCoordinate(latitude, 90);
  if (lat === null) return { payload: "", error: "Enter a latitude from -90 to 90." };
  const lng = parseCoordinate(longitude, 180);
  if (lng === null) return { payload: "", error: "Enter a longitude from -180 to 180." };
  return { payload: `geo:${lat},${lng}` };
}

export interface EventFields {
  title: string;
  /** A datetime-local value (2026-10-27T09:00), or a date (2026-10-27) for an all-day event. */
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
}

const digits = (value: string) => value.replace(/\D/g, "");

/** 2026-10-27T09:00 becomes 20261027T090000, a floating time in the scanner's time zone. */
const toICalDateTime = (value: string) => {
  const [date, time = "00:00"] = value.split("T");
  return `${digits(date)}T${digits(time).padEnd(6, "0").slice(0, 6)}`;
};

const toICalDate = (value: string) => digits(value.split("T")[0]);

/** An all-day DTEND is exclusive, so it is the day after the last day. */
const nextDay = (value: string) => {
  const [year, month, day] = value.split("T")[0].split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10).replace(/-/g, "");
};

/** Builds an iCalendar event. Phone cameras offer to add it to the calendar. */
export function buildEventPayload(fields: EventFields): PayloadResult {
  const title = fields.title.trim();
  if (!title || !fields.start) return { payload: "" };

  const sortKey = (value: string) => (fields.allDay ? value.split("T")[0] : value);
  if (fields.end && sortKey(fields.end) < sortKey(fields.start)) {
    return { payload: "", error: "The end must be after the start." };
  }

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `SUMMARY:${escapeVCardText(title)}`];
  if (fields.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toICalDate(fields.start)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDay(fields.end || fields.start)}`);
  } else {
    lines.push(`DTSTART:${toICalDateTime(fields.start)}`);
    if (fields.end) lines.push(`DTEND:${toICalDateTime(fields.end)}`);
  }
  if (fields.location.trim()) lines.push(`LOCATION:${escapeVCardText(fields.location.trim())}`);
  if (fields.description.trim()) lines.push(`DESCRIPTION:${escapeVCardText(fields.description.trim())}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return { payload: lines.join("\r\n") };
}
