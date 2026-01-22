import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

type CaseType = "camelCase" | "PascalCase" | "snake_case" | "kebab-case" | "UPPER_SNAKE_CASE" | "Sentence case" | "lowercase" | "UPPERCASE" | "Title Case";

export function CaseConverter() {
  const [input, setInput] = useState("");
  const [outputs, setOutputs] = useState<Record<CaseType, string>>({
    camelCase: "",
    PascalCase: "",
    snake_case: "",
    "kebab-case": "",
    UPPER_SNAKE_CASE: "",
    "Sentence case": "",
    lowercase: "",
    UPPERCASE: "",
    "Title Case": "",
  });
  const [copied, setCopied] = useState<string | null>(null);

  const toCamelCase = (str: string) => {
    return str
      .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
      .replace(/^(.)/, (c) => c.toLowerCase());
  };

  const toPascalCase = (str: string) => {
    return str
      .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
      .replace(/^(.)/, (c) => c.toUpperCase());
  };

  const toSnakeCase = (str: string) => {
    return str
      .replace(/([A-Z])/g, "_$1")
      .replace(/^_/, "")
      .replace(/[-\s]+/g, "_")
      .toLowerCase();
  };

  const toKebabCase = (str: string) => {
    return str
      .replace(/([A-Z])/g, "-$1")
      .replace(/^-/, "")
      .replace(/[\s_]+/g, "-")
      .toLowerCase();
  };

  const toUpperSnakeCase = (str: string) => {
    return str
      .replace(/([A-Z])/g, "_$1")
      .replace(/^_/, "")
      .replace(/[-\s]+/g, "_")
      .toUpperCase();
  };

  const toSentenceCase = (str: string) => {
    return str
      .replace(/[-_]+(.)?/g, (_, c) => (c ? " " + c.toLowerCase() : " "))
      .replace(/^\s/, "")
      .replace(/([.!?]\s*)(.)/g, (_, prefix, c) => prefix + c.toUpperCase())
      .replace(/^(.)/, (c) => c.toUpperCase());
  };

  const toTitleCase = (str: string) => {
    return str
      .replace(/[-_\s]+(.)?/g, (_, c) => (c ? " " + c.toUpperCase() : " "))
      .replace(/^\s/, "")
      .replace(/^./, (c) => c.toUpperCase());
  };

  const convert = () => {
    if (!input.trim()) {
      toast.error("Please enter text to convert");
      return;
    }

    const converted = {
      camelCase: toCamelCase(input),
      PascalCase: toPascalCase(input),
      snake_case: toSnakeCase(input),
      "kebab-case": toKebabCase(input),
      UPPER_SNAKE_CASE: toUpperSnakeCase(input),
      "Sentence case": toSentenceCase(input),
      lowercase: input.toLowerCase(),
      UPPERCASE: input.toUpperCase(),
      "Title Case": toTitleCase(input),
    };

    setOutputs(converted);
    toast.success("Text converted!");
  };

  const copyToClipboard = (caseType: CaseType, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(caseType);
    setTimeout(() => setCopied(null), 2000);
    toast.success(`${caseType} copied!`);
  };

  const caseLabels: { key: CaseType; label: string; description: string }[] = [
    { key: "camelCase", label: "camelCase", description: "First word lowercase, subsequent words capitalized" },
    { key: "PascalCase", label: "PascalCase", description: "Every word capitalized" },
    { key: "snake_case", label: "snake_case", description: "Words separated by underscores, all lowercase" },
    { key: "kebab-case", label: "kebab-case", description: "Words separated by hyphens, all lowercase" },
    { key: "UPPER_SNAKE_CASE", label: "UPPER_SNAKE_CASE", description: "Words separated by underscores, all uppercase" },
    { key: "Sentence case", label: "Sentence case", description: "First letter capitalized, spaces between words" },
    { key: "lowercase", label: "lowercase", description: "All letters lowercase" },
    { key: "UPPERCASE", label: "UPPERCASE", description: "All letters uppercase" },
    { key: "Title Case", label: "Title Case", description: "First letter of each word capitalized" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Enter Text</CardTitle>
          <CardDescription>Type or paste text to convert to different cases</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Enter text to convert..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="min-h-[120px] font-mono"
          />
          <Button onClick={convert} className="mt-4 w-full" size="lg">
            Convert Text
          </Button>
        </CardContent>
      </Card>

      {outputs.camelCase && (
        <div className="space-y-3">
          {caseLabels.map(({ key, label, description }) => (
            <Card key={key}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-medium text-sm">{label}</h3>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(key, outputs[key])}
                    className="ml-2 shrink-0"
                  >
                    {copied === key ? (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <div className="p-3 rounded-md bg-muted font-mono text-sm break-all">
                  {outputs[key] || "(empty)"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
