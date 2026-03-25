import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Check, Eye, Code } from "lucide-react";
import { toast } from "sonner";
import { convertMarkdown } from "@/utils/markdown";

const defaultMarkdown = `# Welcome to Markdown Editor

## Features

- **Bold** and *italic* text
- Lists (ordered and unordered)
- [Links](https://example.com)
- \`Inline code\` and code blocks

## Code Block

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

## Table

| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |

## Blockquote

> This is a blockquote
> with multiple lines

---

**Start typing to see the preview!**
`;

export function MarkdownEditor() {
  const [markdown, setMarkdown] = useState(defaultMarkdown);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"split" | "preview" | "source">("split");
  const deferredMarkdown = useDeferredValue(markdown);
  const html = useMemo(() => convertMarkdown(deferredMarkdown), [deferredMarkdown]);

  const copyHtml = () => {
    const cleanHtml = html.replace(/<br>/g, "\n");
    navigator.clipboard.writeText(cleanHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("HTML copied!");
  };

  const copyMarkdown = () => {
    navigator.clipboard.writeText(markdown);
    toast.success("Markdown copied!");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Markdown Editor</CardTitle>
          <CardDescription>Write markdown and see live HTML preview</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Button
              variant={view === "split" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("split")}
            >
              <Code className="h-4 w-4 mr-1" />
              Split
            </Button>
            <Button
              variant={view === "preview" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("preview")}
            >
              <Eye className="h-4 w-4 mr-1" />
              Preview Only
            </Button>
            <Button
              variant={view === "source" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("source")}
            >
              <Code className="h-4 w-4 mr-1" />
              Source Only
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(view === "split" || view === "source") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Markdown</label>
                  <Button variant="ghost" size="sm" onClick={copyMarkdown}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <Textarea
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  className="min-h-[500px] font-mono text-sm resize-none"
                  placeholder="Write your markdown here..."
                />
              </div>
            )}

            {(view === "split" || view === "preview") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">HTML Preview</label>
                  <Button variant="ghost" size="sm" onClick={copyHtml}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
                <div
                  className="min-h-[500px] max-h-[500px] overflow-y-auto rounded-md border border-border bg-background p-4 text-foreground prose prose-neutral max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-blockquote:text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Markdown Quick Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <code className="text-xs"># Heading</code>
              <p className="text-muted-foreground text-xs">H1 Heading</p>
            </div>
            <div>
              <code className="text-xs">**bold**</code>
              <p className="text-muted-foreground text-xs">Bold text</p>
            </div>
            <div>
              <code className="text-xs">*italic*</code>
              <p className="text-muted-foreground text-xs">Italic text</p>
            </div>
            <div>
              <code className="text-xs">[text](url)</code>
              <p className="text-muted-foreground text-xs">Link</p>
            </div>
            <div>
              <code className="text-xs">\`code\`</code>
              <p className="text-muted-foreground text-xs">Inline code</p>
            </div>
            <div>
              <code className="text-xs">- item</code>
              <p className="text-muted-foreground text-xs">List item</p>
            </div>
            <div>
              <code className="text-xs">&gt; quote</code>
              <p className="text-muted-foreground text-xs">Blockquote</p>
            </div>
            <div>
              <code className="text-xs">---hr---</code>
              <p className="text-muted-foreground text-xs">Horizontal rule</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
