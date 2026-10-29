import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  parseCron,
  readCronInput,
  replaceCronField,
  type CronField,
} from "@/utils/cron";
import { cronFieldValue, type BuilderMode } from "@/utils/cron-builder";
function Field({
  field,
  index,
  input,
  onChange,
}: {
  field: CronField;
  index: number;
  input: string;
  onChange: (text: string) => void;
}) {
  const [mode, setMode] = useState<BuilderMode>("custom");
  const [first, setFirst] = useState(field.text);
  const [second, setSecond] = useState("1");
  const [error, setError] = useState("");
  const apply = () => {
    try {
      const value = cronFieldValue(mode, first, second);
      const next = replaceCronField(input, index, value);
      const read = readCronInput(next);
      const parsed = parseCron(read.expression, { aws: read.aws });
      if (!parsed.ok)
        throw new Error("error" in parsed ? parsed.error : "Invalid schedule");
      setError("");
      onChange(next);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <fieldset className="border-t py-3 space-y-2">
      <legend className="text-sm font-medium">
        {field.label}{" "}
        <code className="text-muted-foreground">{field.text}</code>
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-md border bg-background px-2 pr-7 py-1 text-sm"
          aria-label={`${field.label} builder mode`}
          value={mode}
          onChange={(e) => {
            const m = e.target.value as BuilderMode;
            setMode(m);
            setFirst(m === "custom" ? field.text : "1");
            setError("");
          }}
        >
          <option value="custom">Custom (preserve expression)</option>
          <option value="every">Every value</option>
          <option value="specific">Specific values</option>
          <option value="range">Range</option>
          <option value="interval">Interval from start</option>
        </select>
        {mode !== "every" && (
          <Input
            className="w-36 font-mono"
            aria-label={`${field.label} ${mode === "range" || mode === "interval" ? "start" : "values"}`}
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
        )}
        {(mode === "range" || mode === "interval") && (
          <Input
            className="w-28 font-mono"
            aria-label={`${field.label} ${mode === "range" ? "end" : "interval"}`}
            value={second}
            onChange={(e) => setSecond(e.target.value)}
          />
        )}
        <Button variant="outline" onClick={apply}>
          Apply {field.label.toLowerCase()}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
export function CronBuilder({
  input,
  onChange,
}: {
  input: string;
  onChange: (text: string) => void;
}) {
  const read = readCronInput(input);
  const parsed = parseCron(read.expression, { aws: read.aws });
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Visual builder
      </summary>
      <div className="pt-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Choose a field pattern and apply it. Other fields, time-zone prefixes,
          and commands stay unchanged. Custom preserves advanced syntax such as
          L, W and #.
        </p>
        {parsed.ok ? (
          parsed.schedule.fields.map((field, index) => (
            <Field
              key={`${index}:${field.text}`}
              field={field}
              index={index}
              input={input}
              onChange={onChange}
            />
          ))
        ) : (
          <p className="text-sm">
            Enter a valid expression above to use the builder.
          </p>
        )}
      </div>
    </details>
  );
}
