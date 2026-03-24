import { useState, useEffect, useMemo } from "react";
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
import { JsonViewer } from "@/components/tools/JsonViewer";
import { Base64Converter } from "@/components/tools/Base64Converter";
import { UUIDGenerator } from "@/components/tools/UuidGenerator";
import { HashGenerator } from "@/components/tools/HashGenerator";
import { TextCompare } from "@/components/tools/TextCompare";
import { CaseConverter } from "@/components/tools/CaseConverter";
import { PasswordGenerator } from "@/components/tools/PasswordGenerator";
import { JwtDecoder } from "@/components/tools/JwtDecoder";
import { UrlEncoder } from "@/components/tools/UrlEncoder";
import { TimestampConverter } from "@/components/tools/TimestampConverter";
import { NumberBaseConverter } from "@/components/tools/NumberBaseConverter";
import { CsvToJsonConverter } from "@/components/tools/CsvToJsonConverter";
import { UnitConverter } from "@/components/tools/UnitConverter";
import { ColorPalette } from "@/components/tools/ColorPalette";
import { JsonToTypeScript } from "@/components/tools/JsonToTypeScript";
import { LoremGenerator } from "@/components/tools/LoremGenerator";
import { QrGenerator as QRGenerator } from "@/components/tools/QrGenerator";
import { CronCalculator } from "@/components/tools/CronCalculator";
import { DateDifference } from "@/components/tools/DateDifference";
import { ApiFormatter } from "@/components/tools/ApiFormatter";
import { CodePlayground } from "@/components/tools/CodePlayground";
import { RegexGenerator } from "@/components/tools/RegexGenerator";
import { ImageConverter } from "@/components/tools/ImageConverter";
import { MarkdownEditor } from "@/components/tools/MarkdownEditor";
import { BcryptGenerator } from "@/components/tools/BcryptGenerator";
import {
  SYSTEM_THEME_QUERY,
  THEME_STORAGE_KEY,
  getStoredThemePreference,
  getSystemDarkMode,
  resolveDarkMode,
  syncDarkClass,
} from "@/utils/theme";

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
];

// Extract unique categories
const CATEGORIES = Array.from(new Set(ALL_TOOLS.map((t) => t.category))).map((name) => ({
  name,
  tools: ALL_TOOLS.filter((t) => t.category === name),
}));

const MAX_FAVORITES = 5;

const STORAGE_KEY = "devtools-favorites";

const DevToolsApp = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [themePreference, setThemePreference] = useState(() =>
    getStoredThemePreference(typeof window !== "undefined" ? window.localStorage : undefined)
  );
  const [systemDarkMode, setSystemDarkMode] = useState(() =>
    getSystemDarkMode(typeof window !== "undefined" ? window.matchMedia.bind(window) : undefined)
  );
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [selectedTool, setSelectedTool] = useState<(typeof ALL_TOOLS)[number] | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const darkMode = resolveDarkMode(themePreference, systemDarkMode);

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
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

  // Save favorites to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch (error) {
      console.error("Failed to save favorites:", error);
    }
  }, [favorites]);

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
    return favorites.map((id) => ALL_TOOLS.find((t) => t.id === id)).filter(Boolean) as (typeof ALL_TOOLS)[number][];
  }, [favorites]);

  // Render tool component based on selected tool
  const renderTool = () => {
    if (!selectedTool) return null;

    switch (selectedTool.id) {
      case "json-viewer":
        return <JsonViewer />;
      case "base64":
        return <Base64Converter />;
      case "uuid-generator":
        return <UUIDGenerator />;
      case "hash-generator":
        return <HashGenerator />;
      case "text-compare":
        return <TextCompare />;
      case "case-converter":
        return <CaseConverter />;
      case "password-generator":
        return <PasswordGenerator />;
      case "jwt-decoder":
        return <JwtDecoder />;
      case "url-encoder":
        return <UrlEncoder />;
      case "timestamp":
        return <TimestampConverter />;
      case "number-base":
        return <NumberBaseConverter />;
      case "csv-json":
        return <CsvToJsonConverter />;
      case "unit-converter":
        return <UnitConverter />;
      case "color-palette":
        return <ColorPalette />;
      case "json-typescript":
        return <JsonToTypeScript />;
      case "lorem-generator":
        return <LoremGenerator />;
      case "qr-generator":
        return <QRGenerator />;
      case "cron-calculator":
        return <CronCalculator />;
      case "date-difference":
        return <DateDifference />;
      case "api-formatter":
        return <ApiFormatter />;
      case "code-playground":
        return <CodePlayground />;
      case "regex-generator":
        return <RegexGenerator />;
      case "image-converter":
        return <ImageConverter />;
      case "markdown":
        return <MarkdownEditor />;
      case "bcrypt-generator":
        return <BcryptGenerator />;
      default:
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
  const ToolButton = ({ tool, showFavorite = false }: { tool: (typeof ALL_TOOLS)[number]; showFavorite?: boolean }) => {
    const isFavorite = favorites.includes(tool.id);
    const isSelected = selectedTool?.id === tool.id;

    return (
      <button
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors group ${
          isSelected
            ? `${theme.active} ${theme.text}`
            : `${theme.textDim} ${theme.hover}`
        }`}
        onClick={() => setSelectedTool(tool)}
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

  return (
    <div className={`min-h-screen ${theme.bg} flex`}>
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
        } ${theme.sidebar} ${theme.border} border-r flex flex-col transition-all duration-200 overflow-hidden
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
        <nav className="flex-1 py-1 overflow-y-auto">
          {/* Home */}
          <div className="px-2 mb-1">
            <button
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                !selectedTool
                  ? `${theme.active} ${theme.text}`
                  : `${theme.textDim} ${theme.hover}`
              }`}
              onClick={() => setSelectedTool(null)}
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
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
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

              {/* Quick Access */}
              <div>
                <h2 className={`text-sm font-medium ${theme.textMuted} uppercase tracking-wide mb-3`}>
                  Quick Access
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ALL_TOOLS.slice(0, 6).map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => setSelectedTool(tool)}
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
                  ))}
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
    </div>
  );
};

export default DevToolsApp;
