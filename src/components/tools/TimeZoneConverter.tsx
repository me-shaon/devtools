import { useMemo, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpToLine, X } from "lucide-react";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import {
  formatInTimeZone,
  getLocalTimeZone,
  getWallClock,
  isValidTimeZone,
  listTimeZones,
  loadSavedTimeZones,
  saveTimeZones,
} from "@/utils/timestamp";
import { canonicalTimeZone, dayShift, formatWallClockInput, parseWallClockInput, resolveWallClock } from "@/utils/time-zone";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "How do I convert UTC to local time, or local time to UTC?",
    a: "Set From to UTC and enter the UTC time. The Local row shows your time. For the other direction, set From to your own zone. The UTC row shows the result.",
  },
  {
    q: "What happens when clocks change for daylight saving time?",
    a: "When clocks move forward, some times do not exist. The tool moves such a time ahead by the gap and says so. When clocks move back, some times happen twice. The tool shows the first one, and you can switch to the second one.",
  },
  {
    q: "What does Convert from this zone do?",
    a: "It makes that row the new source and keeps the same moment. Use it to convert in the other direction.",
  },
  {
    q: "Where do the time zones come from?",
    a: "They come from the time zone data built into the app. The tool makes no network calls. The Timestamp tool uses the same saved list of zones.",
  },
];

const storage = () => (typeof window !== "undefined" ? window.localStorage : undefined);

const formatShift = (days: number) => (days === 0 ? "" : `${days > 0 ? "+" : "−"}${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`);

