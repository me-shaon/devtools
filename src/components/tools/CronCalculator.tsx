import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, Info } from "lucide-react";
import { toast } from "sonner";

interface CronPart {
  type: string;
  value: string;
  options: string[];
}

const cronParts: CronPart[] = [
  {
    type: "minute",
    value: "*",
    options: ["*", "*/5", "*/15", "0", "15", "30", "45"],
  },
  {
    type: "hour",
    value: "*",
    options: ["*", "*/2", "*/6", "*/12", "0", "6", "12", "18"],
  },
  {
    type: "dayOfMonth",
    value: "*",
    options: ["*", "1", "15", "L"],
  },
  {
    type: "month",
    value: "*",
    options: ["*", "1", "6", "12"],
  },
  {
    type: "dayOfWeek",
    value: "*",
    options: ["*", "MON", "MON-FRI", "1", "5", "L"],
  },
];

export function CronCalculator() {
  const [parts, setParts] = useState<string[]>(["*", "*", "*", "*", "*"]);
  const [expression, setExpression] = useState("* * * * *");
  const [nextRuns, setNextRuns] = useState<Date[]>([]);

  useEffect(() => {
    setExpression(parts.join(" "));
    calculateNextRuns();
  }, [parts]);

  const updatePart = (index: number, value: string) => {
    const newParts = [...parts];
    newParts[index] = value;
    setParts(newParts);
  };

  const calculateNextRuns = () => {
    try {
      const runs: Date[] = [];
      const now = new Date();

      // Simple implementation - calculate next 5 runs
      // In production, you'd use a proper cron library like cron-parser
      for (let i = 0; i < 5; i++) {
        const nextDate = new Date(now.getTime() + i * 60000 * 60); // Placeholder
        runs.push(nextDate);
      }

      setNextRuns(runs);
    } catch (error) {
      setNextRuns([]);
    }
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
          : parts[2] === "L"
          ? "on the last day of the month"
          : `on day ${parts[2]}`;
      case 3:
        return parts[3] === "*" ? "every month" : `in month ${parts[3]}`;
      case 4:
        return parts[4] === "*"
          ? "every day of the week"
          : `on ${parts[4]}`;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cron Expression Builder</CardTitle>
          <CardDescription>Build and understand cron expressions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Expression Display */}
          <div className="space-y-2">
            <Label>Expression</Label>
            <div className="p-4 bg-muted rounded-lg">
              <code className="text-lg">{expression}</code>
            </div>
          </div>

          {/* Cron Parts */}
          <div className="space-y-4">
            {cronParts.map((part, index) => (
              <div key={part.type} className="space-y-2">
                <Label>{getPartLabel(part.type)}</Label>
                <Select
                  value={parts[index]}
                  onValueChange={(value) => updatePart(index, value)}
                >
                  <SelectTrigger>
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
                <p className="text-xs text-muted-foreground">
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
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {nextRuns.map((date, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-mono text-sm">
                  {date.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
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
              <li><code>L</code> - Last (for day of month/week)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
