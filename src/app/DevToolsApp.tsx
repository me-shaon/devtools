import { useDialogFocus } from "@/components/app/useDialogFocus";
import {
  Suspense,
  startTransition,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Plus,
  PanelLeft,
  RefreshCw,
  Search,
  ChevronRight,
  ChevronDown,
  Home,
  Star,
  X,
  Moon,
  Sun,
  Command,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CommandPalette } from "@/components/app/CommandPalette";
import { ShortcutSettingsDialog } from "@/components/app/ShortcutSettingsDialog";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import {
  ALL_TOOLS,
  CATEGORIES,
  TOOL_BY_ID,
  TOOL_COMPONENTS,
  type ToolDefinition,
  type ToolId,
} from "@/app/toolRegistry";
import { getReleaseNotes } from "@/data/releaseNotes";
import { parseDeepLink } from "@/utils/deep-link";
import { buildToolManifest } from "@/utils/tool-manifest";
import { Switch } from "@/components/ui/switch";
import { detectPastedContent, type PasteSuggestion } from "@/utils/clipboard-detect";
import { PasteSuggestions } from "@/components/app/PasteSuggestions";
import { loadGlobalShortcut, saveGlobalShortcut, toAccelerator, type GlobalShortcut } from "@/utils/global-shortcut";
import { convertMarkdown } from "@/utils/markdown";
import {
  formatShortcutBinding,
  getDefaultShortcutBindings,
  loadStoredShortcutBindings,
  saveShortcutBindings,
  type ShortcutBindings,
} from "@/utils/shortcuts";
import {
  SYSTEM_THEME_QUERY,
  THEME_STORAGE_KEY,
  getStoredThemePreference,
  getSystemDarkMode,
  resolveDarkMode,
  syncDarkClass,
} from "@/utils/theme";
import { getDesktopBridge, type UpdateState } from "@/lib/desktop";

const TOOL_IDS: ReadonlySet<string> = new Set(ALL_TOOLS.map((tool) => tool.id));
const MAX_FAVORITES = 5;
const AUTO_UPDATE_STORAGE_KEY = "devtools-auto-update";
// Tools that use the shared editor layout (toolbar, panes, status bar) and fill the panel.
const WORKSPACE_TOOL_IDS = new Set<string>(["json-viewer", "hash-generator", "text-compare", "json-diff", "har-viewer", "jwt-decoder", "csv-json", "base64", "url-encoder", "code-formatter", "yaml-json", "string-inspector", "line-tools", "escape-tools", "random-string", "qr-reader", "image-metadata", "video-metadata", "secret-redactor", "token-counter", "ai-text-cleaner", "json-typescript", "certificate-decoder", "html-preview", "html-to-jsx", "svg-to-css", "curl-to-code", "php-tools", "compression", "lorem-generator", "case-converter", "regex-generator", "qr-generator", "date-format", "json-schema", "key-generator"]);
const MAX_RECENT_TOOLS = 6;

const FAVORITES_STORAGE_KEY = "devtools-favorites";
const RECENT_TOOLS_STORAGE_KEY = "devtools-recent-tools";
const WHATS_NEW_SEEN_STORAGE_KEY = "devtools-whats-new-seen-version";

