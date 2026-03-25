import {
  Suspense,
  lazy,
  startTransition,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import {
  Code,
  FileJson,
  Terminal,
  Hash,
  Clock,
  RefreshCw,
  Palette,
  Search,
  ChevronRight,
  ChevronDown,
  Home,
  Zap,
  Shield,
  Wifi,
  Star,
  Menu,
  X,
  Moon,
  Sun,
  Key,
  Lock,
  Type,
  AlignLeft,
  FileText,
  Quote,
  Image as ImageIcon,
  Barcode,
  Scan,
  Database,
  Binary,
  Calculator,
  Ruler,
  Globe,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getReleaseNotes } from "@/data/releaseNotes";
import { convertMarkdown } from "@/utils/markdown";
import {
  SYSTEM_THEME_QUERY,
  THEME_STORAGE_KEY,
  getStoredThemePreference,
  getSystemDarkMode,
  resolveDarkMode,
  syncDarkClass,
} from "@/utils/theme";

const lazyNamed = <T extends Record<string, ComponentType>>(
  loader: () => Promise<T>,
  exportName: keyof T,
) => lazy(() => loader().then((module) => ({ default: module[exportName] })));

// All available tools
const ALL_TOOLS = [
  // Development Tools
  { icon: FileJson, name: "JSON Viewer", id: "json-viewer", category: "Development Tools" },
  { icon: Code, name: "Code Playground", id: "code-playground", category: "Development Tools" },
  { icon: Terminal, name: "Regex Generator", id: "regex-generator", category: "Development Tools" },
  { icon: Type, name: "JSON to TypeScript", id: "json-typescript", category: "Development Tools" },

  // Generators
  { icon: Hash, name: "Hash Generator", id: "hash-generator", category: "Generators" },
  { icon: Key, name: "UUID Generator", id: "uuid-generator", category: "Generators" },
  { icon: Lock, name: "Password Generator", id: "password-generator", category: "Generators" },
  { icon: Quote, name: "Lorem Ipsum", id: "lorem-generator", category: "Generators" },
  { icon: Barcode, name: "QR Generator", id: "qr-generator", category: "Generators" },
  { icon: KeyRound, name: "Bcrypt Generator", id: "bcrypt-generator", category: "Generators" },

  // Converters
  { icon: RefreshCw, name: "Base64", id: "base64", category: "Converters" },
  { icon: Type, name: "Case Converter", id: "case-converter", category: "Converters" },
  { icon: Binary, name: "Number Base", id: "number-base", category: "Converters" },
  { icon: FileText, name: "Markdown", id: "markdown", category: "Converters" },
  { icon: Globe, name: "URL Encoder", id: "url-encoder", category: "Converters" },
  { icon: Database, name: "CSV to JSON", id: "csv-json", category: "Converters" },

  // Time & Date
  { icon: Clock, name: "Timestamp", id: "timestamp", category: "Time & Date" },
  { icon: Calculator, name: "Date Difference", id: "date-difference", category: "Time & Date" },
  { icon: Scan, name: "Cron Calculator", id: "cron-calculator", category: "Time & Date" },

  // Media
  { icon: Palette, name: "Color Palette", id: "color-palette", category: "Media" },
  { icon: ImageIcon, name: "Image Converter", id: "image-converter", category: "Media" },

  // Text Tools
  { icon: AlignLeft, name: "Text Compare", id: "text-compare", category: "Text Tools" },
  { icon: Shield, name: "JWT Decoder", id: "jwt-decoder", category: "Text Tools" },
  { icon: FileJson, name: "API Formatter", id: "api-formatter", category: "Text Tools" },

  // Utilities
  { icon: Ruler, name: "Unit Converter", id: "unit-converter", category: "Utilities" },
] as const;

type ToolDefinition = (typeof ALL_TOOLS)[number];
type ToolId = ToolDefinition["id"];
type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error"
  | "unsupported";

interface RendererUpdateState {
  status: UpdateStatus;
  currentVersion?: string;
  version?: string;
  progress?: number;
  message?: string;
}

// Extract unique categories
const CATEGORIES = Array.from(new Set(ALL_TOOLS.map((t) => t.category))).map((name) => ({
  name,
  tools: ALL_TOOLS.filter((t) => t.category === name),
}));
const TOOL_BY_ID = new Map<ToolId, ToolDefinition>(ALL_TOOLS.map((tool) => [tool.id, tool]));

const TOOL_COMPONENTS: Record<ToolId, LazyExoticComponent<ComponentType>> = {
  "json-viewer": lazyNamed(() => import("@/components/tools/JsonViewer"), "JsonViewer"),
  "code-playground": lazyNamed(() => import("@/components/tools/CodePlayground"), "CodePlayground"),
  "regex-generator": lazyNamed(() => import("@/components/tools/RegexGenerator"), "RegexGenerator"),
  "json-typescript": lazyNamed(() => import("@/components/tools/JsonToTypeScript"), "JsonToTypeScript"),
  "hash-generator": lazyNamed(() => import("@/components/tools/HashGenerator"), "HashGenerator"),
  "uuid-generator": lazyNamed(() => import("@/components/tools/UuidGenerator"), "UUIDGenerator"),
  "password-generator": lazyNamed(
    () => import("@/components/tools/PasswordGenerator"),
    "PasswordGenerator",
  ),
  "lorem-generator": lazyNamed(() => import("@/components/tools/LoremGenerator"), "LoremGenerator"),
  "qr-generator": lazyNamed(() => import("@/components/tools/QrGenerator"), "QrGenerator"),
  "bcrypt-generator": lazyNamed(() => import("@/components/tools/BcryptGenerator"), "BcryptGenerator"),
  base64: lazyNamed(() => import("@/components/tools/Base64Converter"), "Base64Converter"),
  "case-converter": lazyNamed(() => import("@/components/tools/CaseConverter"), "CaseConverter"),
  "number-base": lazyNamed(
    () => import("@/components/tools/NumberBaseConverter"),
    "NumberBaseConverter",
  ),
  markdown: lazyNamed(() => import("@/components/tools/MarkdownEditor"), "MarkdownEditor"),
  "url-encoder": lazyNamed(() => import("@/components/tools/UrlEncoder"), "UrlEncoder"),
  "csv-json": lazyNamed(() => import("@/components/tools/CsvToJsonConverter"), "CsvToJsonConverter"),
  timestamp: lazyNamed(
    () => import("@/components/tools/TimestampConverter"),
    "TimestampConverter",
  ),
  "date-difference": lazyNamed(
    () => import("@/components/tools/DateDifference"),
    "DateDifference",
  ),
  "cron-calculator": lazyNamed(
    () => import("@/components/tools/CronCalculator"),
    "CronCalculator",
  ),
  "color-palette": lazyNamed(() => import("@/components/tools/ColorPalette"), "ColorPalette"),
  "image-converter": lazyNamed(() => import("@/components/tools/ImageConverter"), "ImageConverter"),
  "text-compare": lazyNamed(() => import("@/components/tools/TextCompare"), "TextCompare"),
  "jwt-decoder": lazyNamed(() => import("@/components/tools/JwtDecoder"), "JwtDecoder"),
  "api-formatter": lazyNamed(() => import("@/components/tools/ApiFormatter"), "ApiFormatter"),
  "unit-converter": lazyNamed(() => import("@/components/tools/UnitConverter"), "UnitConverter"),
};

const MAX_FAVORITES = 5;
const MAX_RECENT_TOOLS = 6;

const FAVORITES_STORAGE_KEY = "devtools-favorites";
const RECENT_TOOLS_STORAGE_KEY = "devtools-recent-tools";
const WHATS_NEW_SEEN_STORAGE_KEY = "devtools-whats-new-seen-version";

const DevToolsApp = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [themePreference, setThemePreference] = useState(() =>
    getStoredThemePreference(typeof window !== "undefined" ? window.localStorage : undefined)
  );
  const [systemDarkMode, setSystemDarkMode] = useState(() =>
    getSystemDarkMode(typeof window !== "undefined" ? window.matchMedia.bind(window) : undefined)
  );
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentToolIds, setRecentToolIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [appVersion, setAppVersion] = useState<string>("");
  const [updateState, setUpdateState] = useState<RendererUpdateState>({ status: "idle" });
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [seenWhatsNewVersion, setSeenWhatsNewVersion] = useState("");
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
    syncDarkClass(document.documentElement, darkMode);
  }, [darkMode]);

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
    if (typeof window === "undefined" || !window.electronAPI) {
      return undefined;
    }

    let cancelled = false;

    const loadAppMeta = async () => {
      try {
        const [version, currentUpdateState] = await Promise.all([
          window.electronAPI.invoke("app-version"),
          window.electronAPI.invoke("update-status"),
        ]);

        if (!cancelled) {
          setAppVersion(typeof version === "string" ? version : "");
          if (currentUpdateState && typeof currentUpdateState === "object") {
            setUpdateState(currentUpdateState as RendererUpdateState);
          }
        }
      } catch (error) {
        console.error("Failed to load app metadata:", error);
      }
    };

    loadAppMeta();

    const unsubscribe = window.electronAPI.on("update-status", (nextState) => {
      if (!cancelled && nextState && typeof nextState === "object") {
        setUpdateState(nextState as RendererUpdateState);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!releaseNotes) {
      return;
    }

    if (seenWhatsNewVersion !== releaseNotes.version) {
      setShowWhatsNew(true);
    }
  }, [seenWhatsNewVersion, releaseNotes]);

  const handleUpdateAction = async () => {
    if (!window.electronAPI) {
      return;
    }

    try {
      if (updateState.status === "available") {
        await window.electronAPI.invoke("download-update");
        return;
      }

      if (updateState.status === "downloaded") {
        await window.electronAPI.invoke("install-update");
        return;
      }

      await window.electronAPI.invoke("check-for-updates");
    } catch (error) {
      console.error("Failed to run update action:", error);
      toast.error("Unable to complete the update action.");
    }
  };

  const openWhatsNew = () => {
    if (releaseNotes) {
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
        return "You're up to date.";
      case "downloading":
        return updateState.progress
          ? `Downloading update: ${Math.round(updateState.progress)}%`
          : "Downloading update...";
      case "downloaded":
        return updateState.version
          ? `Version ${updateState.version} is ready to install.`
          : "Update is ready to install.";
      case "checking":
        return "Checking for updates...";
      case "error":
        return updateState.message || "Update check failed.";
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
    const query = searchQuery.toLowerCase();
    return ALL_TOOLS.filter(
      (tool) =>
        tool.name.toLowerCase().includes(query) ||
        tool.category.toLowerCase().includes(query)
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

  const selectTool = (tool: ToolDefinition | null) => {
    startTransition(() => {
      setSelectedTool(tool);
    });

    if (tool) {
      setRecentToolIds((prev) =>
        [tool.id, ...prev.filter((id) => id !== tool.id)].slice(0, MAX_RECENT_TOOLS)
      );
    }
  };

  // Render tool component based on selected tool
  const renderTool = () => {
    if (!selectedTool) return null;

    const SelectedToolComponent = TOOL_COMPONENTS[selectedTool.id];

    if (!SelectedToolComponent) {
      return (
        <div className="text-center py-12">
          <Terminal className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">Coming Soon</h3>
          <p className="text-muted-foreground">
            The {selectedTool.name} is currently being implemented.
          </p>
        </div>
      );
    }

    return (
      <Suspense
        fallback={
          <div className="py-12 text-center">
            <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin text-[#EB5757]" />
            <h3 className="text-lg font-medium mb-2">Loading {selectedTool.name}</h3>
            <p className="text-muted-foreground">Preparing the tool interface...</p>
          </div>
        }
      >
        <SelectedToolComponent />
      </Suspense>
    );
  };

  // Theme colors
  const theme = darkMode
    ? {
        bg: "bg-[#191919]",
        sidebar: "bg-[#202020]",
        border: "border-[#2F2F2F]",
        text: "text-[#E8E8E8]",
        textMuted: "text-[#9B9A97]",
        textDim: "text-[#6B6B6B]",
        hover: "hover:bg-[#2F2F2F]",
        active: "bg-[#2F2F2F]",
        card: "bg-[#252525]",
        input: "bg-[#2F2F2F]",
        accent: "#EB5757",
      }
    : {
        bg: "bg-[#FAFAFA]",
        sidebar: "bg-[#F7F6F3]",
        border: "border-[#E8E5E0]",
        text: "text-[#37352F]",
        textMuted: "text-[#9B9A97]",
        textDim: "text-[#6B6B6B]",
        hover: "hover:bg-[#EEEDE9]",
        active: "bg-[#EEEDE9]",
        card: "bg-white",
        input: "bg-white",
        accent: "#EB5757",
      };

  // Tool button component
  const ToolButton = ({ tool, showFavorite = false }: { tool: ToolDefinition; showFavorite?: boolean }) => {
    const isFavorite = favorites.includes(tool.id);
    const isSelected = selectedTool?.id === tool.id;

    return (
      <button
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors group ${
          isSelected
            ? `${theme.active} ${theme.text}`
            : `${theme.textDim} ${theme.hover}`
        }`}
        onClick={() => selectTool(tool)}
      >
        <tool.icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate">{tool.name}</span>
        {showFavorite && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(tool.id);
            }}
            className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity cursor-pointer ${
              isFavorite ? "opacity-100" : ""
            }`}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star
              className={`w-3.5 h-3.5 ${isFavorite ? "fill-yellow-400 text-yellow-400" : theme.textDim}`}
            />
          </span>
        )}
      </button>
    );
  };

  const HomeToolCard = ({ tool }: { tool: ToolDefinition }) => (
    <button
      onClick={() => selectTool(tool)}
      className={`flex items-center gap-3 p-3 md:p-4 ${theme.card} rounded-lg border ${theme.border} text-left hover:border-[#EB5757]/50 transition-all`}
    >
      <div
        className={`w-8 h-8 md:w-9 md:h-9 rounded-md ${
          darkMode ? "bg-[#2F2F2F]" : "bg-[#F7F6F3]"
        } flex items-center justify-center shrink-0`}
      >
        <tool.icon className="w-4 h-4 text-[#EB5757]" />
      </div>
      <span className={`font-medium ${theme.text} text-sm md:text-base`}>
        {tool.name}
      </span>
    </button>
  );

  return (
    <div className={`h-screen overflow-hidden ${theme.bg} flex`}>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-60 translate-x-0" : "w-0 -translate-x-full md:translate-x-0"
        } h-full md:h-screen ${theme.sidebar} ${theme.border} border-r flex flex-col transition-all duration-200 overflow-hidden
        fixed md:relative inset-y-0 left-0 z-50 md:z-auto`}
      >
        {/* Logo */}
        <div className={`h-12 flex items-center justify-between px-4 ${theme.border} border-b`}>
          <div className="flex items-center">
            <img src="./app-icon.png" alt="DevTools" className="w-5 h-5" />
            <span className={`ml-2.5 font-semibold ${theme.text}`}>DevTools</span>
          </div>
          <button
            className={`md:hidden p-1 rounded ${theme.hover}`}
            onClick={() => setSidebarOpen(false)}
          >
            <X className={`w-4 h-4 ${theme.textDim}`} />
          </button>
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className={`absolute left-2.5 top-2 w-4 h-4 ${theme.textMuted}`} />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className={`pl-9 ${theme.input} ${theme.border} text-sm h-8 ${theme.text} placeholder:${theme.textMuted} focus:border-[#EB5757] focus:ring-0 rounded-md`}
            />
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
              onClick={() => selectTool(null)}
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>
          </div>

          {/* Favorites */}
          {favoriteTools.length > 0 && (
            <div className="px-2 mb-3">
              <div className={`flex items-center justify-between px-2 py-1.5 text-xs font-medium ${theme.textMuted} uppercase tracking-wide`}>
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  <span>Favorites</span>
                </div>
                <span className="text-[10px] opacity-60">
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
                  onClick={() => toggleCategory(category.name)}
                  className={`w-full flex items-center gap-1 px-2 py-1.5 text-xs font-medium ${theme.textMuted} uppercase tracking-wide ${theme.hover} rounded-md transition-colors`}
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
            </div>
          )}
        </nav>

        <div className={`px-3 py-2.5 ${theme.border} border-t`}>
          <div className="space-y-1.5">
            <p className={`text-xs ${theme.textMuted}`}>
              Version {appVersion ? `v${appVersion}` : "Loading..."}
            </p>
            {updateStatusLabel && (
              <p className={`text-[11px] leading-relaxed ${theme.textMuted}`}>{updateStatusLabel}</p>
            )}
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
                className={`inline-flex items-center gap-1 text-[11px] ${theme.textMuted} transition-colors hover:${theme.text}`}
              >
                <span>What's New</span>
                {hasUnreadWhatsNew && (
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#EB5757]" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-0 flex flex-col min-w-0">
        {/* Header */}
        <header
          className={`h-12 ${theme.border} border-b flex items-center justify-between px-3 md:px-4 ${theme.card}`}
        >
          <div className="flex items-center gap-2 md:gap-3">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${theme.textDim} ${theme.hover}`}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu className="w-4 h-4" />
            </Button>
            <nav className={`flex items-center text-sm ${theme.textMuted}`}>
              <span className="hidden sm:inline">Home</span>
              {selectedTool && (
                <>
                  <ChevronRight className="w-3 h-3 mx-1 sm:mx-1.5" />
                  <span className={`${theme.text} truncate max-w-[120px] sm:max-w-none`}>
                    {selectedTool.name}
                  </span>
                </>
              )}
            </nav>
          </div>

          {/* Dark Mode Toggle */}
          <button
            onClick={() =>
              setThemePreference(resolveDarkMode(themePreference, systemDarkMode) ? "light" : "dark")
            }
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm ${theme.hover} transition-colors`}
          >
            {darkMode ? (
              <Moon className="w-4 h-4 text-[#EB5757]" />
            ) : (
              <Sun className="w-4 h-4 text-[#F2994A]" />
            )}
            <span className={`${theme.textDim} hidden sm:inline`}>{darkMode ? "Dark" : "Light"}</span>
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto">
          {!selectedTool ? (
            <div className="max-w-3xl mx-auto">
              {/* Welcome */}
              <div className="mb-6 md:mb-8">
                <h1 className={`text-xl md:text-2xl font-bold ${theme.text} mb-2`}>
                  Welcome to DevTools
                </h1>
                <p className={`${theme.textDim} text-sm md:text-base`}>
                  Your essential developer companion. Pick a tool to get started.
                </p>
              </div>

              {/* Feature badges */}
              <div className="flex flex-wrap gap-3 md:gap-6 mb-6 md:mb-8">
                <div className={`flex items-center gap-2 text-xs md:text-sm ${theme.textDim}`}>
                  <Shield className="w-4 h-4 text-[#EB5757]" />
                  <span>100% Private</span>
                </div>
                <div className={`flex items-center gap-2 text-xs md:text-sm ${theme.textDim}`}>
                  <Zap className="w-4 h-4 text-[#F2994A]" />
                  <span>Blazing Fast</span>
                </div>
                <div className={`flex items-center gap-2 text-xs md:text-sm ${theme.textDim}`}>
                  <Wifi className="w-4 h-4 text-[#27AE60]" />
                  <span>Works Offline</span>
                </div>
              </div>

              <div className="space-y-8">
                {recentTools.length > 0 && (
                  <div>
                    <h2 className={`text-sm font-medium ${theme.textMuted} uppercase tracking-wide mb-3`}>
                      Recently Used
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {quickAccessTools.map((tool) => (
                      <HomeToolCard key={tool.id} tool={tool} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Tool View */
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h1 className={`text-xl md:text-2xl font-bold ${theme.text}`}>
                  {selectedTool.name}
                </h1>
                <button
                  onClick={() => toggleFavorite(selectedTool.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    favorites.includes(selectedTool.id)
                      ? "bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20"
                      : `${theme.hover} ${theme.textDim}`
                  }`}
                  title={
                    favorites.includes(selectedTool.id)
                      ? "Remove from favorites"
                      : `Add to favorites (${favorites.length}/${MAX_FAVORITES})`
                  }
                >
                  <Star
                    className={`w-4 h-4 ${favorites.includes(selectedTool.id) ? "fill-current" : ""}`}
                  />
                  <span className="hidden sm:inline">
                    {favorites.includes(selectedTool.id) ? "Favorited" : "Favorite"}
                  </span>
                </button>
              </div>

              <div className={`${theme.card} rounded-lg border ${theme.border} p-4 md:p-5`}>
                {renderTool()}
              </div>
            </div>
          )}
        </div>
      </main>

      {showWhatsNew && releaseNotes && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="whats-new-title"
            className={`w-full max-w-xl rounded-xl border ${theme.border} ${theme.card} p-5 shadow-2xl`}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#EB5757]">
                  What's New
                </p>
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
              className={`max-h-[60vh] overflow-y-auto rounded-lg border ${theme.border} p-4 prose prose-sm prose-neutral max-w-none dark:prose-invert prose-headings:text-inherit prose-p:text-inherit prose-strong:text-inherit prose-code:text-inherit prose-pre:bg-muted prose-blockquote:text-muted-foreground ${theme.textMuted}`}
              dangerouslySetInnerHTML={{ __html: whatsNewHtml }}
            />

            <div className="mt-5 flex justify-end">
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
