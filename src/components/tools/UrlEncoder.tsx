import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowRight, Copy, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import {
  buildUrlFromDetails,
  parseUrlDetails,
  type ParsedUrlDetails,
} from "@/utils/url";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What does URL encoding do?",
    a: "URL encoding replaces reserved or unsafe characters with percent-encoded bytes such as `%20`. That makes text safe to place in query strings, form values, and path segments.",
  },
  {
    q: "Is URL encoding the same as Base64?",
    a: "No. URL encoding preserves text meaning while escaping special characters for URLs, whereas Base64 rewrites data into a different text alphabet for transport.",
  },
  {
    q: "Why do spaces become `%20`?",
    a: "A space is not safe to include literally in many URL contexts, so it is percent-encoded as `%20`. Some form encoders use `+` instead, but this tool follows `encodeURIComponent` behavior.",
  },
  {
    q: "What does the Parse URL tab do?",
    a: "It splits a full URL into protocol, credentials, host, port, path, hash, and query parameters. You can edit the parameters and copy the rebuilt URL. Parameter names and values are shown decoded and are encoded again when the URL is rebuilt.",
  },
  {
    q: "When would I use `encodeURI` instead?",
    a: "Use `encodeURI` when you already have a full URL and want to keep structural characters like `:`, `/`, `?`, and `#` intact. This tool behaves like `encodeURIComponent`, which is safer for individual pieces of a URL.",
  },
];

export function UrlEncoder() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);

  const encode = () => {
    if (!input.trim()) {
      toast.error("Please enter text to encode");
      return;
    }
    try {
      const encoded = encodeURIComponent(input);
      setOutput(encoded);
      toast.success("Encoded successfully!");
    } catch (error) {
      toast.error("Failed to encode URL");
    }
  };

  const decode = () => {
    if (!input.trim()) {
      toast.error("Please enter text to decode");
      return;
    }
    try {
      const decoded = decodeURIComponent(input);
      setOutput(decoded);
      toast.success("Decoded successfully!");
    } catch (error) {
      toast.error("Invalid URL encoding");
    }
  };

  const copyOutput = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard!");
  };

  const [parseInput, setParseInput] = useState("");
  const [parsed, setParsed] = useState<ParsedUrlDetails | null>(null);
  const [parseError, setParseError] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);

  const runParse = (value: string) => {
    setParseInput(value);
    if (!value.trim()) {
      setParsed(null);
      setParseError("");
      return;
    }
    const result = parseUrlDetails(value);
    if ("error" in result) {
      setParsed(null);
      setParseError(result.error);
    } else {
      setParsed(result.value);
      setParseError("");
    }
  };

  const updateParam = (index: number, field: "key" | "value", value: string) => {
    setParsed((prev) =>
      prev
        ? { ...prev, params: prev.params.map((p, i) => (i === index ? { ...p, [field]: value } : p)) }
        : prev
    );
  };

  const removeParam = (index: number) => {
    setParsed((prev) => (prev ? { ...prev, params: prev.params.filter((_, i) => i !== index) } : prev));
  };

  const addParam = () => {
    setParsed((prev) => (prev ? { ...prev, params: [...prev.params, { key: "", value: "" }] } : prev));
  };

  const rebuiltUrl = parsed ? buildUrlFromDetails(parsed) : "";

  const copyRebuilt = () => {
    navigator.clipboard.writeText(rebuiltUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
    toast.success("Copied to clipboard!");
  };

  const clearAll = () => {
    setInput("");
    setOutput("");
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="encode" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="encode">Encode</TabsTrigger>
          <TabsTrigger value="decode">Decode</TabsTrigger>
          <TabsTrigger value="parse">Parse URL</TabsTrigger>
        </TabsList>

        <TabsContent value="encode" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>URL Encode</CardTitle>
              <CardDescription>Convert text to URL-safe encoded format</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="encode-input">Input Text</Label>
                <Textarea
                  id="encode-input"
                  placeholder="Enter text to encode (e.g., Hello World! @#$)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="min-h-[120px] font-mono"
                />
              </div>

              <Button onClick={encode} className="w-full" size="lg">
                <ArrowRight className="h-4 w-4 mr-2" />
                Encode
              </Button>

              {output && (
                <div className="space-y-2">
                  <Label htmlFor="encode-output">Encoded Output</Label>
                  <Textarea
                    id="encode-output"
                    value={output}
                    readOnly
                    className="min-h-[120px] font-mono"
                  />
                  <Button onClick={copyOutput} variant="outline" className="w-full">
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Output
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="decode" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>URL Decode</CardTitle>
              <CardDescription>Convert URL-encoded text back to original</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="decode-input">Encoded Text</Label>
                <Textarea
                  id="decode-input"
                  placeholder="Enter URL-encoded text (e.g., Hello%20World%21%20%40%23%24)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="min-h-[120px] font-mono"
                />
              </div>

              <Button onClick={decode} className="w-full" size="lg">
                <ArrowRight className="h-4 w-4 mr-2" />
                Decode
              </Button>

              {output && (
                <div className="space-y-2">
                  <Label htmlFor="decode-output">Decoded Output</Label>
                  <Textarea
                    id="decode-output"
                    value={output}
                    readOnly
                    className="min-h-[120px] font-mono"
                  />
                  <Button onClick={copyOutput} variant="outline" className="w-full">
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Output
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parse" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Parse URL</CardTitle>
              <CardDescription>Split a URL into parts and edit its query parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="parse-input">URL</Label>
                <Textarea
                  id="parse-input"
                  placeholder="https://user:pass@example.com:8080/path?tag=a&tag=b#top"
                  value={parseInput}
                  onChange={(e) => runParse(e.target.value)}
                  className="min-h-[80px] font-mono"
                />
                {parseError && (
                  <p role="alert" className="text-sm text-destructive">
                    {parseError}
                  </p>
                )}
              </div>

              {parsed && (
                <>
                  <div className="space-y-2">
                    {[
                      ["Protocol", parsed.protocol],
                      ["Username", parsed.username],
                      ["Password", parsed.password],
                      ["Host", parsed.hostname],
                      ["Port", parsed.port],
                      ["Path", parsed.pathname],
                      ["Hash", parsed.hash],
                    ]
                      .filter(([label, value]) => value || ["Protocol", "Host", "Path"].includes(label))
                      .map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4 text-sm">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-mono text-right break-all">{value || "-"}</span>
                        </div>
                      ))}
                  </div>

                  <div className="space-y-2">
                    <Label>Query Parameters ({parsed.params.length})</Label>
                    {parsed.params.length === 0 && (
                      <p className="text-sm text-muted-foreground">No query parameters.</p>
                    )}
                    {parsed.params.map((param, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          aria-label={`Parameter ${index + 1} name`}
                          value={param.key}
                          onChange={(e) => updateParam(index, "key", e.target.value)}
                          className="font-mono"
                          placeholder="name"
                        />
                        <Input
                          aria-label={`Parameter ${index + 1} value`}
                          value={param.value}
                          onChange={(e) => updateParam(index, "value", e.target.value)}
                          className="font-mono"
                          placeholder="value"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={`Remove parameter ${index + 1}`}
                          onClick={() => removeParam(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addParam}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Parameter
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="parse-output">Rebuilt URL</Label>
                    <Textarea
                      id="parse-output"
                      value={rebuiltUrl}
                      readOnly
                      className="min-h-[80px] font-mono"
                    />
                    <Button onClick={copyRebuilt} variant="outline" className="w-full">
                      {copiedUrl ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy URL
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {output && (
        <Button onClick={clearAll} variant="outline" className="w-full">
          Clear All
        </Button>
      )}

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
