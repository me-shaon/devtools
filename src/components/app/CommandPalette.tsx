import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchTools } from "@/utils/tool-search";
import type { ToolDefinition } from "@/app/toolRegistry";

interface CommandPaletteProps {
  open: boolean;
  tools: ToolDefinition[];
  favorites: string[];
  recents: string[];
  onClose: () => void;
  onSelectTool: (tool: ToolDefinition) => void;
}

const MAX_RESULTS = 10;

function buildDefaultResults(
  tools: ToolDefinition[],
  favorites: string[],
  recents: string[],
): ToolDefinition[] {
  const orderedIds = [...favorites, ...recents];
  const seenToolIds = new Set<string>();
  const prioritizedTools: ToolDefinition[] = [];

  for (const toolId of orderedIds) {
    const tool = tools.find((entry) => entry.id === toolId);
    if (!tool || seenToolIds.has(tool.id)) {
      continue;
    }

    prioritizedTools.push(tool);
    seenToolIds.add(tool.id);
  }

  const remainingTools = tools
    .filter((tool) => !seenToolIds.has(tool.id))
    .sort((left, right) => left.name.localeCompare(right.name));

  return [...prioritizedTools, ...remainingTools].slice(0, MAX_RESULTS);
}

export function CommandPalette({
  open,
  tools,
  favorites,
  recents,
  onClose,
  onSelectTool,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) {
      return buildDefaultResults(tools, favorites, recents);
    }

    return searchTools(tools, query).slice(0, MAX_RESULTS);
  }, [favorites, query, recents, tools]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) {
    return null;
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (!results.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((currentIndex) => (currentIndex + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((currentIndex) => (currentIndex - 1 + results.length) % results.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onSelectTool(results[activeIndex] ?? results[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-[12vh]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        className="w-full max-w-2xl overflow-hidden rounded-xl border bg-background shadow-2xl"
      >
        <div className="border-b px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search tools..."
              className="h-11 border-0 bg-transparent pl-10 pr-3 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {results.length ? (
            <div className="space-y-1">
              {results.map((tool, index) => {
                const isActive = index === activeIndex;

                return (
                  <button
                    key={tool.id}
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                      isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => onSelectTool(tool)}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                      <tool.icon className="h-4 w-4 text-[#EB5757]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{tool.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{tool.category}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">
              No tools matched “{query}”.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
          <span>Use arrows to navigate</span>
          <span>Enter to open • Esc to close</span>
        </div>
      </div>

      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 -z-10"
        onClick={onClose}
      />
    </div>
  );
}
