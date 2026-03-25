import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface Preset {
  name: string;
  pattern: string;
  description: string;
}

const presets: Preset[] = [
  { name: "Email", pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", description: "Validate email addresses" },
  { name: "URL", pattern: "^https?:\\/\\/[\\w\\-]+(\\.[\\w\\-]+)+[/#?]?.*$", description: "Match HTTP/HTTPS URLs" },
  { name: "IPv4", pattern: "^((25[0-5]|(2[0-4]|1\\d|[1-9]|)\\d)\\.?\\b){4}$", description: "Validate IPv4 addresses" },
  { name: "Hex Color", pattern: "^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$", description: "Match hex color codes" },
  { name: "Date (YYYY-MM-DD)", pattern: "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$", description: "Validate ISO date format" },
  { name: "Username", pattern: "^[a-zA-Z0-9_]{3,16}$", description: "3-16 chars, alphanumeric + underscore" },
  { name: "Password (Strong)", pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$", description: "At least 8 chars with uppercase, lowercase, number, and special char" },
  { name: "Credit Card", pattern: "^\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}$", description: "Match common credit card formats" },
  { name: "Phone (US)", pattern: "^\\+1\\s?\\(\\d{3}\\)\\s?\\d{3}[- ]?\\d{4}$", description: "US phone number format" },
  { name: "Time (24h)", pattern: "^([01]?\\d|2[0-3]):[0-5]\\d$", description: "24-hour time format (HH:MM)" },
];

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What do the g, i, and m flags mean?",
    a: "This tester uses JavaScript regular expression flags. g finds all matches, i ignores letter case, and m lets ^ and $ match the start and end of each line instead of only the whole string.",
  },
  {
    q: "Why do I only get one match sometimes?",
    a: "If the global g flag is off, the tool stops after the first match and shows only that result. Turn on g when you want every match in the input.",
  },
  {
    q: "Are the preset patterns guaranteed validators?",
    a: "No. The presets are practical starting points for common formats, but many real-world inputs have edge cases. Treat them as helpers you can adjust for your own rules.",
  },
  {
    q: "Does this tool run my regex locally?",
    a: "Yes. The pattern is evaluated locally in your browser with JavaScript's RegExp engine. It tests pattern matching only and does not execute arbitrary code.",
  },
];

export function RegexGenerator() {
  const [pattern, setPattern] = useState("");
  const [testString, setTestString] = useState("");
  const [matches, setMatches] = useState<RegExpMatchArray[]>([]);
  const [flags, setFlags] = useState("g");
  const [copied, setCopied] = useState(false);

  const testRegex = () => {
    if (!pattern) {
      toast.error("Please enter a regex pattern");
      return;
    }

    try {
      const regex = new RegExp(pattern, flags);
      const found: RegExpMatchArray[] = [];
      let match;

      if (flags.includes("g")) {
        while ((match = regex.exec(testString)) !== null) {
          found.push(match);
        }
      } else {
        match = regex.exec(testString);
        if (match) found.push(match);
      }

      setMatches(found);
      toast.success(`Found ${found.length} match${found.length !== 1 ? "es" : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid regex pattern");
      setMatches([]);
    }
  };

  const applyPreset = (preset: Preset) => {
    setPattern(preset.pattern);
    setMatches([]);
    toast.success(`Applied ${preset.name} pattern`);
  };

  const copyPattern = () => {
    navigator.clipboard.writeText(`/${pattern}/${flags}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Pattern copied!");
  };

  const toggleFlag = (flag: string) => {
    if (flags.includes(flag)) {
      setFlags(flags.replace(flag, ""));
    } else {
      setFlags(flags + flag);
    }
    setMatches([]);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Regex Tester</CardTitle>
          <CardDescription>Test and validate regular expressions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Pattern</Label>
            <div className="flex gap-2">
              <span className="text-muted-foreground self-center">/</span>
              <Input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="Enter regex pattern"
                className="font-mono flex-1"
              />
              <span className="text-muted-foreground self-center">/</span>
              <Input
                value={flags}
                onChange={(e) => setFlags(e.target.value)}
                placeholder="flags"
                className="font-mono w-20 text-center"
              />
              <Button onClick={copyPattern} variant="outline" size="icon">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Badge
              variant={flags.includes("g") ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleFlag("g")}
            >
              g (global)
            </Badge>
            <Badge
              variant={flags.includes("i") ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleFlag("i")}
            >
              i (ignore case)
            </Badge>
            <Badge
              variant={flags.includes("m") ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleFlag("m")}
            >
              m (multiline)
            </Badge>
          </div>

          <div className="space-y-2">
            <Label>Test String</Label>
            <Textarea
              value={testString}
              onChange={(e) => setTestString(e.target.value)}
              placeholder="Enter text to test against the pattern"
              className="min-h-[120px] font-mono"
            />
          </div>

          <Button onClick={testRegex} className="w-full">
            Test Pattern
          </Button>
        </CardContent>
      </Card>

      {matches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Matches ({matches.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {matches.map((match, index) => (
                <div key={index} className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">Match {index + 1}</div>
                  <code className="text-green-400">{match[0]}</code>
                  {match.index !== undefined && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Position: {match.index}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Common Patterns</CardTitle>
          <CardDescription>Click to use a preset pattern</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.name}
                variant="outline"
                onClick={() => applyPreset(preset)}
                className="justify-start"
              >
                <span className="font-medium">{preset.name}</span>
                <span className="text-xs text-muted-foreground ml-auto truncate max-w-[150px]">
                  {preset.description}
                </span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regex Flags</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="font-medium">g</dt>
              <dd className="text-muted-foreground">Global - find all matches</dd>
            </div>
            <div>
              <dt className="font-medium">i</dt>
              <dd className="text-muted-foreground">Ignore case</dd>
            </div>
            <div>
              <dt className="font-medium">m</dt>
              <dd className="text-muted-foreground">Multiline mode</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
