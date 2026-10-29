import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  CONFUSION_THRESHOLD,
  CVD_TYPES,
  compositeOver,
  cvdLabel,
  findConfusablePairs,
  formatColor,
  generateShadePalette,
  getContrastRatio,
  meetsWcagAALarge,
  meetsWcagAANormal,
  meetsWcagAAALarge,
  meetsWcagAAANormal,
  parseColor,
  parseColorList,
  simulateCvd,
  simulateCvdPixels,
  type Color as ParsedColor,
  type CvdType,
} from "@/utils/color";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which color formats can I enter?",
    a: "Enter any sRGB CSS color: HEX with 3, 4, 6, or 8 digits, rgb(), rgba(), hsl(), hsla(), hwb(), oklch(), oklab(), a named color such as tomato, or transparent. Both the comma syntax and the space syntax work.",
  },
  {
    q: "Why does the tool show OKLCH?",
    a: "OKLCH is a modern CSS color format. Equal changes in lightness look equal to the eye, so it is good for design tokens and color scales. Colors outside sRGB are clipped to the nearest sRGB color.",
  },
  {
    q: "Why is there no CMYK?",
    a: "CMYK depends on the printer, the ink, and the paper. A simple formula gives numbers that do not match real print output, so the tool does not show them.",
  },
  {
    q: "How does the tool handle alpha?",
    a: "HEX, RGB, HSL, HWB, and OKLCH include the alpha value when the color is not opaque. HSV has no standard alpha syntax, so it shows only the color.",
  },
  {
    q: "How does the contrast checker handle transparent colors?",
    a: "The checker blends a transparent foreground over the background, as a browser does. It treats the background as opaque.",
  },
  {
    q: "How does the color blindness simulator work?",
    a: "It uses the model of Machado, Oliveira, and Fernandes (2009, IEEE TVCG). The tool converts each sRGB color to linear RGB, applies the matrix for the type and severity, and converts the result back to sRGB. Achromatopsia keeps only the luminance of each color.",
  },
  {
    q: "What does the severity slider change?",
    a: "At 100%, the tool shows protanopia, deuteranopia, and tritanopia, where one cone type is missing. Lower values show protanomaly, deuteranomaly, and tritanomaly, where the cone type is weak. Most color blind people have a mild anomaly, often deuteranomaly.",
  },
  {
    q: "When does the tool say that two colors look alike?",
    a: "The tool measures the distance between the simulated colors in OKLAB, a perceptual color space, and multiplies it by 100. A ΔE of about 2 is the smallest difference most people notice side by side. Below 6, colors are hard to tell apart in small marks such as chart lines, legend dots, and status icons.",
  },
  {
    q: "Why does the contrast stay almost the same for achromatopsia?",
    a: "WCAG contrast uses only luminance, and achromatopsia keeps the luminance of each color. Protanopia makes reds darker, so red text can lose contrast. Do not use color as the only signal. Add text, icons, or patterns.",
  },
  {
    q: "Does the simulated image leave my device?",
    a: "No. The tool draws the image on a canvas and changes the pixels locally. Large images are scaled to at most 1600 pixels on the longest side.",
  },
];

/** A checkerboard under the color, so transparency is visible. */
const swatchStyle = (css: string) => ({
  background: `linear-gradient(${css}, ${css}), repeating-conic-gradient(#d4d4d4 0 25%, #ffffff 0 50%) 0 0 / 16px 16px`,
});

