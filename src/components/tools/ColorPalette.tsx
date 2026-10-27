import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  getContrastRatio,
  meetsWcagAALarge,
  meetsWcagAANormal,
  meetsWcagAAALarge,
  meetsWcagAAANormal,
  parseColor,
} from "@/utils/color";

interface Color {
  hex: string;
  rgb: string;
  hsl: string;
}

function formatColorValues(input: string) {
  const color = parseColor(input);
  if (!color) return null;
  const { rgb, hsl, hsv } = color;
  return [
    { label: "HEX", value: color.hex.toUpperCase() },
    { label: "RGB", value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
    { label: "HSL", value: `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)` },
    { label: "HSV", value: `hsv(${Math.round(hsv.h)}, ${Math.round(hsv.s)}%, ${Math.round(hsv.v)}%)` },
  ];
}

function copyValue(value: string, label: string) {
  navigator.clipboard.writeText(value);
  toast.success(`${label} copied!`);
}

function ColorConverter() {
  const [input, setInput] = useState("#3b82f6");
  const color = parseColor(input);
  const values = formatColorValues(input);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Color Converter</CardTitle>
        <CardDescription>Enter a color as HEX, RGB, or HSL</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="color-convert-input">Color</Label>
          <Input
            id="color-convert-input"
            placeholder="#3b82f6, rgb(59, 130, 246), hsl(217, 91%, 60%)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="font-mono"
          />
          {input.trim() && !color && (
            <p className="text-xs text-destructive">Not a valid HEX, RGB, or HSL color.</p>
          )}
        </div>
        {color && values && (
          <div className="grid grid-cols-1 md:grid-cols-[6rem,1fr] gap-4">
            <div
              className="h-24 w-full rounded-md border"
              style={{ backgroundColor: color.hex }}
              aria-label="Color preview"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {values.map((item) => (
                <div key={item.label} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{item.label}</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-muted p-2 text-xs">{item.value}</code>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Copy ${item.label}`}
                      onClick={() => copyValue(item.value, item.label)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContrastChecker() {
  const [fg, setFg] = useState("#777777");
  const [bg, setBg] = useState("#ffffff");
  const fgColor = parseColor(fg);
  const bgColor = parseColor(bg);
  const ratio = fgColor && bgColor ? getContrastRatio(fgColor, bgColor) : null;

  const checks =
    fgColor && bgColor
      ? [
          { label: "AA normal text (4.5:1)", pass: meetsWcagAANormal(fgColor, bgColor) },
          { label: "AA large text (3:1)", pass: meetsWcagAALarge(fgColor, bgColor) },
          { label: "AAA normal text (7:1)", pass: meetsWcagAAANormal(fgColor, bgColor) },
          { label: "AAA large text (4.5:1)", pass: meetsWcagAAALarge(fgColor, bgColor) },
        ]
      : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contrast Checker</CardTitle>
        <CardDescription>Check text and background colors against WCAG 2.x</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="contrast-fg">Foreground</Label>
            <Input
              id="contrast-fg"
              value={fg}
              onChange={(e) => setFg(e.target.value)}
              className="font-mono"
            />
            {fg.trim() && !fgColor && <p className="text-xs text-destructive">Invalid color.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="contrast-bg">Background</Label>
            <Input
              id="contrast-bg"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
              className="font-mono"
            />
            {bg.trim() && !bgColor && <p className="text-xs text-destructive">Invalid color.</p>}
          </div>
        </div>
        {ratio !== null && fgColor && bgColor && (
          <div className="space-y-4">
            <div
              className="rounded-md border p-4"
              style={{ backgroundColor: bgColor.hex, color: fgColor.hex }}
              data-testid="contrast-preview"
            >
              <p className="text-2xl font-bold">Large sample text</p>
              <p className="text-sm">Normal sample text for reading.</p>
            </div>
            <div className="text-3xl font-semibold" data-testid="contrast-ratio">
              {(Math.floor(ratio * 100) / 100).toFixed(2)}:1
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {checks.map((check) => (
                <li
                  key={check.label}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <span>{check.label}</span>
                  <span className={check.pass ? "font-medium text-success" : "font-medium text-destructive"}>
                    {check.pass ? "Pass" : "Fail"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ColorPalette() {
  const [hexInput, setHexInput] = useState("");
  const [colors, setColors] = useState<Color[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };

  const rgbToHsl = (r: number, g: number, b: number) => {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  };

  const generatePalette = (baseHex: string) => {
    let hex = baseHex.replace("#", "");

    // Handle 3-character hex codes
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }

    if (!/^([0-9A-Fa-f]{6})$/.test(hex)) {
      toast.error("Invalid hex color");
      return;
    }

    const rgb = hexToRgb("#" + hex);
    if (!rgb) {
      toast.error("Invalid hex color");
      return;
    }

    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    const newColors: Color[] = [];

    // Generate variations
    // Original color
    newColors.push({
      hex: "#" + hex,
      rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    });

    // Lighter shades (increase lightness)
    for (let i = 1; i <= 5; i++) {
      const newL = Math.min(100, hsl.l + i * 10);
      newColors.push({
        hex: hslToHex(hsl.h, hsl.s, newL),
        rgb: hslToRgb(hsl.h, hsl.s, newL),
        hsl: `hsl(${hsl.h}, ${hsl.s}%, ${newL}%)`,
      });
    }

    // Darker shades (decrease lightness)
    for (let i = 1; i <= 5; i++) {
      const newL = Math.max(0, hsl.l - i * 10);
      newColors.push({
        hex: hslToHex(hsl.h, hsl.s, newL),
        rgb: hslToRgb(hsl.h, hsl.s, newL),
        hsl: `hsl(${hsl.h}, ${hsl.s}%, ${newL}%)`,
      });
    }

    setColors(newColors);
    toast.success("Palette generated!");
  };

  const hslToHex = (h: number, s: number, l: number) => {
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0,
      g = 0,
      b = 0;

    if (h >= 0 && h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (h >= 60 && h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (h >= 120 && h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (h >= 180 && h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (h >= 240 && h < 300) {
      r = x;
      g = 0;
      b = c;
    } else if (h >= 300 && h < 360) {
      r = c;
      g = 0;
      b = x;
    }

    const toHex = (n: number) => {
      const hex = Math.round((n + m) * 255).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const hslToRgb = (h: number, s: number, l: number) => {
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0,
      g = 0,
      b = 0;

    if (h >= 0 && h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (h >= 60 && h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (h >= 120 && h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (h >= 180 && h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (h >= 240 && h < 300) {
      r = x;
      g = 0;
      b = c;
    } else if (h >= 300 && h < 360) {
      r = c;
      g = 0;
      b = x;
    }

    const toValue = (n: number) => Math.round((n + m) * 255);

    return `rgb(${toValue(r)}, ${toValue(g)}, ${toValue(b)})`;
  };

  const copyToClipboard = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
    toast.success(`${label} copied!`);
  };

  return (
    <div className="space-y-6">
      <ColorConverter />
      <ContrastChecker />
      <Card>
        <CardHeader>
          <CardTitle>Color Palette Generator</CardTitle>
          <CardDescription>Generate a color palette from a base color</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="#000000 or 000000"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              className="font-mono"
            />
            <Button onClick={() => generatePalette(hexInput)} size="lg">
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {colors.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {colors.map((color, index) => (
            <Card key={index} className="overflow-hidden">
              <div
                className="h-24 w-full"
                style={{ backgroundColor: color.hex }}
              />
              <CardContent className="pt-4 space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">HEX</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(color.hex, "HEX")}
                      className="h-6 px-2"
                    >
                      {copied === `HEX-${index}` ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <code className="text-xs block truncate">{color.hex}</code>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">RGB</Label>
                  <code className="text-xs block truncate">{color.rgb}</code>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">HSL</Label>
                  <code className="text-xs block truncate">{color.hsl}</code>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
