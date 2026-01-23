import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, Clock } from "lucide-react";
import { toast } from "sonner";

export function TimestampConverter() {
  const [timestamp, setTimestamp] = useState("");
  const [dateString, setDateString] = useState("");
  const [currentTimestamp, setCurrentTimestamp] = useState(Math.floor(Date.now() / 1000));
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimestamp(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const timestampToDate = () => {
    if (!timestamp.trim()) {
      toast.error("Please enter a timestamp");
      return;
    }

    const ts = parseInt(timestamp);
    if (isNaN(ts)) {
      toast.error("Invalid timestamp");
      return;
    }

    const date = new Date(ts * 1000);
    setDateString(formatDate(date));
    toast.success("Converted to date!");
  };

  const dateToTimestamp = () => {
    if (!dateString.trim()) {
      toast.error("Please enter a date string");
      return;
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      toast.error("Invalid date format");
      return;
    }

    const ts = Math.floor(date.getTime() / 1000);
    setTimestamp(ts.toString());
    toast.success("Converted to timestamp!");
  };

  const formatDate = (date: Date) => {
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const useCurrentTime = () => {
    const now = Math.floor(Date.now() / 1000);
    setTimestamp(now.toString());
    const date = new Date();
    setDateString(formatDate(date));
  };

  const copyToClipboard = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
    toast.success(`${label} copied!`);
  };

  return (
    <div className="space-y-6">
      {/* Current Time Display */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Current Unix Timestamp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center space-y-2">
            <div className="text-4xl font-bold font-mono">{currentTimestamp}</div>
            <div className="text-sm text-muted-foreground">{formatDate(new Date())}</div>
            <Button onClick={useCurrentTime} variant="outline" size="sm">
              Use Current Time
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="to-date" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="to-date">Timestamp to Date</TabsTrigger>
          <TabsTrigger value="to-timestamp">Date to Timestamp</TabsTrigger>
        </TabsList>

        <TabsContent value="to-date" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Timestamp to Date</CardTitle>
              <CardDescription>Convert Unix timestamp to human-readable date</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="timestamp-input">Unix Timestamp</Label>
                <div className="flex gap-2">
                  <Input
                    id="timestamp-input"
                    type="number"
                    placeholder="e.g., 1609459200"
                    value={timestamp}
                    onChange={(e) => setTimestamp(e.target.value)}
                    className="font-mono"
                  />
                  <Button onClick={timestampToDate} size="icon" variant="outline">
                    <Clock className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {dateString && (
                <div className="space-y-2">
                  <Label htmlFor="date-output">Date Output</Label>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-lg">{dateString}</span>
                      <Button
                        onClick={() => copyToClipboard(dateString, "Date")}
                        variant="ghost"
                        size="sm"
                      >
                        {copied === "Date" ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="to-timestamp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Date to Timestamp</CardTitle>
              <CardDescription>Convert human-readable date to Unix timestamp</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="date-input">Date String</Label>
                <div className="flex gap-2">
                  <Input
                    id="date-input"
                    type="datetime-local"
                    value={dateString}
                    onChange={(e) => setDateString(e.target.value)}
                    step="1"
                  />
                  <Button onClick={dateToTimestamp} size="icon" variant="outline">
                    <Clock className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Format: YYYY-MM-DD HH:MM:SS
                </p>
              </div>

              {timestamp && (
                <div className="space-y-2">
                  <Label htmlFor="timestamp-output">Timestamp Output</Label>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-lg">{timestamp}</span>
                      <Button
                        onClick={() => copyToClipboard(timestamp, "Timestamp")}
                        variant="ghost"
                        size="sm"
                      >
                        {copied === "Timestamp" ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
