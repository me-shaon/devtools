import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  formatInTimeZone,
  formatIsoWithOffset,
  formatRelativeTime,
  getCalendarInfo,
  getLocalTimeZone,
  isValidTimeZone,
  listTimeZones,
  loadSavedTimeZones,
  parseTimeInput,
  saveTimeZones,
  type TimeParseResult,
} from "@/utils/timestamp";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What can I type in the input?",
    a: "Type a Unix timestamp, a date string, or now. Leave the input empty to see the current time. Results update as you type.",
  },
  {
    q: "How does the tool pick seconds or milliseconds?",
    a: "It counts the digits. Up to 11 digits are seconds, 12 to 14 are milliseconds, 15 to 17 are microseconds, and more are nanoseconds. Add a suffix such as 86400000 ms to set the unit yourself.",
  },
  {
    q: "How do I add or subtract time?",
    a: "Add offsets after the value, such as now - 1d, now + 3600, or 1705320000 + 1h30m. A number without a unit is seconds. The units are ms, s, m, h, d, and w.",
  },
  {
    q: "Why are months and years not offset units?",
    a: "Months and years have no fixed length. Use days or weeks to get an exact result.",
  },
  {
    q: "Which time zone does a date string use?",
    a: "A date with Z, UTC, GMT, or an offset such as +02:00 uses that zone. A date-only ISO string such as 2024-01-15 is UTC midnight. Any other date is your local time.",
  },
  {
    q: "Where do the extra time zones come from?",
    a: "They come from the time zone data built into the app. The tool makes no network calls. It saves your list on this device.",
  },
];

/** Plain-language note about how the input was read. */
function describeSource(result: Extract<TimeParseResult, { ok: true }>, localZone: string): string {
  const base = (() => {
    switch (result.source) {
      case "now":
        return "Showing the current time.";
      case "date":
        if (result.zone === "utc") return "Read as a date in UTC.";
        if (result.zone === "local") return `Read as a date in local time (${localZone}).`;
        return "Read as a date with its own time zone.";
      default:
        return `Read as Unix ${result.source}.`;
    }
  })();
  if (!result.offsetMs) return base;
  const seconds = result.offsetMs / 1000;
  return `${base} Offset: ${seconds > 0 ? "+" : ""}${seconds.toLocaleString("en-US")} seconds.`;
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-muted px-3 py-2">
      <dt className="w-36 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-all font-mono text-sm">{value}</dd>
      <CopyButton value={value} ariaLabel={`Copy ${label}`} iconOnly />
    </div>
  );
}

export function TimestampConverter() {
  const [input, setInput] = useState("");
  const debouncedInput = useDebouncedValue(input);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [zones, setZones] = useState<string[]>(() =>
    loadSavedTimeZones(typeof window !== "undefined" ? window.localStorage : undefined),
  );
  const [zoneDraft, setZoneDraft] = useState("");
  const [zoneError, setZoneError] = useState("");
  const localZone = useMemo(getLocalTimeZone, []);
  const zoneOptions = useMemo(listTimeZones, []);

  // Tick every second so "now" and the relative time stay current.
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const result = parseTimeInput(debouncedInput, nowMs);

  const updateZones = (next: string[]) => {
    setZones(next);
    saveTimeZones(typeof window !== "undefined" ? window.localStorage : undefined, next);
  };

  const addZone = () => {
    const typed = zoneDraft.trim();
    if (!typed) return;
    if (!isValidTimeZone(typed)) {
      setZoneError(`Unknown time zone: ${typed}. Use an IANA name such as Asia/Tokyo.`);
      return;
    }
    // Use the listed spelling so "asia/tokyo" and "Asia/Tokyo" are the same entry.
    // resolvedOptions() is no help here: it can return old names such as Asia/Calcutta.
    const zone = zoneOptions.find((option) => option.toLowerCase() === typed.toLowerCase()) ?? typed;
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

  const zoneRow = (zone: string | undefined) => {
    const { dateTime, offset } = formatInTimeZone(result.ok ? result.ms : nowMs, zone);
    return `${dateTime} ${offset}`;
  };

  let rows: { label: string; value: string }[] = [];
  if (result.ok) {
    const { ms } = result;
    const calendar = getCalendarInfo(ms);
    rows = [
      { label: "Unix seconds", value: String(Math.floor(ms / 1000)) },
      { label: "Unix milliseconds", value: String(ms) },
      { label: "ISO 8601 (UTC)", value: new Date(ms).toISOString() },
      { label: "ISO 8601 (local)", value: formatIsoWithOffset(ms) },
      { label: "RFC 2822", value: new Date(ms).toUTCString() },
      { label: "Relative", value: formatRelativeTime(ms, nowMs) },
      {
        label: "Calendar (local)",
        value: `${calendar.weekday}, day ${calendar.dayOfYear} of ${calendar.daysInYear}, ISO week ${calendar.isoWeekYear}-W${String(calendar.isoWeek).padStart(2, "0")}`,
      },
    ];
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Timestamp</CardTitle>
          <CardDescription>Paste a Unix timestamp or a date. Leave the input empty to see the current time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              id="timestamp-input"
              type="text"
              aria-label="Timestamp or date"
              placeholder="1705320000, 2024-01-15T12:00:00Z, or now - 1d"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="font-mono"
              spellCheck={false}
              autoComplete="off"
            />
            {result.ok ? (
              <p className="text-xs text-muted-foreground" role="status">{describeSource(result, localZone)}</p>
            ) : (
              <div className="workspace-notice" data-tone="error" role="alert">{"error" in result && result.error}</div>
            )}
          </div>

          {result.ok && (
            <dl className="space-y-1.5">
              {rows.map((row) => (
                <ResultRow key={row.label} label={row.label} value={row.value} />
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time zones</CardTitle>
          <CardDescription>The same moment in other time zones.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-1.5">
            <ResultRow label={`Local (${localZone})`} value={zoneRow(undefined)} />
            {zones.map((zone) => (
              <div key={zone} className="flex items-center gap-3 rounded-md bg-muted px-3 py-2">
                <dt className="w-36 shrink-0 break-all text-xs text-muted-foreground">{zone}</dt>
                <dd className="min-w-0 flex-1 break-all font-mono text-sm">{zoneRow(zone)}</dd>
                <CopyButton value={zoneRow(zone)} ariaLabel={`Copy ${zone}`} iconOnly />
                <button
                  type="button"
                  className="toolbar-text-button"
                  aria-label={`Remove ${zone}`}
                  onClick={() => updateZones(zones.filter((item) => item !== zone))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </dl>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                aria-label="Add a time zone"
                list="timestamp-zone-options"
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
            <datalist id="timestamp-zone-options">
              {zoneOptions.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            {zoneError && <div className="workspace-notice" data-tone="error" role="alert">{zoneError}</div>}
          </div>
        </CardContent>
      </Card>

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
