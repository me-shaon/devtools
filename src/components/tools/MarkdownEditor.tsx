import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CodeTextarea, EditorPane, PaneEmpty, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { useDarkClass } from "@/hooks/useDarkClass";
import { installExternalLinkHandler } from "@/lib/desktop";
import { buildPreviewDocument } from "@/utils/html-preview";
import { convertMarkdown, countRemoteImages, markdownCss, sanitizeHtml } from "@/utils/markdown";
import { scrollRatio, scrollToRatio } from "@/utils/scroll-sync";

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

  // Scrolling one pane scrolls the other to the same relative position. When a sync sets
  // scrollTop, the target pane fires its own scroll event. `echo` holds the position that
  // sync set, so that event does not sync back.
  const editor = useRef<HTMLTextAreaElement>(null);
  const echo = useRef<{ editor: number | null; preview: number | null }>({ editor: null, preview: null });
  const previewScroller = () => {
    const doc = frame.current?.contentDocument;
    return doc ? (doc.scrollingElement ?? doc.documentElement) : null;
  };
  const copyScroll = (source: "editor" | "preview") => {
    const target = source === "editor" ? "preview" : "editor";
    const from = source === "editor" ? editor.current : previewScroller();
    const to = source === "editor" ? previewScroller() : editor.current;
    if (!from || !to) return;
    const before = to.scrollTop;
    const after = scrollToRatio(to, scrollRatio(from));
    echo.current[target] = after !== before ? after : null;
  };
  const syncScroll = (source: "editor" | "preview") => {
    const element = source === "editor" ? editor.current : previewScroller();
    const expected = echo.current[source];
    echo.current[source] = null;
    if (element && expected !== null && Math.abs(element.scrollTop - expected) <= 1) return;
    copyScroll(source);
  };

  // The preview document reloads on each change. Each load gets the link handler and the
  // scroll listener again, and takes the scroll position of the editor.
  // Links in the preview open in the system browser, as links elsewhere in the app do.
  const detachPreview = useRef<(() => void) | null>(null);
  const attachPreview = () => {
    detachPreview.current?.();
    detachPreview.current = null;
    const win = frame.current?.contentWindow;
    const doc = frame.current?.contentDocument;
    if (!win || !doc) return;
    const removeLinkHandler = installExternalLinkHandler(doc);
    const onScroll = () => syncScroll("preview");
    win.addEventListener("scroll", onScroll);
    detachPreview.current = () => {
      removeLinkHandler();
      win.removeEventListener("scroll", onScroll);
    };
    copyScroll("editor");
  };
  useEffect(() => () => detachPreview.current?.(), []);

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
          <CodeTextarea
            ref={editor}
            id="markdown-input"
            value={markdown} spellCheck={false} placeholder="# Write Markdown here"
            onChange={(event) => setMarkdown(event.target.value)}
            onScroll={() => syncScroll("editor")}
          />
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
                onLoad={attachPreview}
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
