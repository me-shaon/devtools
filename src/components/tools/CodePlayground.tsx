import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Code2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type Language = "javascript" | "html" | "css";

const snippets = {
  javascript: `// JavaScript code example
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));

// Array operations
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
console.log("Doubled:", doubled);

// Async example
async function fetchData() {
  console.log("Fetching data...");
  return { status: "success", data: [1, 2, 3] };
}`,
  html: `<!DOCTYPE html>
<html>
<head>
  <title>My Page</title>
  <style>
    body { font-family: Arial; }
    .container { max-width: 800px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Hello World</h1>
    <p>This is a sample HTML document.</p>
    <button onclick="alert('Clicked!')">Click Me</button>
  </div>
</body>
</html>`,
  css: `/* CSS Styles */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #f5f5f5;
  margin: 0;
  padding: 20px;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.button {
  background: #007bff;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
}

.button:hover {
  background: #0056b3;
}`,
};

export function CodePlayground() {
  const [language, setLanguage] = useState<Language>("javascript");
  const [code, setCode] = useState(snippets.javascript);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  const runCode = () => {
    setError("");
    setOutput("");

    if (language === "javascript") {
      try {
        // Capture console.log output
        const logs: string[] = [];
        const originalLog = console.log;
        console.log = (...args) => {
          logs.push(args.map(arg =>
            typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
          ).join(" "));
        };

        // Execute the code
        const result = new Function(code)();

        // Restore console.log
        console.log = originalLog;

        setOutput(logs.join("\n") || (result !== undefined ? String(result) : "Code executed successfully"));
        toast.success("Code executed!");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        console.log = console.log; // Restore
      }
    } else {
      toast.info(`${language.toUpperCase()} preview is read-only`);
    }
  };

  const updateLanguage = (lang: Language) => {
    setLanguage(lang);
    setCode(snippets[lang]);
    setOutput("");
    setError("");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            Code Playground
          </CardTitle>
          <CardDescription>Write and run JavaScript, HTML, and CSS</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Select value={language} onValueChange={updateLanguage}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="javascript">JavaScript</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                  <SelectItem value="css">CSS</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={runCode} size="sm" disabled={language !== "javascript"}>
                <Play className="h-4 w-4 mr-1" />
                Run
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Code Input */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Code</div>
                <Textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="min-h-[400px] font-mono text-sm"
                  spellCheck={false}
                />
              </div>

              {/* Output */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Output</div>
                {error ? (
                  <div className="min-h-[400px] p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-red-500 mb-2">
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-medium">Error</span>
                    </div>
                    <pre className="text-sm text-red-400 whitespace-pre-wrap">{error}</pre>
                  </div>
                ) : (
                  <div className="min-h-[400px] p-4 bg-muted rounded-lg">
                    <pre className="text-sm whitespace-pre-wrap">{output || "Output will appear here..."}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>JavaScript code can be executed directly in the browser</li>
            <li>HTML and CSS are provided for reference and copying</li>
            <li>Console.log output is captured and displayed</li>
            <li>Be careful with infinite loops or blocking operations</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
