import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Code2 } from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/tools/CopyButton";

export function ApiFormatter() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");

  const formatJson = () => {
    if (!input.trim()) {
      toast.error("Please enter JSON to format");
      return;
    }

    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
    } catch (error) {
      toast.error("Invalid JSON");
    }
  };

  const minifyJson = () => {
    if (!input.trim()) {
      toast.error("Please enter JSON to minify");
      return;
    }

    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
    } catch (error) {
      toast.error("Invalid JSON");
    }
  };

  const parseUrlEncoded = () => {
    if (!input.trim()) {
      toast.error("Please enter URL-encoded data");
      return;
    }

    try {
      const params = new URLSearchParams(input);
      const result: Record<string, string> = {};
      params.forEach((value, key) => {
        result[key] = value;
      });
      setOutput(JSON.stringify(result, null, 2));
    } catch (error) {
      toast.error("Invalid URL-encoded data");
    }
  };

  const parseQueryString = () => {
    if (!input.trim()) {
      toast.error("Please enter a query string");
      return;
    }

    try {
      const queryString = input.startsWith("?") ? input.slice(1) : input;
      const params = new URLSearchParams(queryString);
      const result: Record<string, string> = {};
      params.forEach((value, key) => {
        result[key] = value;
      });
      setOutput(JSON.stringify(result, null, 2));
    } catch (error) {
      toast.error("Invalid query string");
    }
  };


  const clearAll = () => {
    setInput("");
    setOutput("");
  };

  const examples = {
    json: '{"name":"John","age":30,"city":"New York"}',
    urlEncoded: "name=John&age=30&city=New+York",
    queryString: "?name=John&age=30&city=New+York",
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            API Response Formatter
          </CardTitle>
          <CardDescription>Format and parse API responses</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="format" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="format">Format JSON</TabsTrigger>
              <TabsTrigger value="minify">Minify JSON</TabsTrigger>
              <TabsTrigger value="url">URL Encoded</TabsTrigger>
              <TabsTrigger value="query">Query String</TabsTrigger>
            </TabsList>

            <TabsContent value="format" className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder={examples.json}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                />
                <Button onClick={formatJson}>
                  Format JSON
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="minify" className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder={examples.json}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                />
                <Button onClick={minifyJson}>
                  Minify JSON
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="url" className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder={examples.urlEncoded}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                />
                <Button onClick={parseUrlEncoded}>
                  Parse URL Encoded
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="query" className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder={examples.queryString}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                />
                <Button onClick={parseQueryString}>
                  Parse Query String
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {output && (
            <>
              <div className="space-y-2 mt-4">
                <Textarea
                  value={output}
                  readOnly
                  className="min-h-[200px] font-mono text-sm"
                />
              </div>
              <div className="flex gap-2">
                <CopyButton value={output} label="Copy output" />
                <Button onClick={clearAll} variant="outline">
                  Clear
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
