import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import {
  AlignLeft,
  Barcode,
  Binary,
  Calculator,
  Clock,
  Code,
  Database,
  FileCode2,
  FileJson,
  FileText,
  Globe,
  Hash,
  Image as ImageIcon,
  Key,
  KeyRound,
  Lock,
  Palette,
  Quote,
  RefreshCw,
  Ruler,
  Scan,
  Shield,
  Terminal,
  Type,
} from "lucide-react";

const lazyNamed = <T extends Record<string, ComponentType>>(
  loader: () => Promise<T>,
  exportName: keyof T,
) => lazy(() => loader().then((module) => ({ default: module[exportName] })));

export const ALL_TOOLS = [
  { icon: FileJson, name: "JSON Viewer", id: "json-viewer", category: "Development Tools" },
  { icon: Code, name: "Code Playground", id: "code-playground", category: "Development Tools" },
  { icon: Terminal, name: "Regex Generator", id: "regex-generator", category: "Development Tools" },
  { icon: Type, name: "JSON to TypeScript", id: "json-typescript", category: "Development Tools" },
  { icon: FileCode2, name: "PHP Unserializer", id: "php-unserializer", category: "Development Tools" },
  { icon: Hash, name: "Hash Generator", id: "hash-generator", category: "Generators" },
  { icon: Key, name: "UUID Generator", id: "uuid-generator", category: "Generators" },
  { icon: Lock, name: "Password Generator", id: "password-generator", category: "Generators" },
  { icon: Quote, name: "Lorem Ipsum", id: "lorem-generator", category: "Generators" },
  { icon: Barcode, name: "QR Generator", id: "qr-generator", category: "Generators" },
  { icon: KeyRound, name: "Bcrypt Generator", id: "bcrypt-generator", category: "Generators" },
  { icon: RefreshCw, name: "Base64", id: "base64", category: "Converters" },
  { icon: Type, name: "Case Converter", id: "case-converter", category: "Converters" },
  { icon: Binary, name: "Number Base", id: "number-base", category: "Converters" },
  { icon: FileText, name: "Markdown", id: "markdown", category: "Converters" },
  { icon: Globe, name: "URL Encoder", id: "url-encoder", category: "Converters" },
  { icon: Database, name: "CSV to JSON", id: "csv-json", category: "Converters" },
  { icon: Clock, name: "Timestamp", id: "timestamp", category: "Time & Date" },
  { icon: Calculator, name: "Date Difference", id: "date-difference", category: "Time & Date" },
  { icon: Scan, name: "Cron Calculator", id: "cron-calculator", category: "Time & Date" },
  { icon: Palette, name: "Color Palette", id: "color-palette", category: "Media" },
  { icon: ImageIcon, name: "Image Converter", id: "image-converter", category: "Media" },
  { icon: AlignLeft, name: "Text Compare", id: "text-compare", category: "Text Tools" },
  { icon: Shield, name: "JWT Decoder", id: "jwt-decoder", category: "Text Tools" },
  { icon: FileJson, name: "API Formatter", id: "api-formatter", category: "Text Tools" },
  { icon: Ruler, name: "Unit Converter", id: "unit-converter", category: "Utilities" },
] as const;

export type ToolDefinition = (typeof ALL_TOOLS)[number];
export type ToolId = ToolDefinition["id"];

export const CATEGORIES = Array.from(new Set(ALL_TOOLS.map((tool) => tool.category))).map((name) => ({
  name,
  tools: ALL_TOOLS.filter((tool) => tool.category === name),
}));

export const TOOL_BY_ID = new Map<ToolId, ToolDefinition>(ALL_TOOLS.map((tool) => [tool.id, tool]));

export const TOOL_COMPONENTS: Record<ToolId, LazyExoticComponent<ComponentType>> = {
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
  "php-unserializer": lazyNamed(
    () => import("@/components/tools/PhpUnserializer"),
    "PhpUnserializer",
  ),
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
