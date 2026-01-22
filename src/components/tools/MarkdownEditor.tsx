import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Check, Eye, Code } from "lucide-react";
import { toast } from "sonner";

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
  const [html, setHtml] = useState("");
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"split" | "preview" | "source">("split");

  useEffect(() => {
    convertMarkdown();
  }, [markdown]);

  const convertMarkdown = () => {
    let html = markdown;

    // Headers
    html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

    // Bold and Italic
    html = html.replace(/\*\*\*(.*?)\*\*\*/gim, "<strong><em>$1</em></strong>");
    html = html.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
    html = html.replace(/\*(.*?)\*/gim, "<em>$1</em>");

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/gim, '<img src="$2" alt="$1" />');

    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/gim, '<pre><code>$2</code></pre>');

    // Inline code
    html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');

    // Blockquotes
    html = html.replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>");

    // Unordered lists
    html = html.replace(/^\s*-\s+(.*$)/gim, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");

    // Ordered lists
    html = html.replace(/^\s*\d+\.\s+(.*$)/gim, "<li>$1</li>");

    // Horizontal rule
    html = html.replace(/^---$/gim, "<hr>");

    // Line breaks
    html = html.replace(/\n/g, "<br>");

    setHtml(html);
  };

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
                  className="min-h-[500px] max-h-[500px] overflow-y-auto p-4 bg-white dark:bg-gray-900 rounded-md border prose dark:prose-invert max-w-none"
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