function ColorConverter({ input, setInput }: { input: string; setInput: (value: string) => void }) {
  const color = parseColor(input);
  const values = color ? formatColor(color) : null;
  // Wait until typing stops before the error shows, so a half-typed color does not flash an error.
  const settledInput = useDebouncedValue(input, 400);
  const showError = settledInput === input && input.trim() !== "" && !color;
  const cssValue = values?.find((v) => v.label === "RGB")?.value ?? "transparent";

  const pick = (hex: string) => {
    // The native picker has no alpha channel. Keep a translucent color's alpha,
    // but not a fully transparent one, where the picked color would stay invisible.
    const alphaByte = color ? Math.round(color.alpha * 255) : 0;
    const alpha = alphaByte > 0 && alphaByte < 255 ? alphaByte.toString(16).padStart(2, "0") : "";
    setInput(hex + alpha);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Color Converter</CardTitle>
        <CardDescription>Enter or paste any CSS color, or pick one</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="color-convert-input">Color</Label>
          <div className="flex gap-2">
            <Input
              id="color-convert-input"
              placeholder="#3b82f6, rgb(59 130 246 / 50%), oklch(62% 0.19 260), tomato"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="font-mono"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={input.trim() !== "" && !color}
              aria-describedby={showError ? "color-convert-error" : undefined}
            />
            <input
              type="color"
              aria-label="Pick a color"
              value={color ? color.hex : "#000000"}
              onChange={(e) => pick(e.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
            />
          </div>
          {showError && (
            <p id="color-convert-error" className="text-xs text-destructive" role="alert">
              Not a valid CSS color.
            </p>
          )}
        </div>
        {color && values && (
          <div className="grid grid-cols-1 md:grid-cols-[6rem,1fr] gap-4">
            <div
              className="h-24 w-full rounded-md border"
              style={swatchStyle(cssValue)}
              role="img"
              aria-label="Color preview"
              data-testid="color-preview"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {values.map((item) => (
                <div key={item.label} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{item.label}</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-muted p-2 text-xs">{item.value}</code>
                    <CopyButton value={item.value} label={`Copy ${item.label}`} iconOnly />
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

/** Parse the contrast pair as the checker paints it. */
function resolveContrastPair(fg: string, bg: string) {
  const fgInput = parseColor(fg);
  const bgInput = parseColor(bg);
  // The page behind is unknown, so the background counts as opaque. A transparent foreground is blended over it.
  const bgColor = bgInput && bgInput.alpha < 1 ? parseColor(bgInput.hex) : bgInput;
  const fgColor = fgInput && bgColor && fgInput.alpha < 1 ? compositeOver(fgInput, bgColor) : fgInput;
  return { fgInput, bgInput, fgColor, bgColor };
}

/** Round down, so 4.499 never shows as a passing 4.50. */
const formatRatio = (ratio: number) => `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;

function ContrastChecker({
  fg,
  setFg,
  bg,
  setBg,
}: {
  fg: string;
  setFg: (value: string) => void;
  bg: string;
  setBg: (value: string) => void;
}) {
  const { fgInput, bgInput, fgColor, bgColor } = resolveContrastPair(fg, bg);
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
              aria-invalid={fg.trim() !== "" && !fgColor}
              aria-describedby={fg.trim() && !fgColor ? "contrast-fg-error" : undefined}
            />
            {fg.trim() && !fgColor && (
              <p id="contrast-fg-error" className="text-xs text-destructive" role="alert">
                Invalid color.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="contrast-bg">Background</Label>
            <Input
              id="contrast-bg"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
              className="font-mono"
              aria-invalid={bg.trim() !== "" && !bgColor}
              aria-describedby={bg.trim() && !bgColor ? "contrast-bg-error" : undefined}
            />
            {bg.trim() && !bgColor && (
              <p id="contrast-bg-error" className="text-xs text-destructive" role="alert">
                Invalid color.
              </p>
            )}
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
            {((fgInput?.alpha ?? 1) < 1 || (bgInput?.alpha ?? 1) < 1) && (
              <p className="text-xs text-muted-foreground" role="status">
                The check blends the foreground over the background and treats the background as opaque.
              </p>
            )}
            <div className="text-3xl font-semibold" data-testid="contrast-ratio">
              {formatRatio(ratio)}
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

const cssOf = (color: ParsedColor) =>
  color.alpha < 1 ? `rgba(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b}, ${color.alpha})` : color.hex;

/** "Normal vision" plus every CVD type, so each table has a reference row. */
type Vision = CvdType | "normal";
const VISIONS: Vision[] = ["normal", ...CVD_TYPES];
const visionLabel = (vision: Vision, severity: number) =>
  vision === "normal" ? "Normal vision" : cvdLabel(vision, severity);
const simulate = (color: ParsedColor, vision: Vision, severity: number) =>
  vision === "normal" ? color : simulateCvd(color, vision, severity);

/** Default list: typical error, success, info, and warning colors. Red and green collide for deutans. */
const DEFAULT_COMPARE = "#d32f2f, #388e3c, #1976d2, #f9a825";

function ColorVision({
  color,
  fg,
  bg,
  compareText,
  setCompareText,
}: {
  color: ParsedColor | null;
  fg: string;
  bg: string;
  compareText: string;
  setCompareText: (value: string) => void;
}) {
  const [severityPercent, setSeverityPercent] = useState(100);
  const severity = severityPercent / 100;
  const { fgColor, bgColor } = resolveContrastPair(fg, bg);
  const debouncedCompare = useDebouncedValue(compareText, 200);
  const list = parseColorList(debouncedCompare);
  const listColors = list.colors.map((item) => item.color);
  const conflicts = VISIONS.map((vision) => ({
    vision,
    pairs: findConfusablePairs(listColors.map((c) => simulate(c, vision, severity))),
  })).filter((entry) => entry.pairs.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Color Blindness Simulator</CardTitle>
        <CardDescription>
          See the colors above as people with a color vision deficiency see them
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="cvd-severity">
            Severity: {severityPercent}%{severityPercent === 100 ? " (full)" : ""}
          </Label>
          <input
            id="cvd-severity"
            type="range"
            min={10}
            max={100}
            step={10}
            value={severityPercent}
            onChange={(e) => setSeverityPercent(parseInt(e.target.value, 10))}
            className="w-full accent-primary"
          />
          <p className="text-xs text-muted-foreground">
            100% shows the full forms (protanopia, deuteranopia, tritanopia). Lower values show the milder
            anomaly forms. Achromatopsia is always full.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Simulated colors">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Vision</th>
                <th className="py-2 pr-3 font-medium">Color</th>
                <th className="py-2 pr-3 font-medium">Text on background</th>
                <th className="py-2 font-medium">Contrast</th>
              </tr>
            </thead>
            <tbody>
              {VISIONS.map((vision) => {
                const label = visionLabel(vision, severity);
                const sim = color ? simulate(color, vision, severity) : null;
                const simFg = fgColor && bgColor ? simulate(fgColor, vision, severity) : null;
                const simBg = fgColor && bgColor ? simulate(bgColor, vision, severity) : null;
                const ratio = simFg && simBg ? getContrastRatio(simFg, simBg) : null;
                return (
                  <tr key={vision} className="border-t" data-testid={`cvd-row-${vision}`}>
                    <th scope="row" className="py-2 pr-3 text-left font-medium">
                      {label}
                    </th>
                    <td className="py-2 pr-3">
                      {sim ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="h-6 w-10 shrink-0 rounded border"
                            style={swatchStyle(cssOf(sim))}
                            aria-hidden="true"
                          />
                          <code className="text-xs">{sim.hex}</code>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No color</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {simFg && simBg ? (
                        <div
                          className="rounded border px-2 py-1"
                          style={{ backgroundColor: simBg.hex, color: simFg.hex }}
                        >
                          Sample text
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No pair</span>
                      )}
                    </td>
                    <td className="py-2 whitespace-nowrap" data-testid={`cvd-contrast-${vision}`}>
                      {ratio !== null ? (
                        <>
                          <span className="font-mono">{formatRatio(ratio)}</span>{" "}
                          <span className={ratio >= 4.5 ? "text-success" : "text-destructive"}>
                            {ratio >= 4.5 ? "AA" : "Fails AA"}
                          </span>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Color comes from the converter. Text and background come from the contrast checker.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="cvd-compare">Colors to compare</Label>
            <Textarea
              id="cvd-compare"
              value={compareText}
              onChange={(e) => setCompareText(e.target.value)}
              className="min-h-[60px] font-mono text-xs"
              spellCheck={false}
              placeholder={DEFAULT_COMPARE}
            />
            <p className="text-xs text-muted-foreground">
              Enter chart, status, or brand colors. Separate them with commas, spaces, or new lines. A generated palette
              fills this list.
            </p>
            {list.invalid.length > 0 && (
              <p className="text-xs text-destructive" role="alert">
                Not a valid CSS color: {list.invalid.join(", ")}
              </p>
            )}
          </div>
          {listColors.length > 0 && (
            <div className="space-y-2" data-testid="cvd-palette">
              {VISIONS.map((vision) => (
                <div key={vision} className="grid grid-cols-[8.5rem,1fr] items-center gap-2">
                  <span className="text-xs">{visionLabel(vision, severity)}</span>
                  <div className="flex flex-wrap gap-1">
                    {listColors.map((c, index) => {
                      const sim = simulate(c, vision, severity);
                      return (
                        <span
                          key={index}
                          className="h-7 w-10 rounded border"
                          style={swatchStyle(cssOf(sim))}
                          title={`${list.colors[index].input} looks like ${sim.hex}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {listColors.length > 1 &&
            (conflicts.length > 0 ? (
              <div role="alert" aria-label="Hard to tell apart">
                <ul className="space-y-1 text-xs text-destructive">
                  {conflicts.flatMap(({ vision, pairs }) =>
                    pairs.map((pair) => (
                      <li key={`${vision}-${pair.a}-${pair.b}`}>
                        {visionLabel(vision, severity)}: {list.colors[pair.a].input} and {list.colors[pair.b].input}{" "}
                        look alike (ΔE {pair.distance.toFixed(1)})
                      </li>
                    )),
                  )}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-success" role="status">
                Every pair stays distinct for every vision type (ΔE {CONFUSION_THRESHOLD} or more).
              </p>
            ))}
        </div>

        <CvdImage severity={severity} />
      </CardContent>
    </Card>
  );
}

/** Images are scaled down so that the longest side is at most this many pixels. */
const MAX_IMAGE_SIDE = 1600;
/** Pixels per chunk. The transform yields to the browser between chunks. */
const CHUNK_PIXELS = 200_000;

function CvdImage({ severity }: { severity: number }) {
  const [source, setSource] = useState<{ url: string; name: string } | null>(null);
  const [type, setType] = useState<CvdType>("deutan");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixelsRef = useRef<ImageData | null>(null);
  const [pixelsVersion, setPixelsVersion] = useState(0);

  useEffect(() => () => {
    if (source) URL.revokeObjectURL(source.url);
  }, [source]);

  // Load the image once into an offscreen copy of its pixels.
  useEffect(() => {
    pixelsRef.current = null;
    if (!source) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("This system cannot draw the image.");
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      pixelsRef.current = ctx.getImageData(0, 0, width, height);
      setPixelsVersion((v) => v + 1);
    };
    img.onerror = () => !cancelled && setError("Cannot read this image.");
    img.src = source.url;
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Transform a copy of the pixels in chunks, so a large image does not freeze the UI.
  useEffect(() => {
    const original = pixelsRef.current;
    const canvas = canvasRef.current;
    if (!original || !canvas) return;
    let cancelled = false;
    const data = new Uint8ClampedArray(original.data);
    const total = data.length / 4;
    let start = 0;
    setBusy(true);
    const step = () => {
      if (cancelled) return;
      const end = Math.min(total, start + CHUNK_PIXELS);
      simulateCvdPixels(data, type, severity, start, end);
      start = end;
      if (start < total) {
        setTimeout(step, 0);
        return;
      }
      canvas.width = original.width;
      canvas.height = original.height;
      canvas.getContext("2d")?.putImageData(new ImageData(data, original.width, original.height), 0, 0);
      setBusy(false);
    };
    step();
    return () => {
      cancelled = true;
    };
  }, [pixelsVersion, type, severity]);

  const open = (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Drop an image file, such as a PNG or JPEG.");
      return;
    }
    setError("");
    setSource({ url: URL.createObjectURL(file), name: file.name });
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    open(event.dataTransfer.files[0]);
  };

  return (
    <div
      className={`space-y-3 rounded-md border border-dashed p-3 ${dragging ? "bg-accent" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      data-testid="cvd-image"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            open(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button type="button" className="toolbar-text-button" onClick={() => fileInputRef.current?.click()}>
          <FileUp size={14} aria-hidden="true" />
          Open image
        </button>
        <Label htmlFor="cvd-image-type" className="text-xs">
          Simulate
        </Label>
        <select
          id="cvd-image-type"
          value={type}
          onChange={(e) => setType(e.target.value as CvdType)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {CVD_TYPES.map((t) => (
            <option key={t} value={t}>
              {cvdLabel(t, severity)}
            </option>
          ))}
        </select>
        {source && (
          <button type="button" className="toolbar-text-button" onClick={() => {
              setSource(null);
              setBusy(false);
            }}
          >
            Clear
          </button>
        )}
        {busy && <span className="text-xs text-muted-foreground">Simulating…</span>}
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {source ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <figure className="space-y-1">
            <img src={source.url} alt={`Original ${source.name}`} className="max-h-80 w-full rounded object-contain" />
            <figcaption className="text-xs text-muted-foreground">Normal vision</figcaption>
          </figure>
          <figure className="space-y-1">
            <canvas
              ref={canvasRef}
              className="max-h-80 w-full rounded object-contain"
              aria-label={`${source.name} as seen with ${cvdLabel(type, severity)}`}
            />
            <figcaption className="text-xs text-muted-foreground">{cvdLabel(type, severity)}</figcaption>
          </figure>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Drop a screenshot, chart, or design here to see it with a color vision deficiency. The image stays on this
          device.
        </p>
      )}
    </div>
  );
}

export function ColorPalette() {
  const [colorInput, setColorInput] = useState("#3b82f6");
  const [fg, setFg] = useState("#777777");
  const [bg, setBg] = useState("#ffffff");
  const [compareText, setCompareText] = useState(DEFAULT_COMPARE);
  const [hexInput, setHexInput] = useState("");
  const [colors, setColors] = useState<ParsedColor[]>([]);

  const generatePalette = (baseHex: string) => {
    const palette = generateShadePalette(baseHex);
    if (!palette) {
      toast.error("Enter a 3- or 6-digit hex color, such as #3b82f6.");
      return;
    }
    setColors(palette);
    setCompareText(palette.map((color) => color.hex).join(", "));
  };

  return (
    <div className="space-y-6">
      <ColorConverter input={colorInput} setInput={setColorInput} />
      <ContrastChecker fg={fg} setFg={setFg} bg={bg} setBg={setBg} />
      <Card>
        <CardHeader>
          <CardTitle>Color Palette Generator</CardTitle>
          <CardDescription>Generate a color palette from a base color</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="palette-base-input">Base color</Label>
          <div className="flex gap-2">
            <Input
              id="palette-base-input"
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
          {colors.map((color) => (
            <Card key={color.hex} className="overflow-hidden">
              <div
                className="h-24 w-full"
                style={{ backgroundColor: color.hex }}
              />
              <CardContent className="pt-4 space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">HEX</Label>
                    <CopyButton value={color.hex} label={`Copy ${color.hex}`} iconOnly />
                  </div>
                  <code className="text-xs block truncate">{color.hex}</code>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">RGB</Label>
                  <code className="text-xs block truncate">
                    {`rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})`}
                  </code>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">HSL</Label>
                  <code className="text-xs block truncate">
                    {`hsl(${Math.round(color.hsl.h)}, ${Math.round(color.hsl.s)}%, ${Math.round(color.hsl.l)}%)`}
                  </code>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ColorVision
        color={parseColor(colorInput)}
        fg={fg}
        bg={bg}
        compareText={compareText}
        setCompareText={setCompareText}
      />
      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
