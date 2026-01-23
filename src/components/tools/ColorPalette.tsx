import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface Color {
  hex: string;
  rgb: string;
  hsl: string;
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
