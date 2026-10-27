import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Download, ImagePlus, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { saveFile } from "@/lib/desktop";
import {
  QR_QUIET_ZONE,
  buildQrSvg,
  encodeQr,
  getLogoBox,
  type EncodedQr,
  type QrErrorCorrectionChoice,
} from "@/utils/qr";
import {
  buildEventPayload,
  buildGeoPayload,
  buildMailtoPayload,
  buildSmsPayload,
  buildTelPayload,
  buildVCardPayload,
  buildWifiPayload,
  type ContactFields,
  type EmailFields,
  type EventFields,
  type GeoFields,
  type PayloadResult,
  type SmsFields,
  type WifiFields,
  type WifiSecurity,
} from "@/utils/qr-payload";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which content types can I encode?",
    a: "Text or URL, Wi-Fi network, contact (vCard 3.0), email (mailto), phone (tel), SMS (SMSTO), location (geo) and calendar event (iCalendar). Each form writes the payload text, which the tool shows under the form.",
  },
  {
    q: "Which error correction level should I use?",
    a: "Auto uses level M, which recovers about 15% of a damaged code. With a logo, Auto uses level H, which recovers about 30%. If the content does not fit, Auto drops one level. A lower level gives a smaller, simpler code.",
  },
  {
    q: "Will a code with a logo still scan?",
    a: "Yes, at level H or Q. The logo covers a square in the center of about a fifth of the width. That hides about 5% of the modules, well inside what level H recovers. Test the code with a phone before you print it.",
  },
  {
    q: "How are special characters in a Wi-Fi name or password handled?",
    a: "The tool escapes \\ ; , : and \" with a backslash, as the Wi-Fi QR format requires. Phones then read the exact name and password.",
  },
  {
    q: "Which time zone does an event use?",
    a: "The event uses floating local time. A phone shows it at the same clock time in any time zone. All-day events use dates only.",
  },
  {
    q: "Should I save a PNG or an SVG?",
    a: "Save an SVG for print, such as posters and flyers. It stays sharp at any size. Save a PNG for slides, chat and web pages. The PNG uses the size you choose.",
  },
  {
    q: "Is my content sent anywhere?",
    a: "No. The code is generated on this device.",
  },
];

type Template = "text" | "wifi" | "contact" | "email" | "phone" | "sms" | "location" | "event";

const TEMPLATES: Array<{ value: Template; label: string; title: string; hint: string }> = [
  { value: "text", label: "Text", title: "Text or URL", hint: "Enter text or a URL." },
  { value: "wifi", label: "Wi-Fi", title: "Wi-Fi network", hint: "Enter the network name." },
  { value: "contact", label: "Contact", title: "Contact", hint: "Enter a name or an organization." },
  { value: "email", label: "Email", title: "Email", hint: "Enter an email address." },
  { value: "phone", label: "Phone", title: "Phone number", hint: "Enter a phone number." },
  { value: "sms", label: "SMS", title: "SMS", hint: "Enter a phone number." },
  { value: "location", label: "Location", title: "Location", hint: "Enter the latitude and longitude." },
  { value: "event", label: "Event", title: "Calendar event", hint: "Enter a title and a start time." },
];

const LEVEL_OPTIONS: Array<{ value: QrErrorCorrectionChoice; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "L", label: "L · 7%" },
  { value: "M", label: "M · 15%" },
  { value: "Q", label: "Q · 25%" },
  { value: "H", label: "H · 30%" },
];

interface Logo {
  name: string;
  dataUrl: string;
}

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const canvasToPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No image"))), "image/png"),
  );

const canCopyImage = () =>
  typeof ClipboardItem !== "undefined" && typeof navigator !== "undefined" && typeof navigator.clipboard?.write === "function";

