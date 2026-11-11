import { useEffect, useRef, type RefObject } from "react";
import { scrollRatio, scrollToRatio } from "@/utils/scroll-sync";

/**
 * Keeps an editor and a preview frame at the same relative scroll position.
 *
 * The frame must allow same-origin access (`allow-same-origin` without `allow-scripts`), so
 * this page can read its scroll position. A frame without that access is left alone.
 * Call `onFrameLoad` from the frame's load event and `onEditorScroll` from the editor's scroll
 * event. The preview reloads on each change, and each load takes the editor's position.
 */
export function usePreviewScrollSync(editor: RefObject<HTMLElement>, frame: RefObject<HTMLIFrameElement>) {
  // When a sync sets scrollTop, the target fires its own scroll event. `echo` holds the
  // position that sync set, so that event does not sync back.
  const echo = useRef<{ editor: number | null; preview: number | null }>({ editor: null, preview: null });
  const detach = useRef<(() => void) | null>(null);

  const previewScroller = () => {
    let doc: Document | null = null;
    try {
      doc = frame.current?.contentDocument ?? null;
    } catch {
      // A frame from another origin
    }
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

  const onFrameLoad = () => {
    detach.current?.();
    detach.current = null;
    const scroller = previewScroller();
    const win = scroller ? frame.current?.contentWindow : null;
    if (!win) return;
    const onScroll = () => syncScroll("preview");
    win.addEventListener("scroll", onScroll);
    detach.current = () => win.removeEventListener("scroll", onScroll);
    copyScroll("editor");
  };

  useEffect(() => () => detach.current?.(), []);

  return { onEditorScroll: () => syncScroll("editor"), onFrameLoad };
}
