import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export function DateDifference() {
  const [date1, setDate1] = useState("");
  const [date2, setDate2] = useState("");
  const [time1, setTime1] = useState("00:00");
  const [time2, setTime2] = useState("00:00");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Set default dates
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    setDate2(formatDateForInput(today));
    setDate1(formatDateForInput(yesterday));
  }, []);

  const formatDateForInput = (date: Date) => {
    return date.toISOString().split("T")[0];
  };

  const calculateDifference = () => {
    if (!date1 || !date2) {
      return null;
    }

    const d1 = new Date(`${date1}T${time1}`);
    const d2 = new Date(`${date2}T${time2}`);

    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
      return null;
    }

    const diffMs = Math.abs(d2.getTime() - d1.getTime());
    const isNegative = d2 < d1;

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    return {
      diffMs,
      isNegative,
      breakdown: {
        milliseconds: diffMs,
        seconds,
        minutes,
        hours,
        days,
        weeks,
        months,
        years,
      },
    };
  };

  const difference = calculateDifference();

  const useNow = (position: "first" | "second") => {
    const current = now;
    setDate(formatDateForInput(current));
    setTime(current.toTimeString().slice(0, 5));
  };

  const setDate = (date: string) => {
    if (date1 > date2) {
      setDate1(date);
    } else {
      setDate2(date);
    }
  };

  const setTime = (time: string) => {
    setTime1(time);
    setTime2(time);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Date Difference Calculator</CardTitle>
          <CardDescription>Calculate the difference between two dates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* First Date */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>First Date</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => useNow("first")}
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Now
                </Button>
              </div>
              <input
                type="date"
                value={date1}
                onChange={(e) => setDate1(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background"
              />
              <input
                type="time"
                value={time1}
                onChange={(e) => setTime1(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background"
              />
            </div>

            {/* Arrow */}
            <div className="hidden md:flex items-center justify-center">
              <ArrowRight className="h-6 w-6 text-muted-foreground" />
            </div>

            {/* Second Date */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Second Date</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => useNow("second")}
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Now
                </Button>
              </div>
              <input
                type="date"
                value={date2}
                onChange={(e) => setDate2(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background"
              />
              <input
                type="time"
                value={time2}
                onChange={(e) => setTime2(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {difference && (
        <Card>
          <CardHeader>
            <CardTitle>Difference</CardTitle>
            <CardDescription>
              {difference.isNegative ? "Second date is earlier" : "Second date is later"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{difference.breakdown.years}</div>
                <div className="text-sm text-muted-foreground">Years</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{difference.breakdown.months}</div>
                <div className="text-sm text-muted-foreground">Months</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{difference.breakdown.weeks}</div>
                <div className="text-sm text-muted-foreground">Weeks</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{difference.breakdown.days}</div>
                <div className="text-sm text-muted-foreground">Days</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{difference.breakdown.hours}</div>
                <div className="text-sm text-muted-foreground">Hours</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{difference.breakdown.minutes}</div>
                <div className="text-sm text-muted-foreground">Minutes</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{difference.breakdown.seconds}</div>
                <div className="text-sm text-muted-foreground">Seconds</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{difference.breakdown.milliseconds.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Milliseconds</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
