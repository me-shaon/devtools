import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { useDarkClass } from "@/hooks/useDarkClass";
import { installExternalLinkHandler } from "@/lib/desktop";
import { buildPreviewDocument } from "@/utils/html-preview";
import { convertMarkdown, countRemoteImages, markdownCss, sanitizeHtml } from "@/utils/markdown";

const DEFAULT_MARKDOWN = `# Markdown Preview

Write **GitHub Flavored Markdown** on the left. The preview updates as you type.

## Lists and tasks

- [x] Tables and task lists
- [ ] Inline HTML, such as <kbd>Ctrl</kbd> + <kbd>C</kbd> and H<sub>2</sub>O

## Table

| Feature | Supported |
| ------- | :-------: |
| Tables  | Yes       |
| HTML    | Yes       |

## HTML blocks

<details>
<summary>Select to open</summary>

Markdown works inside an HTML block when a blank line separates them.

</details>

## Code

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

> Remote images stay blocked until you select **Load images**.
`;

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which Markdown syntax works?",
    a: "CommonMark with GitHub Flavored Markdown: headings, lists, links, images, code blocks, tables, task lists, strikethrough, and autolinks.",
  },
  {
    q: "Can I use HTML?",
    a: "Yes. Inline tags such as <kbd> and <sub>, and blocks such as <details> and <p align=\"center\">, render as on GitHub. Scripts, event handlers, forms, frames, and <style> tags are removed. The preview runs in a sandbox, so the document cannot change the app.",
  },
  {
    q: "Why are images from the web missing?",
    a: "Remote images can track when you open a document, so the preview blocks them. Select Load images to show them for this document. Images in data: URLs always show.",
  },
  {
    q: "What does Copy HTML copy?",
    a: "The HTML of the document after the tool removes unsafe parts, without the preview styles.",
  },
];

const countWords = (text: string) => text.match(/\S+/g)?.length ?? 0;

export function MarkdownEditor() {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [remoteImages, setRemoteImages] = useState(false);
  const dark = useDarkClass();
  const frame = useRef<HTMLIFrameElement>(null);
  const deferred = useDeferredValue(markdown);

  const html = useMemo(() => sanitizeHtml(convertMarkdown(deferred)), [deferred]);
  const remoteCount = useMemo(() => countRemoteImages(html), [html]);
  const srcDoc = useMemo(
    () => (html.trim() ? buildPreviewDocument(`<article class="markdown-body">${html}</article>`, { scripts: false, dark, remoteImages, css: markdownCss(dark) }) : ""),
    [html, dark, remoteImages],
  );

  // Links in the preview open in the system browser, as links elsewhere in the app do
  const removeLinkHandler = useRef<(() => void) | null>(null);
  const attachLinkHandler = () => {
    removeLinkHandler.current?.();
    const doc = frame.current?.contentDocument;
    removeLinkHandler.current = doc ? installExternalLinkHandler(doc) : null;
  };
  useEffect(() => () => removeLinkHandler.current?.(), []);

  const notice =
    remoteCount > 0 ? (
      <div className="workspace-notice" role="status">
        {remoteImages ? (
          <>
            Remote images are loaded.{" "}
            <button type="button" className="toolbar-text-button" onClick={() => setRemoteImages(false)}>
              Block images
            </button>
          </>
        ) : (
          <>
            {remoteCount === 1 ? "1 remote image is blocked." : `${remoteCount} remote images are blocked.`}{" "}
            <button type="button" className="toolbar-text-button" onClick={() => setRemoteImages(true)}>
              Load images
            </button>
          </>
        )}
      </div>
    ) : undefined;

  return (
    <ToolWorkspace
      id="markdown"
      notice={notice}
      first={
        <EditorPane
          title="Markdown"
          htmlFor="markdown-input"
          actions={
            <>
              <CopyButton value={markdown} label="Copy" ariaLabel="Copy Markdown" />
              {markdown && (
                <button type="button" className="toolbar-text-button" onClick={() => setMarkdown("")}>
                  Clear
                </button>
              )}
            </>
          }
        >
          <CodeTextarea id="markdown-input" value={markdown} spellCheck={false} placeholder="# Write Markdown here" onChange={(event) => setMarkdown(event.target.value)} />
        </EditorPane>
      }
      second={
        <EditorPane title="Preview" scroll={false} actions={<CopyButton value={html} label="Copy HTML" />}>
          <div className="relative h-full min-h-0">
            {srcDoc ? (
              // Scripts stay off (no allow-scripts, and the CSP blocks them). allow-same-origin lets
              // this page attach the link handler to the preview document.
              <iframe
                ref={frame}
                title="Markdown preview"
                sandbox="allow-same-origin"
                referrerPolicy="no-referrer"
                srcDoc={srcDoc}
                onLoad={attachLinkHandler}
                className="absolute inset-0 h-full w-full bg-background"
              />
            ) : (
              <PaneEmpty title="The preview appears here" hint="Write Markdown on the left." />
            )}
          </div>
        </EditorPane>
      }
      status={
        <>
          <span>{countWords(markdown) === 1 ? "1 word" : `${countWords(markdown)} words`}</span>
          <span>{markdown.split("\n").length === 1 ? "1 line" : `${markdown.split("\n").length} lines`}</span>
        </>
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
