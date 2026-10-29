import { CronBuilder } from "./CronBuilder";
import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, Info } from "lucide-react";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  CRON_DIALECT_LABELS,
  CRON_EXAMPLES,
  CRON_FIELD_LABELS,
  cronLayout,
  describeCron,
  describeCronField,
  formatCronValues,
  formatTimeUntil,
  isValidTimeZone,
  nextCronRuns,
  parseCron,
  readCronInput,
  replaceCronField,
  type CronFieldName,
} from "@/utils/cron";

const RUN_COUNT = 5;
const LOCAL_ZONE = "local";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What cron format does this tool use?",
    a: "It reads 5 fields as standard cron: minute, hour, day of month, month, and day of week. It reads 6 fields as seconds first, as in Spring and node-cron. An expression with `?` or 7 fields is read as Quartz. The line under the description shows which format the tool used.",
  },
  {
    q: "Can I paste a whole crontab line or a YAML line?",
    a: "Yes. The tool shows a command after the schedule but does not use it. It also removes `- cron:` and `schedule:` keys and quotes from GitHub Actions and Kubernetes files. A `CRON_TZ=` prefix sets the time zone, and `cron(...)` is read as AWS EventBridge.",
  },
  {
    q: "Why does `0 0 13 * 5` run on more days than I expect?",
    a: "In standard cron, a day runs when it matches the day of month or the day of week, if both fields are set. So this runs on every 13th and on every Friday. Seconds-first and Quartz formats need both fields to match.",
  },
  {
    q: "Which time zone does cron use?",
    a: "Cron uses the time zone of the machine or service that runs it. GitHub Actions always uses UTC. A Kubernetes CronJob uses the controller's zone unless you set `timeZone`. Pick that zone to see the correct next runs.",
  },
  {
    q: "What happens on daylight saving time changes?",
    a: "This preview skips a wall time that does not exist, such as 02:30 on the day clocks go forward. Cron daemons differ here. Some run the skipped job right after the change.",
  },
  {
    q: "What do `L`, `W`, and `#` mean?",
    a: "`L` in day of month is the last day. `15W` is the weekday nearest the 15th. `5L` in day of week is the last Friday, and `MON#2` is the second Monday. Standard cron daemons such as Vixie cron do not support these.",
  },
];

/** A field editor that keeps a local draft, so a cleared field does not change the expression. */
function FieldInput({ name, value, invalid, onCommit }: { name: CronFieldName; value: string; invalid: boolean; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Input
      type="text"
      aria-label={`${CRON_FIELD_LABELS[name]} field`}
      aria-invalid={invalid}
      spellCheck={false}
      autoComplete="off"
      className={`h-7 w-28 font-mono ${invalid ? "border-destructive" : ""}`}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = event.target.value.replace(/\s+/g, "");
        if (next) onCommit(next);
      }}
    />
  );
}