const DevToolsApp = () => {
  const desktop = getDesktopBridge();
  const platform = desktop?.platform;
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 640);
  const [themePreference, setThemePreference] = useState(() =>
    getStoredThemePreference(typeof window !== "undefined" ? window.localStorage : undefined)
  );
  const [systemDarkMode, setSystemDarkMode] = useState(() =>
    getSystemDarkMode(typeof window !== "undefined" ? window.matchMedia.bind(window) : undefined)
  );
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null);
  const [openTools, setOpenTools] = useState<ToolDefinition[]>([]);
  useEffect(() => {
    if (selectedTool) document.getElementById(`tab-${selectedTool.id}`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selectedTool]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentToolIds, setRecentToolIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [appVersion, setAppVersion] = useState<string>("");
  const [updateState, setUpdateState] = useState<UpdateState>({ status: "idle" });
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [seenWhatsNewVersion, setSeenWhatsNewVersion] = useState("");
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutSettings, setShowShortcutSettings] = useState(false);
  const [shortcutBindings, setShortcutBindings] = useState<ShortcutBindings>(() =>
    loadStoredShortcutBindings(
      platform,
      typeof window !== "undefined" ? window.localStorage : undefined,
    ),
  );
  const darkMode = resolveDarkMode(themePreference, systemDarkMode);
  const releaseNotes = useMemo(
    () => (appVersion ? getReleaseNotes(appVersion) : null),
    [appVersion]
  );
  const whatsNewHtml = useMemo(
    () => (releaseNotes ? convertMarkdown(releaseNotes.markdown) : ""),
    [releaseNotes]
  );
  const hasUnreadWhatsNew = Boolean(
    releaseNotes && seenWhatsNewVersion !== releaseNotes.version
  );

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setFavorites(parsed);
        }
      }
    } catch (error) {
      console.error("Failed to load favorites:", error);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_TOOLS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentToolIds(parsed);
        }
      }
    } catch (error) {
      console.error("Failed to load recent tools:", error);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(WHATS_NEW_SEEN_STORAGE_KEY);
      if (stored) {
        setSeenWhatsNewVersion(stored);
      }
    } catch (error) {
      console.error("Failed to load seen what's new version:", error);
    }
  }, []);

  // Save favorites to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch (error) {
      console.error("Failed to save favorites:", error);
    }
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_TOOLS_STORAGE_KEY, JSON.stringify(recentToolIds));
    } catch (error) {
      console.error("Failed to save recent tools:", error);
    }
  }, [recentToolIds]);

  useEffect(() => {
    saveShortcutBindings(
      typeof window !== "undefined" ? window.localStorage : undefined,
      shortcutBindings,
    );
  }, [shortcutBindings]);

  useEffect(() => {
    syncDarkClass(document.documentElement, darkMode);
  }, [darkMode]);

  useEffect(() => {
    // The native window material follows the window appearance, not the page theme.
    void desktop?.setWindowTheme?.(themePreference === "system" ? null : themePreference);
  }, [desktop, themePreference]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch (error) {
      console.error("Failed to save theme preference:", error);
    }
  }, [themePreference]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemDarkMode(event.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);

      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);

    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (!desktop) {
      return undefined;
    }

    let cancelled = false;

    const loadAppMeta = async () => {
      try {
        const [version, currentUpdateState] = await Promise.all([
          desktop.getVersion(),
          desktop.getUpdateState(),
        ]);

        if (!cancelled) {
          setAppVersion(typeof version === "string" ? version : "");
          if (currentUpdateState && typeof currentUpdateState === "object") {
            setUpdateState(currentUpdateState as UpdateState);
          }
        }
      } catch (error) {
        console.error("Failed to load app metadata:", error);
      }
    };

    loadAppMeta();

    const unsubscribe = desktop.onUpdateState((nextState) => {
      if (!cancelled && nextState && typeof nextState === "object") {
        setUpdateState(nextState as UpdateState);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [desktop]);

  useEffect(() => {
    if (!releaseNotes) {
      return;
    }

    if (seenWhatsNewVersion !== releaseNotes.version) {
      setShowWhatsNew(true);
    }
  }, [seenWhatsNewVersion, releaseNotes]);

  const handleUpdateAction = async () => {
    if (!desktop) {
      return;
    }

    try {
      if (updateState.status === "available") {
        await desktop.downloadUpdate();
        return;
      }

      if (updateState.status === "downloaded") {
        await desktop.installUpdate();
        return;
      }

      await desktop.checkForUpdates();
    } catch (error) {
      console.error("Failed to run update action:", error);
      toast.error("Unable to complete the update action.");
    }
  };

  const openWhatsNew = () => {
    if (releaseNotes) {
      setShowCommandPalette(false);
      setShowShortcutSettings(false);
      setShowWhatsNew(true);
    }
  };

  const closeWhatsNew = () => {
    if (releaseNotes) {
      try {
        localStorage.setItem(WHATS_NEW_SEEN_STORAGE_KEY, releaseNotes.version);
      } catch (error) {
        console.error("Failed to save seen what's new version:", error);
      }
      setSeenWhatsNewVersion(releaseNotes.version);
    }

    setShowWhatsNew(false);
  };
  const releaseDialogRef = useDialogFocus(showWhatsNew, closeWhatsNew);


  const [paletteQuery, setPaletteQuery] = useState("");
  const openCommandPaletteWith = (query: string) => {
    setShowShortcutSettings(false);
    setPaletteQuery(query);
    setShowCommandPalette(true);
  };
  const openCommandPalette = () => openCommandPaletteWith("");

  const closeCommandPalette = () => {
    setShowCommandPalette(false);
  };

  const openShortcutSettings = () => {
    setShowCommandPalette(false);
    setShowShortcutSettings(true);
  };

  const closeShortcutSettings = () => {
    setShowShortcutSettings(false);
  };

  const updateShortcutBinding = (actionId: keyof ShortcutBindings, binding: ShortcutBindings[keyof ShortcutBindings]) => {
    setShortcutBindings((prev) => ({
      ...prev,
      [actionId]: binding,
    }));
  };

  const resetShortcutBindings = () => {
    setShortcutBindings(getDefaultShortcutBindings(platform));
    toast.success("Keyboard shortcuts reset to defaults.");
  };

  const updateButtonLabel = useMemo(() => {
    switch (updateState.status) {
      case "checking":
        return "Checking...";
      case "available":
        return updateState.version ? `Update to v${updateState.version}` : "Update";
      case "downloading":
        return updateState.progress
          ? `Downloading ${Math.round(updateState.progress)}%`
          : "Downloading...";
      case "downloaded":
        return "Restart to Update";
      case "unsupported":
        return "Dev Build";
      default:
        return "Check for Updates";
    }
  }, [updateState]);

  const updateStatusLabel = useMemo(() => {
    switch (updateState.status) {
      case "available":
        return updateState.version
          ? `Version ${updateState.version} is available.`
          : "An update is available.";
      case "not-available":
        return "";
      case "downloading":
        return updateState.progress
          ? `Downloading update: ${Math.round(updateState.progress)}%`
          : "Downloading update...";
      case "downloaded":
        return updateState.version
          ? `Version ${updateState.version} is ready. It installs when you quit DevTools.`
          : "An update is ready. It installs when you quit DevTools.";
      case "checking":
        return "Checking for updates...";
      case "error":
        return "The update did not complete. Check your connection and try again.";
      case "unsupported":
        return "Updates are disabled in development builds.";
      default:
        return "";
    }
  }, [updateState]);

  const toggleFavorite = (toolId: string) => {
    setFavorites((prev) => {
      const isFavorited = prev.includes(toolId);
      if (isFavorited) {
        // Remove from favorites
        return prev.filter((id) => id !== toolId);
      } else {
        // Add to favorites if limit not reached
        if (prev.length >= MAX_FAVORITES) {
          toast.error(`Maximum ${MAX_FAVORITES} favorites allowed. Remove one first.`);
          return prev;
        }
        return [...prev, toolId];
      }
    });
  };

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  };

  // Filter tools based on search query
  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return ALL_TOOLS;
    const query = searchQuery.trim().toLowerCase();
    return ALL_TOOLS.filter(
      (tool) =>
        tool.name.toLowerCase().includes(query) ||
        tool.category.toLowerCase().includes(query) ||
        tool.keywords.some((keyword) => keyword.startsWith(query))
    );
  }, [searchQuery]);

  // Get favorite tool objects
  const favoriteTools = useMemo(() => {
    return favorites
      .map((id) => TOOL_BY_ID.get(id as ToolId))
      .filter((tool): tool is ToolDefinition => Boolean(tool));
  }, [favorites]);

  const recentTools = useMemo(() => {
    return recentToolIds
      .map((id) => TOOL_BY_ID.get(id as ToolId))
      .filter((tool): tool is ToolDefinition => Boolean(tool));
  }, [recentToolIds]);

  const quickAccessTools = useMemo(() => {
    const hiddenToolIds = new Set([...recentToolIds, ...favorites]);

    return ALL_TOOLS.filter((tool) => !hiddenToolIds.has(tool.id)).slice(0, MAX_RECENT_TOOLS);
  }, [favorites, recentToolIds]);
  const commandPaletteShortcutLabel = useMemo(
    () => formatShortcutBinding(shortcutBindings["open-command-palette"], platform),
    [platform, shortcutBindings],
  );

  const selectTool = useCallback((tool: ToolDefinition | null) => {
    setShowCommandPalette(false);
    setSearchQuery("");
    toast.dismiss();

    startTransition(() => {
      setSelectedTool(tool);
    });

    if (tool) {
      if (window.innerWidth < 640) setSidebarOpen(false);
      setOpenTools((previous) => previous.some((entry) => entry.id === tool.id) ? previous : [...previous, tool]);
      setRecentToolIds((prev) =>
        [tool.id, ...prev.filter((id) => id !== tool.id)].slice(0, MAX_RECENT_TOOLS)
      );
    }
  }, []);

  const shortcutHandlers = useMemo(
    () => ({
      "open-command-palette": openCommandPalette,
      "go-home": () => selectTool(null),
      "toggle-sidebar": () => setSidebarOpen((previous) => !previous),
      "open-favorite-1": () => {
        const tool = TOOL_BY_ID.get(favorites[0] as ToolId);
        if (tool) {
          selectTool(tool);
        }
      },
      "open-favorite-2": () => {
        const tool = TOOL_BY_ID.get(favorites[1] as ToolId);
        if (tool) {
          selectTool(tool);
        }
      },
      "open-favorite-3": () => {
        const tool = TOOL_BY_ID.get(favorites[2] as ToolId);
        if (tool) {
          selectTool(tool);
        }
      },
      "open-favorite-4": () => {
        const tool = TOOL_BY_ID.get(favorites[3] as ToolId);
        if (tool) {
          selectTool(tool);
        }
      },
      "open-favorite-5": () => {
        const tool = TOOL_BY_ID.get(favorites[4] as ToolId);
        if (tool) {
          selectTool(tool);
        }
      },
    }),
    [favorites, selectTool],
  );

  useKeyboardShortcuts({
    bindings: shortcutBindings,
    handlers: shortcutHandlers,
    enabled: !showCommandPalette && !showShortcutSettings && !showWhatsNew,
  });

  // devtoolsapp:// links from Raycast, Alfred, scripts, or a browser. The ref keeps the
  // listener on the latest handlers without subscribing again on every render.
  const deepLinkHandlerRef = useRef<(url: string) => void>(() => {});
  deepLinkHandlerRef.current = (url: string) => {
    const action = parseDeepLink(url, TOOL_IDS);
    if (!action) return;
    setShowWhatsNew(false);
    setShowShortcutSettings(false);
    if (action.type === "tool") selectTool(TOOL_BY_ID.get(action.toolId as ToolId) ?? null);
    else if (action.type === "search") openCommandPaletteWith(action.query);
    else selectTool(null);
  };
  useEffect(() => desktop?.onDeepLink?.((url) => deepLinkHandlerRef.current(url)), [desktop]);

  // Keep the tool list for launchers (the Raycast extension) in step with this version.
  useEffect(() => {
    if (appVersion) void desktop?.writeToolManifest?.(buildToolManifest(ALL_TOOLS, appVersion));
  }, [desktop, appVersion]);

  // System-wide "Show DevTools" shortcut. Paused while the Shortcuts dialog is open, so recording
  // a new combination cannot trigger the old one.
  const [globalShortcut, setGlobalShortcut] = useState<GlobalShortcut>(() =>
    loadGlobalShortcut(typeof window !== "undefined" ? window.localStorage : undefined, platform),
  );
  const [globalShortcutError, setGlobalShortcutError] = useState<string | null>(null);
  const changeGlobalShortcut = useCallback((next: GlobalShortcut) => {
    setGlobalShortcut(next);
    saveGlobalShortcut(window.localStorage, next);
  }, []);
  useEffect(() => {
    if (!desktop?.setGlobalShortcut) return;
    const accelerator = showShortcutSettings ? null : toAccelerator(globalShortcut, platform);
    let current = true;
    void desktop.setGlobalShortcut(accelerator).then((error) => {
      if (current && !showShortcutSettings) setGlobalShortcutError(error);
    });
    return () => {
      current = false;
    };
  }, [desktop, globalShortcut, platform, showShortcutSettings]);

  const openPaletteRef = useRef(() => {});
  openPaletteRef.current = () => {
    setShowWhatsNew(false);
    openCommandPalette();
  };
  useEffect(() => desktop?.onOpenCommandPalette?.(() => openPaletteRef.current()), [desktop]);

  // Paste outside a text field: suggest the tool that fits the text, then open it with the text
  // filled in. The app only sees what the user pastes; it never reads the clipboard on its own.
  const [pasted, setPasted] = useState<{ text: string; suggestions: PasteSuggestion[] } | null>(null);
  const pasteBlocked = showCommandPalette || showShortcutSettings || showWhatsNew;
  useEffect(() => {
    if (pasteBlocked) return;
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      const suggestions = detectPastedContent(text, TOOL_IDS);
      if (suggestions.length === 0) return;
      event.preventDefault();
      setPasted({ text: text.trim(), suggestions });
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [pasteBlocked]);

  const dismissPasted = useCallback(() => setPasted(null), []);
  const openPastedIn = useCallback((toolId: string) => {
    const tool = TOOL_BY_ID.get(toolId as ToolId);
    const text = pasted?.text ?? "";
    setPasted(null);
    if (!tool) return;
    selectTool(tool);
    // Tools load lazily. Wait for the panel's main input, then fill it the way typing would.
    const started = Date.now();
    const fill = () => {
      const field = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(
        `#panel-${tool.id} textarea:not([readonly]), #panel-${tool.id} input[type="text"]:not([readonly])`,
      );
      if (!field) {
        if (Date.now() - started < 3000) window.setTimeout(fill, 50);
        return;
      }
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, text);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.focus();
    };
    window.setTimeout(fill, 0);
  }, [pasted, selectTool]);

  // Automatic updates: download in the background and install on quit. On by default.
  const [autoUpdate, setAutoUpdate] = useState(() => {
    try {
      return localStorage.getItem(AUTO_UPDATE_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    desktop?.setAutoUpdate?.(autoUpdate);
    try {
      localStorage.setItem(AUTO_UPDATE_STORAGE_KEY, String(autoUpdate));
    } catch {
      // The choice still applies for this session.
    }
  }, [desktop, autoUpdate]);

  // Say once when an update has downloaded, with a way to restart now.
  const announcedUpdateRef = useRef<string | null>(null);
  const installUpdateRef = useRef(() => {});
  installUpdateRef.current = () => void desktop?.installUpdate();
  useEffect(() => {
    if (updateState.status !== "downloaded" || !updateState.version) return;
    if (announcedUpdateRef.current === updateState.version) return;
    announcedUpdateRef.current = updateState.version;
    toast(`DevTools ${updateState.version} is ready`, {
      id: "update-ready",
      description: "It installs when you quit DevTools.",
      duration: 20000,
      action: { label: "Restart now", onClick: () => installUpdateRef.current() },
    });
  }, [updateState.status, updateState.version]);

  const tabStripRef = useRef<HTMLDivElement>(null);
  const [tabsOverflow, setTabsOverflow] = useState(false);
  useEffect(() => {
    const strip = tabStripRef.current;
    if (!strip) return;
    const measure = () => setTabsOverflow(strip.scrollWidth > strip.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [openTools.length]);

  useEffect(() => {
    // Keep the selected tab in view when the strip overflows.
    if (selectedTool) document.getElementById(`tab-${selectedTool.id}`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selectedTool]);

  const closeTool = useCallback((tool: ToolDefinition) => {
    const remaining = openTools.filter((entry) => entry.id !== tool.id);
    setOpenTools(remaining);
    if (selectedTool?.id === tool.id) {
      const index = openTools.findIndex((entry) => entry.id === tool.id);
      const next = remaining[Math.min(index, remaining.length - 1)] ?? null;
      setSelectedTool(next);
      requestAnimationFrame(() => document.getElementById(next ? `tab-${next.id}` : "workspace-home")?.focus());
    }
  }, [openTools, selectedTool]);

  useEffect(() => {
    // Browser previews retain the browser's own tab/window shortcuts.
    if (!desktop || showCommandPalette || showShortcutSettings || showWhatsNew) return;
    const handleWorkspaceKeys = (event: KeyboardEvent) => {
      if (event.altKey || event.defaultPrevented || event.isComposing) return;
      const command = platform === "darwin" ? event.metaKey : event.ctrlKey;
      if (command && !event.shiftKey && event.key.toLowerCase() === "w" && selectedTool) {
        event.preventDefault();
        closeTool(selectedTool);
      } else if (event.ctrlKey && !event.metaKey && event.key === "Tab" && openTools.length) {
        event.preventDefault();
        const index = openTools.findIndex((tool) => tool.id === selectedTool?.id);
        const next = openTools[(index + (event.shiftKey ? -1 : 1) + openTools.length) % openTools.length];
        setSelectedTool(next);
        document.getElementById(`tab-${next.id}`)?.focus();
      }
    };
    window.addEventListener("keydown", handleWorkspaceKeys);
    return () => window.removeEventListener("keydown", handleWorkspaceKeys);
  }, [desktop, platform, selectedTool, openTools, closeTool, showCommandPalette, showShortcutSettings, showWhatsNew]);

  // Theme colors
  const theme = {
    bg: "bg-background", sidebar: "workspace-sidebar", border: "border-border",
    text: "text-foreground", textMuted: "text-muted-foreground", textDim: "text-muted-foreground",
    hover: "hover:bg-accent", active: "bg-accent text-accent-foreground", card: "bg-card",
    input: "bg-background", accent: "#2878df",
  };

  // Tool button component
  const ToolButton = ({ tool, showFavorite = false }: { tool: ToolDefinition; showFavorite?: boolean }) => {
    const isFavorite = favorites.includes(tool.id);
    const isSelected = selectedTool?.id === tool.id;

    return (
      <div className={`sidebar-tool group relative flex items-center rounded-md transition-colors ${
        isSelected ? `${theme.active} ${theme.text}` : `${theme.textDim} ${theme.hover}`
      }`}>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm"
          aria-current={isSelected ? "page" : undefined}
          onClick={() => selectTool(tool)}
        >
          <tool.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 text-left truncate">{tool.name}</span>
        </button>
        {showFavorite && (
          <button
            type="button"
            onClick={() => toggleFavorite(tool.id)}
            className={`sidebar-favorite mr-1.5 rounded p-1 ${isFavorite ? "is-favorite" : ""}`}
            aria-pressed={isFavorite}
            aria-label={`Favorite ${tool.name}`}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star
              aria-hidden="true"
              className={`w-3.5 h-3.5 ${isFavorite ? "fill-warning text-warning" : theme.textDim}`}
            />
          </button>
        )}
      </div>
    );
  };

  const HomeToolCard = ({ tool }: { tool: ToolDefinition }) => (
    <button
      onClick={() => selectTool(tool)}
      className="home-tool-row" aria-label={tool.name} data-tool={tool.id}
    >
      <div
        className="home-tool-icon"
      >
        <tool.icon className="w-4 h-4 text-primary" />
      </div>
      <span className={`font-medium ${theme.text} text-sm`}>
        {tool.name}
      </span>
      <ChevronRight size={14} className="home-tool-arrow" aria-hidden="true" />
    </button>
  );

  return (
    <div data-platform={desktop?.platform} data-sidebar-open={sidebarOpen} className={`workspace h-screen overflow-hidden ${theme.bg} flex`}>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        aria-hidden={!sidebarOpen}
        style={!sidebarOpen ? { visibility: "hidden" } : undefined}
        className={`${
          sidebarOpen ? "w-56 translate-x-0" : "w-0 -translate-x-full sm:translate-x-0"
        } h-full sm:h-screen ${theme.sidebar} ${theme.border} border-r flex flex-col transition-all duration-200 overflow-hidden
        fixed sm:relative inset-y-0 left-0 z-50 sm:z-auto`}
      >
        {/* Logo */}
        <div data-tauri-drag-region className={`sidebar-brand h-14 flex items-center justify-between px-4 ${theme.border} border-b`}>
          <div className="flex items-center">
            <img src="./brand/mark.svg" alt="" aria-hidden="true" className="w-5 h-5" />
            <span className={`ml-2.5 font-semibold ${theme.text}`}>DevTools</span>
          </div>
          <button
            aria-label="Close sidebar"
            className={`sm:hidden p-1 rounded ${theme.hover}`}
            onClick={() => setSidebarOpen(false)}
          >
            <X className={`w-4 h-4 ${theme.textDim}`} />
          </button>
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="space-y-2">
            <div className="relative">
              <Search className={`absolute left-2.5 top-2 w-4 h-4 ${theme.textMuted}`} aria-hidden="true" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape" && searchQuery) { e.preventDefault(); setSearchQuery(""); } }}
                placeholder="Search..."
                aria-label="Filter tools"
                className={`pl-9 pr-14 ${theme.input} ${theme.border} text-sm h-8 ${theme.text} placeholder:${theme.textMuted} rounded-md`}
              />
              <button
                type="button"
                onClick={openCommandPalette}
                className="sidebar-search-kbd"
                aria-label={`Open command palette (${commandPaletteShortcutLabel})`}
                title="Open command palette"
              >
                {commandPaletteShortcutLabel}
              </button>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 min-h-0 py-1 overflow-y-auto">
          {/* Home */}
          <div className="px-2 mb-1">
            <button
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                !selectedTool
                  ? `${theme.active} ${theme.text}`
                  : `${theme.textDim} ${theme.hover}`
              }`}
              id="workspace-home"
              onClick={() => selectTool(null)}
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>
          </div>

          {/* Favorites */}
          {favoriteTools.length > 0 && (
            <div className="px-2 mb-3">
              <div className={`flex items-center justify-between px-2 py-1.5 text-xs font-medium ${theme.textMuted}`}>
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  <span>Favorites</span>
                </div>
                <span className="text-2xs" aria-label={`${favoriteTools.length} of ${MAX_FAVORITES} favorites`}>
                  {favoriteTools.length}/{MAX_FAVORITES}
                </span>
              </div>
              {favoriteTools.map((tool) => (
                <ToolButton key={tool.id} tool={tool} showFavorite />
              ))}
            </div>
          )}

          {/* Categories */}
          {!searchQuery ? (
            CATEGORIES.map((category) => (
              <div key={category.name} className="px-2 mb-1">
                <button
                  type="button"
                  aria-expanded={expandedCategories.includes(category.name)}
                  onClick={() => toggleCategory(category.name)}
                  className={`w-full flex items-center gap-1 px-2 py-1.5 text-xs font-medium ${theme.textMuted} ${theme.hover} rounded-md transition-colors`}
                >
                  {expandedCategories.includes(category.name) ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  {category.name}
                </button>
                {expandedCategories.includes(category.name) && (
                  <div className="mt-0.5">
                    {category.tools.map((tool) => (
                      <ToolButton key={tool.id} tool={tool} showFavorite />
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="px-2">
              {filteredTools.map((tool) => (
                <ToolButton key={tool.id} tool={tool} showFavorite />
              ))}
              {filteredTools.length === 0 && (
                <div className={`px-2 py-3 text-xs ${theme.textMuted}`} role="status">
                  <p>No tools match “{searchQuery.trim()}”.</p>
                  <button type="button" className="sidebar-empty-action" onClick={openCommandPalette}>Search in the command palette</button>
                </div>
              )}
            </div>
          )}
        </nav>

        <div className={`sidebar-footer px-3 py-2.5 ${theme.border} border-t`}>
          <div className="space-y-1">
            <p className={`text-center text-xs ${theme.textMuted}`}>
              {desktop ? `Version ${appVersion ? `v${appVersion}` : "Loading…"}` : "Browser preview"}
            </p>
            {updateStatusLabel && updateState.status !== "unsupported" && (
              <p className={`text-center text-2xs leading-relaxed ${theme.textMuted}`}>{updateStatusLabel}</p>
            )}
            {desktop && updateState.status !== "unsupported" && (
              <label className="sidebar-auto-update" htmlFor="auto-update">
                Update automatically
                <Switch id="auto-update" checked={autoUpdate} onCheckedChange={setAutoUpdate} />
              </label>
            )}
            <div className="sidebar-footer-actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-7 w-auto justify-start rounded-md border px-2.5 text-xs font-medium ${theme.border} ${theme.input} ${theme.textDim} ${theme.hover} hover:${theme.text}`}
                onClick={handleUpdateAction}
                disabled={updateState.status === "checking" || updateState.status === "downloading"}
              >
                <RefreshCw
                  className={`mr-1.5 h-3.5 w-3.5 ${
                    updateState.status === "checking" || updateState.status === "downloading"
                      ? "animate-spin"
                      : ""
                  }`}
                />
                {updateButtonLabel}
              </Button>
              {releaseNotes && (
                <button
                  type="button"
                  onClick={openWhatsNew}
                  className={`inline-flex items-center justify-center gap-1 text-2xs ${theme.textMuted} transition-colors hover:${theme.text}`}
                >
                  <span>What's New</span>
                  {hasUnreadWhatsNew && (
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={openShortcutSettings}
                className={`inline-flex items-center justify-center gap-1 text-2xs ${theme.textMuted} transition-colors hover:${theme.text}`}
              >
                <Command className="h-3.5 w-3.5" />
                <span>Shortcuts</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-0 flex flex-col min-w-0">
        <header data-tauri-drag-region className="workspace-titlebar">
          <button type="button" className="chrome-button" aria-label="Toggle sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}><PanelLeft size={16} /></button>
          <div className="workspace-tabs" role="tablist" aria-label="Open tools" ref={tabStripRef} data-overflow={tabsOverflow || undefined}>
            {openTools.length === 0 && <span className="workspace-tab-placeholder">Workspace</span>}
            {openTools.map((tool) => (
              <div className="workspace-tab-wrap" role="presentation" key={tool.id}>
                <button type="button" role="tab" id={`tab-${tool.id}`} aria-controls={`panel-${tool.id}`} aria-selected={selectedTool?.id === tool.id}
                  tabIndex={selectedTool?.id === tool.id ? 0 : -1}
                  onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); closeTool(tool); } }}
                  className="workspace-tab" onClick={() => selectTool(tool)}
                  onKeyDown={(event) => {
                    const index = openTools.findIndex((entry) => entry.id === tool.id);
                    let next = index;
                    if (event.key === "ArrowRight") next = (index + 1) % openTools.length;
                    else if (event.key === "ArrowLeft") next = (index - 1 + openTools.length) % openTools.length;
                    else if (event.key === "Home") next = 0;
                    else if (event.key === "End") next = openTools.length - 1;
                    else if (event.key === "Delete") { closeTool(tool); return; }
                    else return;
                    event.preventDefault();
                    selectTool(openTools[next]);
                    document.getElementById(`tab-${openTools[next].id}`)?.focus();
                  }}>
                  <tool.icon size={16} aria-hidden="true" /><span>{tool.name}</span>
                </button>
                <button type="button" className="tab-close" tabIndex={-1} aria-label={`Close ${tool.name}`} title="Close tab" onClick={() => closeTool(tool)}><X size={12} aria-hidden="true" /></button>
              </div>
            ))}
          </div>
          <button type="button" className="chrome-button" aria-label="Open a tool" title="Open a tool" onClick={openCommandPalette}><Plus size={17} /></button>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {selectedTool && <button type="button" className="chrome-button" aria-label={favorites.includes(selectedTool.id) ? "Remove from favorites" : "Add to favorites"} onClick={() => toggleFavorite(selectedTool.id)}><Star size={15} className={favorites.includes(selectedTool.id) ? "fill-current text-primary" : ""} /></button>}
            <button type="button" className="chrome-button" onClick={() => setThemePreference(darkMode ? "light" : "dark")} aria-label={darkMode ? "Switch to light appearance" : "Switch to dark appearance"}>
              {darkMode ? <Moon size={16} /> : <Sun size={16} />}<span className="sr-only">{darkMode ? "Dark" : "Light"}</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <div className={`workspace-content ${!selectedTool ? "is-home" : ""}`}>
          {!selectedTool ? (
            <div className="workspace-home max-w-3xl mx-auto">
              {/* Welcome */}
              <div className="mb-6 md:mb-8">
                <h1 className={`text-xl md:text-2xl font-bold ${theme.text} mb-2`}>
                  Your workspace
                </h1>
                <p className={`${theme.textDim} text-sm md:text-base`}>
                  Open a tool, or search with the command palette.
                </p>
              </div>

              <button type="button" className="home-search" onClick={openCommandPalette}>
                <Search size={17} aria-hidden="true" />
                <span>Find a tool…</span>
                <kbd>{commandPaletteShortcutLabel}</kbd>
              </button>
              <p className="home-paste-hint">
                Or paste a JWT, JSON, a URL, a timestamp, or other text here with {platform === "darwin" ? "⌘V" : "Ctrl+V"} to find the right tool.
              </p>
              <div className="home-sections space-y-8">
                {recentTools.length > 0 && (
                  <div>
                    <h2 className={`text-sm font-medium ${theme.textMuted} uppercase tracking-wide mb-3`}>
                      Recently Used
                    </h2>
                    <div className="home-tool-list grid grid-cols-1 sm:grid-cols-2">
                      {recentTools.map((tool) => (
                        <HomeToolCard key={tool.id} tool={tool} />
                      ))}
                    </div>
                  </div>
                )}

                {favoriteTools.length > 0 && (
                  <div>
                    <h2 className={`text-sm font-medium ${theme.textMuted} uppercase tracking-wide mb-3`}>
                      Favorites
                    </h2>
                    <div className="home-tool-list grid grid-cols-1 sm:grid-cols-2">
                      {favoriteTools.map((tool) => (
                        <HomeToolCard key={tool.id} tool={tool} />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h2 className={`text-sm font-medium ${theme.textMuted} uppercase tracking-wide mb-3`}>
                    Quick Access
                  </h2>
                  <div className="home-tool-list grid grid-cols-1 sm:grid-cols-2">
                    {quickAccessTools.map((tool) => (
                      <HomeToolCard key={tool.id} tool={tool} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {openTools.map((tool) => {
            const Component = TOOL_COMPONENTS[tool.id];
            return <section key={tool.id} id={`panel-${tool.id}`} role="tabpanel" aria-labelledby={`tab-${tool.id}`} hidden={selectedTool?.id !== tool.id} className={`tool-panel ${WORKSPACE_TOOL_IDS.has(tool.id) ? "tool-panel-editor" : "tool-panel-form"}`}>

              <Suspense fallback={<div className="p-8 text-muted-foreground">Loading {tool.name}…</div>}><Component /></Suspense>
            </section>;
          })}
        </div>
      </main>

      {pasted && (
        <PasteSuggestions
          suggestions={pasted.suggestions}
          toolName={(toolId) => TOOL_BY_ID.get(toolId as ToolId)?.name ?? toolId}
          onOpen={openPastedIn}
          onDismiss={dismissPasted}
        />
      )}
      <CommandPalette
        open={showCommandPalette}
        tools={[...ALL_TOOLS]}
        favorites={favorites}
        recents={recentToolIds}
        onClose={closeCommandPalette}
        onSelectTool={selectTool}
        initialQuery={paletteQuery}
      />

      <ShortcutSettingsDialog
        open={showShortcutSettings}
        platform={platform}
        bindings={shortcutBindings}
        onClose={closeShortcutSettings}
        onUpdateBinding={updateShortcutBinding}
        onResetDefaults={resetShortcutBindings}
        globalShortcut={desktop?.setGlobalShortcut ? globalShortcut : undefined}
        globalShortcutError={globalShortcutError}
        onChangeGlobalShortcut={changeGlobalShortcut}
      />

      {showWhatsNew && releaseNotes && (
        <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            ref={releaseDialogRef}
            aria-labelledby="whats-new-title"
            className="modal-surface release-dialog w-full max-w-xl"
          >
            <div className="modal-header flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 id="whats-new-title" className={`text-xl font-semibold ${theme.text}`}>
                  {releaseNotes.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeWhatsNew}
                className={`rounded-md p-1 ${theme.hover} ${theme.textDim} transition-colors hover:${theme.text}`}
                aria-label="Close what's new"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className={`modal-body release-body min-h-0 overflow-y-auto px-6 py-4 prose prose-sm prose-neutral max-w-none text-sm dark:prose-invert prose-headings:text-inherit prose-p:text-inherit prose-strong:text-inherit prose-code:text-inherit prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-blockquote:text-muted-foreground [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:tracking-wide [&_h2]:text-foreground [&_p]:my-1 [&_p]:text-sm [&_p]:leading-5 [&_ul]:my-1 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 [&_li]:pl-0.5 [&_li]:text-sm [&_li]:leading-5 [&_li::marker]:text-primary ${theme.textMuted}`}
              dangerouslySetInnerHTML={{ __html: whatsNewHtml }}
            />

            <div className="modal-footer flex justify-end">
              <Button type="button" onClick={closeWhatsNew}>
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevToolsApp;
