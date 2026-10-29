import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface TabContextMenuItem {
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface TabContextMenuProps {
  x: number;
  y: number;
  label: string;
  items: TabContextMenuItem[];
  onClose: () => void;
}

/** Right-click menu for a workspace tab. Arrow keys move, Enter picks, Esc or an outside click closes. */
export function TabContextMenu({ x, y, label, items, onClose }: TabContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    // Keep the menu inside the window near the right and bottom edges.
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    const enabled = () => Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
    enabled()[0]?.focus();
    const handlePointer = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        onClose();
        if (previous?.isConnected) previous.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const list = enabled();
      const index = list.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "Home" ? 0
        : event.key === "End" ? list.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    };
    document.addEventListener("pointerdown", handlePointer, true);
    menu.addEventListener("keydown", handleKey);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", handlePointer, true);
      menu.removeEventListener("keydown", handleKey);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="menu" aria-label={label} className="tab-context-menu" style={position}
      onContextMenu={(event) => event.preventDefault()}>
      {items.map((item) => (
        <button key={item.label} type="button" role="menuitem" tabIndex={-1} className="tab-context-menu-item"
          aria-disabled={item.disabled || undefined}
          onClick={() => {
            if (item.disabled) return;
            onClose();
            item.onSelect();
          }}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
