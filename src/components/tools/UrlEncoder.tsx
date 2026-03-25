import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { ArrowRight, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";

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

  const clearAll = () => {
    setInput("");
    setOutput("");
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="encode" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="encode">Encode</TabsTrigger>
          <TabsTrigger value="decode">Decode</TabsTrigger>
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
