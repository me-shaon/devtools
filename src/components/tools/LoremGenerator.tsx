import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

const words = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
  "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
  "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
  "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
  "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
  "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
  "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
  "deserunt", "mollit", "anim", "id", "est", "laborum",
];

export function LoremGenerator() {
  const [type, setType] = useState<"paragraphs" | "sentences" | "words">("paragraphs");
  const [count, setCount] = useState(3);
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);

  const generateWords = (numWords: number): string => {
    const result: string[] = [];
    for (let i = 0; i < numWords; i++) {
      result.push(words[Math.floor(Math.random() * words.length)]);
    }
    return result.join(" ");
  };

  const generateSentences = (numSentences: number): string => {
    const result: string[] = [];
    for (let i = 0; i < numSentences; i++) {
      const numWords = Math.floor(Math.random() * 10) + 5;
      const sentence = generateWords(numWords);
      result.push(sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".");
    }
    return result.join(" ");
  };

  const generateParagraphs = (numParagraphs: number): string => {
    const result: string[] = [];
    for (let i = 0; i < numParagraphs; i++) {
      const numSentences = Math.floor(Math.random() * 4) + 4;
      const paragraph = generateSentences(numSentences);
      result.push(paragraph);
    }
    return result.join("\n\n");
  };

  const generate = () => {
    let result = "";
    switch (type) {
      case "words":
        result = generateWords(count);
        break;
      case "sentences":
        result = generateSentences(count);
        break;
      case "paragraphs":
        result = generateParagraphs(count);
        break;
    }
    setOutput(result);
    toast.success("Lorem ipsum generated!");
  };

  const copyOutput = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard!");
  };

  const getTypeLabel = () => {
    switch (type) {
      case "words":
        return "Words";
      case "sentences":
        return "Sentences";
      case "paragraphs":
        return "Paragraphs";
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Lorem Ipsum Generator</CardTitle>
          <CardDescription>Generate placeholder text for your projects</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Output Type</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paragraphs">Paragraphs</SelectItem>
                <SelectItem value="sentences">Sentences</SelectItem>
                <SelectItem value="words">Words</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              Amount: {count} {getTypeLabel().toLowerCase()}
            </Label>
            <Slider
              value={[count]}
              onValueChange={([value]) => setCount(value)}
              min={1}
              max={type === "words" ? 100 : type === "sentences" ? 50 : 20}
              step={1}
            />
          </div>

          <Button onClick={generate} className="w-full" size="lg">
            Generate Lorem Ipsum
          </Button>

          {output && (
            <>
              <div className="space-y-2">
                <Label>Output</Label>
                <div className="p-4 bg-muted rounded-lg max-h-[300px] overflow-y-auto">
                  <p className="whitespace-pre-wrap text-sm">{output}</p>
                </div>
              </div>
              <Button onClick={copyOutput} variant="outline" className="w-full">
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy to Clipboard
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
