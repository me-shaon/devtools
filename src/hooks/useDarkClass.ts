import { useEffect, useState } from "react";

const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");

/** True while the app shows the dark theme. It follows a theme change while the tool is open. */
export function useDarkClass(): boolean {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}
