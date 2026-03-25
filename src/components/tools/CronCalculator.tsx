import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, Info } from "lucide-react";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { describeCronExpression, getNextRunTime } from "@/utils/cron";

interface CronPart {
  type: string;
  options: string[];
}

const cronParts: CronPart[] = [
  {
    type: "minute",
    options: ["*", "*/5", "*/15", "0", "15", "30", "45"],
  },
  {
    type: "hour",
    options: ["*", "*/2", "*/6", "*/12", "0", "6", "12", "18"],
  },
  {
    type: "dayOfMonth",
    options: ["*", "1", "15", "28"],
  },
  {
    type: "month",
    options: ["*", "1", "6", "12"],
  },
  {
    type: "dayOfWeek",
    options: ["*", "1", "1-5", "5", "6"],
  },
];

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What cron format does this tool use?",
    a: "This builder uses the common 5-part cron format: minute, hour, day of month, month, and day of week. It does not include a seconds field in the UI.",
  },
  {
    q: "Why are times shown in my local timezone?",
    a: "Cron schedules are interpreted relative to a timezone, so this tool previews next runs in your current local timezone. If your server runs in a different timezone, the actual schedule can shift.",
  },
  {
    q: "What does `*/5` mean?",
    a: "Step syntax means every N units within that field. For example, `*/5` in the minute field means every 5 minutes.",
  },
  {
    q: "Does this builder support every cron feature?",
    a: "No. This screen focuses on common numeric wildcards, ranges, and step values. Advanced vendor-specific syntax like Quartz-specific fields is outside this builder's scope.",
  },
];

export function CronCalculator() {
  const [parts, setParts] = useState<string[]>(["*", "*", "*", "*", "*"]);
  const [expression, setExpression] = useState("* * * * *");
  const [nextRuns, setNextRuns] = useState<Date[]>([]);
  const [description, setDescription] = useState("Run every minute");
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";

  useEffect(() => {
    const nextExpression = parts.join(" ");
    setExpression(nextExpression);
    setDescription(describeCronExpression(nextExpression) ?? "Unsupported cron expression");
    calculateNextRuns(nextExpression);
  }, [parts]);

  const updatePart = (index: number, value: string) => {
    const newParts = [...parts];
    newParts[index] = value;
    setParts(newParts);
  };

  const calculateNextRuns = (cronExpression: string) => {
    const runs: Date[] = [];
    let cursor = new Date();

    for (let i = 0; i < 5; i++) {
      const nextDate = getNextRunTime(cronExpression, cursor);
      if (!nextDate) {
        break;
      }

      runs.push(nextDate);
      cursor = nextDate;
    }

    setNextRuns(runs);
  };

  const getPartLabel = (type: string) => {
    switch (type) {
      case "minute":
        return "Minute";
      case "hour":
        return "Hour";
      case "dayOfMonth":
        return "Day of Month";
      case "month":
        return "Month";
      case "dayOfWeek":
        return "Day of Week";
    }
  };

  const getPartDescription = (index: number) => {
    switch (index) {
      case 0:
        return "At " + (parts[0] === "*" ? "every minute" : `minute ${parts[0]}`);
      case 1:
        return parts[1] === "*"
          ? "every hour"
          : parts[1].startsWith("*/")
          ? `every ${parts[1].slice(2)} hours`
          : `at hour ${parts[1]}`;
      case 2:
        return parts[2] === "*"
          ? "every day"
          : `on day ${parts[2]}`;
      case 3:
        return parts[3] === "*" ? "every month" : `in month ${parts[3]}`;
      case 4:
        return parts[4] === "*"
          ? "every day of the week"
          : parts[4] === "1-5"
          ? "on weekdays"
          : `on day-of-week ${parts[4]}`;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cron Expression Builder</CardTitle>
          <CardDescription>Build and understand cron expressions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Expression Display */}
          <div className="space-y-2">
            <Label>Expression</Label>
            <div className="p-4 bg-muted rounded-lg">
              <code className="text-lg">{expression}</code>
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          {/* Cron Parts */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cronParts.map((part, index) => (
              <div key={part.type} className="space-y-2 rounded-lg border bg-card p-3">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {getPartLabel(part.type)}
                </Label>
                <Select
                  value={parts[index]}
                  onValueChange={(value) => updatePart(index, value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {part.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-5 text-muted-foreground">
                  {getPartDescription(index)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Next Runs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Next Scheduled Runs
          </CardTitle>
          <CardDescription>Times shown in {timeZone}</CardDescription>
        </CardHeader>
        <CardContent>
          {nextRuns.length > 0 ? (
            <div className="space-y-2">
              {nextRuns.map((date, index) => (
                <div key={date.toISOString()} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <time dateTime={date.toISOString()} className="font-mono text-sm">
                    {date.toLocaleString()}
                  </time>
                  <span className="text-xs text-muted-foreground">Run {index + 1}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No upcoming runs could be calculated for this expression.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4" />
            Cron Format
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Format: <code>minute hour dayOfMonth month dayOfWeek</code></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><code>*</code> - Every value</li>
              <li><code>*/n</code> - Every n units</li>
              <li><code>n</code> - At specific value</li>
              <li><code>a-b</code> - Inclusive range</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