export function TimeZoneConverter() {
  const localZone = useMemo(() => {
    const zone = getLocalTimeZone();
    return isValidTimeZone(zone) ? zone : "UTC";
  }, []);
  // Some engines leave UTC out of the list
  const zoneOptions = useMemo(() => Array.from(new Set(["UTC", ...listTimeZones()])), []);

  const [value, setValue] = useState(() => formatWallClockInput(getWallClock(Date.now(), localZone)));
  const [fromZone, setFromZone] = useState(localZone);
  const [fromDraft, setFromDraft] = useState(localZone);
  const [useLater, setUseLater] = useState(false);
  const [zones, setZones] = useState<string[]>(() => loadSavedTimeZones(storage()));
  const [zoneDraft, setZoneDraft] = useState("");
  const [zoneError, setZoneError] = useState("");

  const clock = parseWallClockInput(value);
  const resolution = clock ? resolveWallClock(clock, fromZone) : null;
  const ms = resolution?.kind === "overlap" && useLater ? resolution.laterMs : resolution?.ms;
  const fromDraftInvalid = fromDraft.trim() !== "" && canonicalTimeZone(fromDraft, zoneOptions) === null;

  const setInput = (next: string) => {
    setValue(next);
    setUseLater(false);
  };

  const setSource = (zone: string) => {
    setFromZone(zone);
    setFromDraft(zone);
    setUseLater(false);
  };

  const changeFromDraft = (typed: string) => {
    setFromDraft(typed);
    const zone = canonicalTimeZone(typed, zoneOptions);
    if (zone) {
      setFromZone(zone);
      setUseLater(false);
    }
  };

  // Keep the same moment and read it on the clock of another zone
  const convertFrom = (zone: string) => {
    if (ms === undefined) return;
    setSource(zone);
    setValue(formatWallClockInput(getWallClock(ms, zone)));
  };

  const updateZones = (next: string[]) => {
    setZones(next);
    saveTimeZones(storage(), next);
  };

  const addZone = () => {
    const typed = zoneDraft.trim();
    if (!typed) return;
    const zone = canonicalTimeZone(typed, zoneOptions);
    if (!zone) {
      setZoneError(`Unknown time zone: ${typed}. Use an IANA name such as Asia/Tokyo.`);
      return;
    }
    if (!zones.includes(zone)) updateZones([...zones, zone]);
    setZoneDraft("");
    setZoneError("");
  };

  const onZoneKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addZone();
    }
  };

  const rows = [
    { zone: "UTC", label: "UTC", saved: false },
    { zone: localZone, label: `Local (${localZone})`, saved: false },
    ...zones.map((zone) => ({ zone, label: zone, saved: true })),
  ].filter((row, index, all) => all.findIndex((other) => other.zone === row.zone) === index);

  let note = "";
  if (resolution?.kind === "gap") {
    note = `This time does not exist in ${fromZone} because clocks move forward. It moved ahead by ${resolution.gapMinutes} minutes.`;
  } else if (resolution?.kind === "overlap") {
    const offset = (at: number) => formatInTimeZone(at, fromZone).offset;
    note = `This time happens twice in ${fromZone} because clocks move back. Showing the ${useLater ? "second" : "first"} one (UTC${offset(useLater ? resolution.laterMs : resolution.ms)}).`;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Time Zone Converter</CardTitle>
          <CardDescription>Enter a date and time and the time zone it is in. See the same moment in other time zones.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="datetime-local"
              step={1}
              aria-label="Date and time"
              value={value}
              onChange={(event) => setInput(event.target.value)}
              className="w-auto font-mono"
            />
            <button
              type="button"
              className="toolbar-text-button"
              onClick={() => setInput(formatWallClockInput(getWallClock(Date.now(), fromZone)))}
            >
              Now
            </button>
            <label className="flex min-w-[16rem] flex-1 items-center gap-2 text-sm">
              From
              <Input
                aria-label="From time zone"
                list="time-zone-converter-options"
                placeholder="A time zone, such as UTC or Asia/Tokyo"
                value={fromDraft}
                onChange={(event) => changeFromDraft(event.target.value)}
                onBlur={() => setFromDraft(fromZone)}
                className="font-mono"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          </div>
          {fromDraftInvalid && (
            <div className="workspace-notice" data-tone="error" role="alert">
              Unknown time zone: {fromDraft.trim()}. The conversion still uses {fromZone}.
            </div>
          )}
          {!clock && (
            <div className="workspace-notice" data-tone="error" role="alert">Enter a date and time.</div>
          )}
          {note && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground" role="status">{note}</p>
              {resolution?.kind === "overlap" && (
                <button type="button" className="toolbar-text-button" onClick={() => setUseLater(!useLater)}>
                  Use the {useLater ? "first" : "second"} time
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Converted times</CardTitle>
          <CardDescription>The same moment in each time zone. The day change is from the date in {fromZone}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ms !== undefined && (
            <dl className="space-y-1.5">
              {rows.map(({ zone, label, saved }) => {
                const { dateTime, offset } = formatInTimeZone(ms, zone);
                const text = `${dateTime} ${offset}`;
                const shift = formatShift(dayShift(ms, fromZone, zone));
                return (
                  <div key={zone} className="flex items-center gap-3 rounded-md bg-muted px-3 py-2">
                    <dt className="w-36 shrink-0 break-all text-xs text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 flex-1 break-words font-mono text-sm">{text}</dd>
                    {shift && <span className="shrink-0 text-xs text-muted-foreground">{shift}</span>}
                    <CopyButton value={text} ariaLabel={`Copy ${label}`} iconOnly />
                    <button
                      type="button"
                      className="toolbar-text-button"
                      aria-label={`Convert from ${zone}`}
                      title="Convert from this zone"
                      disabled={zone === fromZone}
                      onClick={() => convertFrom(zone)}
                    >
                      <ArrowUpToLine size={14} />
                    </button>
                    {saved && (
                      <button
                        type="button"
                        className="toolbar-text-button"
                        aria-label={`Remove ${zone}`}
                        onClick={() => updateZones(zones.filter((item) => item !== zone))}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </dl>
          )}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                aria-label="Add a time zone"
                list="time-zone-converter-options"
                placeholder="Add a time zone, such as Asia/Tokyo"
                value={zoneDraft}
                onChange={(event) => {
                  setZoneDraft(event.target.value);
                  setZoneError("");
                }}
                onKeyDown={onZoneKeyDown}
                className="font-mono"
                spellCheck={false}
                autoComplete="off"
              />
              <button type="button" className="toolbar-text-button" onClick={addZone} disabled={!zoneDraft.trim()}>
                Add
              </button>
            </div>
            {zoneError && <div className="workspace-notice" data-tone="error" role="alert">{zoneError}</div>}
          </div>
          <datalist id="time-zone-converter-options">
            {zoneOptions.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </CardContent>
      </Card>

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
