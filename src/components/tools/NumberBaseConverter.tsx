import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { fixedWidth, groupDigits, parseNumber, toBase } from "@/utils/number-base";

type InputBase = "auto" | 2 | 8 | 10 | 16 | "custom";

const INPUT_BASES: { value: InputBase; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: 2, label: "Bin" },
  { value: 8, label: "Oct" },
  { value: 10, label: "Dec" },
  { value: 16, label: "Hex" },
  { value: "custom", label: "Custom" },
];

const OUTPUTS: { base: number; label: string; group: number }[] = [
  { base: 2, label: "Binary", group: 4 },
  { base: 8, label: "Octal", group: 3 },
  { base: 10, label: "Decimal", group: 3 },
  { base: 16, label: "Hexadecimal", group: 4 },
];

const WIDTHS = [8, 16, 32, 64] as const;

const BASE_NAMES: Record<number, string> = { 2: "binary", 8: "octal", 10: "decimal", 16: "hexadecimal" };

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "How does the tool pick the input base?",
    a: "In Auto mode, a 0x prefix means hex, 0o means octal, and 0b means binary. Plain digits are decimal. Digits with the letters A to F are hex. Select a base to override the guess.",
  },
  {
    q: "Can I paste numbers with separators?",
    a: "Yes. The tool ignores underscores and spaces, so 1_000_000 and 1111 0000 both work. A leading minus sign makes the number negative.",
  },
  {
    q: "Are large numbers exact?",
    a: "Yes. The tool uses BigInt, so numbers of any length convert without loss of precision.",
  },
  {
    q: "What does Group digits do?",
    a: "It adds spaces between groups of 4 binary or hex digits and 3 octal or decimal digits. The copy buttons always copy the digits without spaces.",
  },
  {
    q: "What does the fixed width section show?",
    a: "It shows the number as an 8, 16, 32, or 64-bit integer. Negative numbers use two's complement. A large unsigned value also shows its signed meaning, so 0xFFFFFFFF reads as -1 in 32 bits.",
  },
  {
    q: "What is a custom base?",
    a: "A custom base is any base from 2 to 36. Digits above 9 use the letters A to Z. Base 36 is common for short IDs.",
  },
];

function ValueRow({ label, value, display }: { label: string; value: string; display: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-muted p-2 font-mono text-sm" data-testid={`value-${label}`}>
          {display}
        </code>
        <CopyButton value={value} label={`Copy ${label}`} iconOnly />
      </div>
    </div>
  );
}

export function NumberBaseConverter() {
  const [input, setInput] = useState("");
  const [inputBase, setInputBase] = useState<InputBase>("auto");
  const [customText, setCustomText] = useState("36");
  const [grouped, setGrouped] = useState(false);
  const [width, setWidth] = useState<(typeof WIDTHS)[number]>(32);
  const pendingInput = useDebouncedValue(input);

  const customNumber = Number(customText);
  const customBase = Number.isInteger(customNumber) && customNumber >= 2 && customNumber <= 36 ? customNumber : null;

  const parsed = useMemo(() => {
    if (!pendingInput.trim()) return null;
    if (inputBase === "custom") {
      return customBase ? parseNumber(pendingInput, customBase) : null;
    }
    return parseNumber(pendingInput, inputBase);
  }, [pendingInput, inputBase, customBase]);

  const value = parsed?.ok ? parsed.value : null;
  const show = (digits: string, size: number) => (grouped && size > 0 ? groupDigits(digits, size) : digits);
  const fixed = value === null ? null : fixedWidth(value, width);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Number Base Converter</CardTitle>
          <CardDescription>Type a number to see it in every base. Use 0x, 0o, or 0b to set the base.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="number-input">Number</Label>
            <Input
              id="number-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="255, 0xFF, 0o377, 0b11111111"
              className="font-mono"
              spellCheck={false}
              autoComplete="off"
            />
            {parsed && "error" in parsed && (
              <p className="text-xs text-destructive" role="alert">
                {parsed.error}
              </p>
            )}
            {parsed?.ok && (
              <p className="text-xs text-muted-foreground" role="status">
                Read as {BASE_NAMES[parsed.base] ?? `base ${parsed.base}`}.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="layout-switch" role="group" aria-label="Input base">
              {INPUT_BASES.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={inputBase === option.value}
                  onClick={() => setInputBase(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="option-switch" htmlFor="number-group">
              Group digits
              <Switch id="number-group" checked={grouped} onCheckedChange={setGrouped} />
            </label>
            <div className="flex items-center gap-2">
              <Label htmlFor="number-custom-base" className="text-xs">
                Custom base
              </Label>
              <Input
                id="number-custom-base"
                type="number"
                min={2}
                max={36}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                className="h-8 w-20 font-mono"
                aria-invalid={!customBase}
              />
            </div>
          </div>
          {!customBase && (
            <p className="text-xs text-destructive" role="alert">
              Enter a custom base from 2 to 36.
            </p>
          )}

          {value !== null && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {OUTPUTS.map(({ base, label, group }) => {
                const digits = toBase(value, base);
                return <ValueRow key={base} label={label} value={digits} display={show(digits, group)} />;
              })}
              {customBase && (
                <ValueRow
                  label={`Base ${customBase}`}
                  value={toBase(value, customBase)}
                  display={toBase(value, customBase)}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {fixed && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Fixed Width</CardTitle>
              <CardDescription>The number as a fixed-width integer. Negative numbers use two's complement.</CardDescription>
            </div>
            <div className="layout-switch" role="group" aria-label="Integer width">
              {WIDTHS.map((bits) => (
                <button key={bits} type="button" aria-pressed={width === bits} onClick={() => setWidth(bits)}>
                  {bits}-bit
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {fixed.fits ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <ValueRow label="Signed" value={fixed.signed.toString()} display={show(fixed.signed.toString(), 3)} />
                <ValueRow
                  label="Unsigned"
                  value={fixed.unsigned.toString()}
                  display={show(fixed.unsigned.toString(), 3)}
                />
                <ValueRow label={`Hex (${width}-bit)`} value={fixed.hex} display={show(fixed.hex, 4)} />
                <ValueRow label={`Binary (${width}-bit)`} value={fixed.binary} display={show(fixed.binary, 4)} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" role="status">
                The number does not fit in {width} bits.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