export function CronCalculator() {
  const [input, setInput] = useState("0 9 * * MON-FRI");
  const [zoneChoice, setZoneChoice] = useState(LOCAL_ZONE);
  const text = useDebouncedValue(input);
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  const zones = useMemo(() => {
    const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    return supported.filter((zone) => zone !== "UTC");
  }, []);

  const view = useMemo(() => {
    const read = readCronInput(text);
    const result = parseCron(read.expression, { aws: read.aws });
    const macroExpansion = result.ok ? result.schedule.expanded : undefined;
    const tokens = (macroExpansion ?? read.expression).trim().split(/\s+/).filter(Boolean);
    const layout = "schedule" in result ? result.schedule.fields.map((field) => field.name) : (result.layout ?? cronLayout(read.expression, read.aws));
    return { read, result, tokens, layout };
  }, [text]);

  const { read, result, tokens, layout } = view;
  const zoneError = read.timeZone && !isValidTimeZone(read.timeZone) ? `Unknown time zone "${read.timeZone}" in the prefix. Use an IANA name such as Europe/Berlin.` : "";
  const timeZone = read.timeZone && !zoneError ? read.timeZone : zoneChoice === LOCAL_ZONE ? undefined : zoneChoice;
  const zoneLabel = timeZone ?? localZone;

  const runs = useMemo(() => {
    if (!result.ok || zoneError) return [];
    return nextCronRuns(result.schedule, new Date(), RUN_COUNT, timeZone);
  }, [result, timeZone, zoneError]);

  const hasSeconds = result.ok && result.schedule.fields[0].name === "second";
  const runFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        timeZone,
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: hasSeconds ? "2-digit" : undefined,
        hourCycle: "h23",
        timeZoneName: "short",
      }),
    [timeZone, hasSeconds],
  );

  const errorIndex = "error" in result ? result.fieldIndex : undefined;
  const fieldRows = layout && tokens.length === layout.length ? layout : null;
  const now = Date.now();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cron Expression</CardTitle>
          <CardDescription>Type or paste a schedule from a crontab, GitHub Actions, or Kubernetes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cron-expression">Expression</Label>
            <div className="flex gap-2">
              <Input
                id="cron-expression"
                type="text"
                aria-label="Cron expression"
                aria-invalid={!result.ok}
                aria-describedby="cron-description"
                spellCheck={false}
                autoComplete="off"
                placeholder="e.g., 0 */6 * * 1-5 or @daily"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="font-mono"
              />
              <CopyButton value={read.expression} label="Copy expression" iconOnly />
              <Select value="" onValueChange={(value) => setInput(value)}>
                <SelectTrigger className="h-8 w-40 shrink-0" aria-label="Examples">
                  <SelectValue placeholder="Examples" />
                </SelectTrigger>
                <SelectContent>
                  {CRON_EXAMPLES.map((example) => (
                    <SelectItem key={example.expression} value={example.expression}>
                      {example.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div id="cron-description" className="space-y-1">
            {result.ok ? (
              <>
                <p className="text-base font-medium">{describeCron(result.schedule)}</p>
                <p className="text-xs text-muted-foreground">
                  Read as {CRON_DIALECT_LABELS[result.schedule.dialect]}
                  {result.schedule.expanded && (
                    <>
                      . Same as <code>{result.schedule.expanded}</code>
                    </>
                  )}
                  {result.schedule.dayOr && ". A day runs when it matches either day field"}.
                </p>
              </>
            ) : (
              <div className="workspace-notice rounded-md" data-tone="error" role="alert">
                {"error" in result && result.error}
              </div>
            )}
            {read.command && (
              <p className="text-xs text-muted-foreground">
                Command (not used): <code>{read.command}</code>
              </p>
            )}
          </div>

          {fieldRows && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" aria-label="Field breakdown">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <th scope="col" className="py-1.5 pr-2 font-medium">Field</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">Value</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldRows.map((name, index) => {
                    const field = result.ok ? result.schedule.fields[index] : undefined;
                    const invalid = errorIndex === index;
                    return (
                      <tr key={name} className="border-b border-border/50">
                        <th scope="row" className="py-1.5 pr-2 text-left font-normal">{CRON_FIELD_LABELS[name]}</th>
                        <td className="px-2 py-1.5">
                          <FieldInput
                            name={name}
                            value={tokens[index]}
                            invalid={invalid}
                            onCommit={(value) => setInput((current) => replaceCronField(current, index, value))}
                          />
                        </td>
                        <td className={`px-2 py-1.5 ${invalid ? "text-destructive" : ""}`}>
                          {field ? (
                            <>
                              <span className="block">{describeCronField(field)}</span>
                              {!field.wildcard && field.values.length > 0 && (
                                <span className="block font-mono text-muted-foreground">{formatCronValues(field)}</span>
                              )}
                            </>
                          ) : invalid ? (
                            "See the error above."
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CronBuilder input={input} onChange={setInput} />
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Next Runs
            </CardTitle>
            <CardDescription>
              {read.timeZone && !zoneError ? `Times in ${zoneLabel}, from the CRON_TZ prefix` : `Times in ${zoneLabel}`}
            </CardDescription>
          </div>
          <Select value={zoneChoice} onValueChange={setZoneChoice} disabled={Boolean(read.timeZone && !zoneError)}>
            <SelectTrigger className="h-8 w-48" aria-label="Time zone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LOCAL_ZONE}>Local ({localZone})</SelectItem>
              <SelectItem value="UTC">UTC</SelectItem>
              {zones.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {zoneError ? (
            <div className="workspace-notice rounded-md" data-tone="error" role="alert">{zoneError}</div>
          ) : runs.length > 0 ? (
            <div className="space-y-2">
              {runs.map((date) => (
                <div key={date.toISOString()} className="flex items-center gap-3 rounded-lg bg-muted p-3">
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <time dateTime={date.toISOString()} className="font-mono text-sm">
                    {runFormatter.format(date)}
                  </time>
                  <span className="text-xs text-muted-foreground">{formatTimeUntil(date.getTime() - now)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {result.ok
                ? "This schedule never runs in the next 30 years. Check that the day and month can happen together. For example, February has no day 30."
                : "Fix the expression to see the next runs."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4" />
            Cron Syntax
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Format: <code>minute hour day-of-month month day-of-week</code>. Add a seconds field at the start for Spring or Quartz.
            </p>
            <ul className="ml-2 list-inside list-disc space-y-1">
              <li><code>*</code> matches every value. <code>?</code> means any day (Quartz).</li>
              <li><code>1,15</code> is a list. <code>1-5</code> is an inclusive range.</li>
              <li><code>*/15</code> is every 15 units. <code>5/15</code> starts at 5.</li>
              <li><code>JAN</code> to <code>DEC</code> and <code>SUN</code> to <code>SAT</code> work as names.</li>
              <li><code>L</code>, <code>15W</code>, <code>5L</code>, and <code>MON#2</code> set special days.</li>
              <li><code>@yearly</code>, <code>@monthly</code>, <code>@weekly</code>, <code>@daily</code>, and <code>@hourly</code> are macros.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
