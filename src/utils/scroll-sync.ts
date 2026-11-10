/** Scroll position as a fraction of the scrollable distance: 0 at the top, 1 at the bottom. */
export function scrollRatio(element: Element): number {
  const max = element.scrollHeight - element.clientHeight;
  return max > 0 ? Math.min(1, Math.max(0, element.scrollTop / max)) : 0;
}

/** Scrolls to the same fraction of the scrollable distance. Returns the new scrollTop. */
export function scrollToRatio(element: Element, ratio: number): number {
  const max = element.scrollHeight - element.clientHeight;
  element.scrollTop = max > 0 ? Math.round(ratio * max) : 0;
  return element.scrollTop;
}