/** Draws the code on the canvas. Module edges are rounded to whole pixels, so no seams show. */
function drawQr(canvas: HTMLCanvasElement, matrix: boolean[][], size: number, logo: HTMLImageElement | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const count = matrix.length;
  const unit = size / (count + QR_QUIET_ZONE * 2);
  const edge = (modules: number) => Math.round((modules + QR_QUIET_ZONE) * unit);

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) ctx.fillRect(edge(x), edge(y), edge(x + 1) - edge(x), edge(y + 1) - edge(y));
    }),
  );

  if (!logo) return;
  const box = getLogoBox(count);
  const start = edge(box.start);
  const end = edge(box.start + box.size);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(start, start, end - start, end - start);
  // Keep half a module of white around the logo and keep its aspect ratio.
  const room = end - start - unit;
  const scale = Math.min(room / (logo.naturalWidth || 1), room / (logo.naturalHeight || 1));
  const width = (logo.naturalWidth || 1) * scale;
  const height = (logo.naturalHeight || 1) * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(logo, start + (end - start - width) / 2, start + (end - start - height) / 2, width, height);
}

function Field({ id, label, wide, children }: { id: string; label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`grid content-start gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

const inputProps = { className: "h-8 text-sm", autoComplete: "off", spellCheck: false } as const;

export function QrGenerator() {
  const [template, setTemplate] = useState<Template>("text");
  const [text, setText] = useState("");
  const [wifi, setWifi] = useState<WifiFields>({ ssid: "", password: "", security: "WPA", hidden: false });
  const [contact, setContact] = useState<ContactFields>({
    firstName: "", lastName: "", organization: "", title: "", phone: "", email: "", website: "", address: "", note: "",
  });
  const [email, setEmail] = useState<EmailFields>({ to: "", subject: "", body: "" });
  const [phone, setPhone] = useState("");
  const [sms, setSms] = useState<SmsFields>({ number: "", message: "" });
  const [geo, setGeo] = useState<GeoFields>({ latitude: "", longitude: "" });
  const [event, setEvent] = useState<EventFields>({ title: "", start: "", end: "", allDay: false, location: "", description: "" });
  const [level, setLevel] = useState<QrErrorCorrectionChoice>("auto");
  const [size, setSize] = useState(512);
  const [logo, setLogo] = useState<Logo | null>(null);
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  const [logoError, setLogoError] = useState("");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const current = TEMPLATES.find((item) => item.value === template) ?? TEMPLATES[0];

  const result: PayloadResult = useMemo(() => {
    switch (template) {
      case "wifi": return { payload: buildWifiPayload(wifi) };
      case "contact": return { payload: buildVCardPayload(contact) };
      case "email": return { payload: buildMailtoPayload(email) };
      case "phone": return { payload: buildTelPayload(phone) };
      case "sms": return { payload: buildSmsPayload(sms) };
      case "location": return buildGeoPayload(geo);
      case "event": return buildEventPayload(event);
      default: return { payload: text };
    }
  }, [template, text, wifi, contact, email, phone, sms, geo, event]);

  const payload = useDebouncedValue(result.payload);
  const hasLogo = Boolean(logo);

  const encoded = useMemo((): { qr: EncodedQr | null; tooLong: boolean } => {
    if (!payload) return { qr: null, tooLong: false };
    try {
      return { qr: encodeQr(payload, level, hasLogo), tooLong: false };
    } catch {
      return { qr: null, tooLong: true };
    }
  }, [payload, level, hasLogo]);
  const qr = encoded.qr;

  useEffect(() => {
    if (qr && canvasRef.current) drawQr(canvasRef.current, qr.matrix, size, logoImage);
  }, [qr, size, logoImage]);

  useEffect(() => {
    if (!logo) {
      setLogoImage(null);
      return;
    }
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active) setLogoImage(image);
    };
    image.onerror = () => {
      if (!active) return;
      setLogo(null);
      setLogoError("This image cannot be used as a logo. Choose a PNG, JPEG or SVG file.");
    };
    image.src = logo.dataUrl;
    return () => {
      active = false;
    };
  }, [logo]);

  const chooseLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Choose an image file for the logo, such as a PNG or SVG.");
      return;
    }
    try {
      setLogo({ name: file.name, dataUrl: await readDataUrl(file) });
      setLogoError("");
    } catch {
      setLogoError("Could not read the logo file.");
    }
  };

  const savePng = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let blob: Blob;
    try {
      blob = await canvasToPng(canvas);
    } catch {
      toast.error("Unable to create the QR code image.");
      return;
    }
    try {
      if (await saveFile(blob, `qr-code-${Date.now()}.png`)) toast.success("QR code saved.");
    } catch (error) {
      console.error("Failed to save QR code:", error);
      toast.error("Unable to save the QR code.");
    }
  };

  const saveSvg = async () => {
    if (!qr) return;
    const svg = buildQrSvg(qr.matrix, { size, logo: logo?.dataUrl });
    try {
      if (await saveFile(new Blob([svg], { type: "image/svg+xml" }), `qr-code-${Date.now()}.svg`)) toast.success("QR code saved.");
    } catch (error) {
      console.error("Failed to save QR code:", error);
      toast.error("Unable to save the QR code.");
    }
  };

  const copyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      // Safari needs the item made during the click, with the image as a promise.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": canvasToPng(canvas) })]);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy the image. Save it as a PNG instead.");
    }
  };

  const wifiField = (key: "ssid" | "password", value: string) => setWifi((state) => ({ ...state, [key]: value }));
  const contactInput = (key: keyof ContactFields, label: string, type = "text", wide = false) => (
    <Field id={`qr-contact-${key}`} label={label} wide={wide}>
      <Input id={`qr-contact-${key}`} type={type} {...inputProps} value={contact[key]}
        onChange={(e) => setContact((state) => ({ ...state, [key]: e.target.value }))} />
    </Field>
  );

  const setAllDay = (allDay: boolean) =>
    setEvent((state) => {
      const convert = (value: string, time: string) =>
        !value ? value : allDay ? value.split("T")[0] : value.includes("T") ? value : `${value}T${time}`;
      return { ...state, allDay, start: convert(state.start, "09:00"), end: convert(state.end, "10:00") };
    });

  const form = () => {
    switch (template) {
      case "wifi":
        return (
          <>
            <Field id="qr-wifi-ssid" label="Network name (SSID)">
              <Input id="qr-wifi-ssid" {...inputProps} value={wifi.ssid} onChange={(e) => wifiField("ssid", e.target.value)} />
            </Field>
            <Field id="qr-wifi-security" label="Security">
              <select id="qr-wifi-security" className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={wifi.security}
                onChange={(e) => setWifi((state) => ({ ...state, security: e.target.value as WifiSecurity }))}>
                <option value="WPA">WPA, WPA2 or WPA3</option>
                <option value="WEP">WEP</option>
                <option value="nopass">None (open network)</option>
              </select>
            </Field>
            {wifi.security !== "nopass" && (
              <Field id="qr-wifi-password" label="Password">
                <Input id="qr-wifi-password" {...inputProps} value={wifi.password} onChange={(e) => wifiField("password", e.target.value)} />
              </Field>
            )}
            <div className="flex items-end pb-1.5">
              <label className="option-switch" htmlFor="qr-wifi-hidden">
                Hidden network
                <Switch id="qr-wifi-hidden" checked={wifi.hidden} onCheckedChange={(hidden) => setWifi((state) => ({ ...state, hidden }))} />
              </label>
            </div>
          </>
        );
      case "contact":
        return (
          <>
            {contactInput("firstName", "First name")}
            {contactInput("lastName", "Last name")}
            {contactInput("organization", "Organization")}
            {contactInput("title", "Job title")}
            {contactInput("phone", "Phone", "tel")}
            {contactInput("email", "Email", "email")}
            {contactInput("website", "Website", "url", true)}
            {contactInput("address", "Address", "text", true)}
            {contactInput("note", "Note", "text", true)}
          </>
        );
      case "email":
        return (
          <>
            <Field id="qr-email-to" label="To" wide>
              <Input id="qr-email-to" type="email" multiple {...inputProps} placeholder="name@example.com" value={email.to}
                onChange={(e) => setEmail((state) => ({ ...state, to: e.target.value }))} />
            </Field>
            <Field id="qr-email-subject" label="Subject" wide>
              <Input id="qr-email-subject" {...inputProps} value={email.subject}
                onChange={(e) => setEmail((state) => ({ ...state, subject: e.target.value }))} />
            </Field>
            <Field id="qr-email-body" label="Body" wide>
              <Textarea id="qr-email-body" className="text-sm" value={email.body}
                onChange={(e) => setEmail((state) => ({ ...state, body: e.target.value }))} />
            </Field>
          </>
        );
      case "phone":
        return (
          <Field id="qr-phone" label="Phone number">
            <Input id="qr-phone" type="tel" {...inputProps} placeholder="+1 555 0100" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        );
      case "sms":
        return (
          <>
            <Field id="qr-sms-number" label="Phone number">
              <Input id="qr-sms-number" type="tel" {...inputProps} placeholder="+1 555 0100" value={sms.number}
                onChange={(e) => setSms((state) => ({ ...state, number: e.target.value }))} />
            </Field>
            <Field id="qr-sms-message" label="Message" wide>
              <Textarea id="qr-sms-message" className="text-sm" value={sms.message}
                onChange={(e) => setSms((state) => ({ ...state, message: e.target.value }))} />
            </Field>
          </>
        );
      case "location":
        return (
          <>
            <Field id="qr-geo-latitude" label="Latitude">
              <Input id="qr-geo-latitude" inputMode="decimal" {...inputProps} placeholder="52.5200" value={geo.latitude}
                onChange={(e) => setGeo((state) => ({ ...state, latitude: e.target.value }))} />
            </Field>
            <Field id="qr-geo-longitude" label="Longitude">
              <Input id="qr-geo-longitude" inputMode="decimal" {...inputProps} placeholder="13.4050" value={geo.longitude}
                onChange={(e) => setGeo((state) => ({ ...state, longitude: e.target.value }))} />
            </Field>
          </>
        );
      case "event":
        return (
          <>
            <Field id="qr-event-title" label="Title" wide>
              <Input id="qr-event-title" {...inputProps} value={event.title}
                onChange={(e) => setEvent((state) => ({ ...state, title: e.target.value }))} />
            </Field>
            <Field id="qr-event-start" label="Start">
              <Input id="qr-event-start" type={event.allDay ? "date" : "datetime-local"} className="h-8 text-sm" value={event.start}
                onChange={(e) => setEvent((state) => ({ ...state, start: e.target.value }))} />
            </Field>
            <Field id="qr-event-end" label="End">
              <Input id="qr-event-end" type={event.allDay ? "date" : "datetime-local"} className="h-8 text-sm" value={event.end}
                onChange={(e) => setEvent((state) => ({ ...state, end: e.target.value }))} />
            </Field>
            <div className="sm:col-span-2">
              <label className="option-switch" htmlFor="qr-event-all-day">
                All-day event
                <Switch id="qr-event-all-day" checked={event.allDay} onCheckedChange={setAllDay} />
              </label>
            </div>
            <Field id="qr-event-location" label="Location" wide>
              <Input id="qr-event-location" {...inputProps} value={event.location}
                onChange={(e) => setEvent((state) => ({ ...state, location: e.target.value }))} />
            </Field>
            <Field id="qr-event-description" label="Description" wide>
              <Textarea id="qr-event-description" className="text-sm" value={event.description}
                onChange={(e) => setEvent((state) => ({ ...state, description: e.target.value }))} />
            </Field>
          </>
        );
      default:
        return null;
    }
  };

  const lowLevelWithLogo = hasLogo && (level === "L" || level === "M");
  const notice = result.error ? (
    <div className="workspace-notice" data-tone="error" role="alert">{result.error}</div>
  ) : encoded.tooLong ? (
    <div className="workspace-notice" data-tone="error" role="alert">
      This content is too long for a QR code{level === "auto" ? "" : ` at level ${level}`}. Shorten it{level === "auto" || level === "L" ? "" : " or choose a lower level"}.
    </div>
  ) : logoError ? (
    <div className="workspace-notice" data-tone="error" role="alert">{logoError}</div>
  ) : lowLevelWithLogo ? (
    <div className="workspace-notice" role="status">The logo hides part of the code. Use level Q or H so phones can still scan it.</div>
  ) : undefined;

  const bytes = useMemo(() => new TextEncoder().encode(payload).length, [payload]);
  const autoLevel = level === "auto" && qr ? qr.level : hasLogo ? "H" : "M";

  return (
    <ToolWorkspace
      id="qr-generator"
      toolbar={
        <>
          <Tabs value={template} onValueChange={(value) => setTemplate(value as Template)}>
            <TabsList aria-label="Content type">
              {TEMPLATES.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <label className="indent-control">
            Error correction
            <select aria-label="Error correction" value={level} onChange={(e) => setLevel(e.target.value as QrErrorCorrectionChoice)}>
              {LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value === "auto" ? `Auto (${autoLevel})` : option.label}
                </option>
              ))}
            </select>
          </label>
        </>
      }
      notice={notice}
      first={
        template === "text" ? (
          <EditorPane title="Text or URL" htmlFor="qr-text" scroll={false}>
            <CodeTextarea id="qr-text" placeholder="https://example.com" value={text} onChange={(e) => setText(e.target.value)} />
          </EditorPane>
        ) : (
          <EditorPane title={current.title}>
            <div className="grid gap-3 p-4 sm:grid-cols-2">{form()}</div>
            <div className="grid gap-1.5 border-t px-4 py-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="qr-payload" className="text-xs font-medium">Payload</Label>
                <CopyButton value={result.payload} label="Copy payload" />
              </div>
              <textarea
                id="qr-payload"
                readOnly
                rows={Math.min(Math.max(result.payload.split("\n").length, 2), 12)}
                placeholder={current.hint}
                value={result.payload}
                spellCheck={false}
                className="w-full resize-none rounded-md border border-input bg-muted/40 px-3 py-2 font-mono text-xs"
              />
            </div>
          </EditorPane>
        )
      }
      second={
        <EditorPane
          title="QR code"
          actions={
            qr ? (
              <>
                {canCopyImage() && (
                  <button type="button" className="toolbar-text-button" onClick={copyImage} data-copied={copied || undefined}>
                    {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                    {copied ? "Copied" : "Copy image"}
                    <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
                  </button>
                )}
                <button type="button" className="toolbar-text-button" onClick={savePng}>
                  <Download size={14} aria-hidden="true" />
                  Save PNG
                </button>
                <button type="button" className="toolbar-text-button" onClick={saveSvg}>
                  <Download size={14} aria-hidden="true" />
                  Save SVG
                </button>
              </>
            ) : undefined
          }
        >
          <div className="pane-options">
            <span className="font-medium">PNG size</span>
            <Slider className="min-w-32 flex-1" value={[size]} onValueChange={([value]) => setSize(value)}
              min={128} max={1024} step={64} aria-label="PNG size" />
            <span className="w-24 text-muted-foreground">{size} × {size} px</span>
          </div>
          <div className="pane-options">
            <span className="font-medium">Logo</span>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="qr-logo-input"
              onChange={(e) => {
                void chooseLogo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {logo ? (
              <>
                <span className="min-w-0 truncate text-muted-foreground">{logo.name}</span>
                <button type="button" className="toolbar-text-button" onClick={() => setLogo(null)}>
                  <X size={14} aria-hidden="true" />
                  Remove logo
                </button>
              </>
            ) : (
              <button type="button" className="toolbar-text-button" onClick={() => logoInputRef.current?.click()}>
                <ImagePlus size={14} aria-hidden="true" />
                Add logo
              </button>
            )}
          </div>
          {qr ? (
            <div className="flex justify-center p-6">
              <canvas
                ref={canvasRef}
                width={size}
                height={size}
                role="img"
                aria-label="QR code preview"
                className="h-auto w-full max-w-[320px] rounded-md border border-border"
              />
            </div>
          ) : (
            <PaneEmpty icon={<QrCode size={22} aria-hidden="true" />} title="The QR code appears here" hint={current.hint} />
          )}
        </EditorPane>
      }
      status={
        qr ? (
          <>
            <span>Version {qr.version} · {qr.matrix.length} × {qr.matrix.length} modules</span>
            <span>Level {qr.level}</span>
            <span>{bytes} {bytes === 1 ? "byte" : "bytes"}</span>
          </>
        ) : encoded.tooLong ? (
          <span className="text-destructive">Too long · {bytes} bytes</span>
        ) : (
          <span>Ready</span>
        )
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
