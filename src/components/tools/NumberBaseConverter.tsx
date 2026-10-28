import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  byteSwap,
  fixedWidth,
  groupDigits,
  highestSetBit,
  lowestSetBit,
  popcount,
  toBase,
  toggleBit,
  toRoman,
} from "@/utils/number-base";
import { readNumberInput, type ReadResult } from "@/utils/int-expression";

type InputBase = "auto" | 2 | 8 | 10 | 16 | "custom" | "roman";

const INPUT_BASES: { value: InputBase; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: 2, label: "Bin" },
  { value: 8, label: "Oct" },
  { value: 10, label: "Dec" },
  { value: 16, label: "Hex" },
  { value: "custom", label: "Custom" },
  { value: "roman", label: "Roman" },
];

const OUTPUTS: { base: number; label: string; group: number }[] = [
  { base: 2, label: "Binary", group: 4 },
  { base: 8, label: "Octal", group: 3 },
  { base: 10, label: "Decimal", group: 3 },
  { base: 16, label: "Hexadecimal", group: 4 },
];

const WIDTHS = [8, 16, 32, 64] as const;

const BASE_NAMES: Record<number, string> = { 2: "binary", 8: "octal", 10: "decimal", 16: "hexadecimal" };
const PREFIXES: Record<number, string> = { 2: "0b", 8: "0o", 16: "0x" };

function describeSource(parsed: ReadResult): string {
  if ("error" in parsed) return "";
  if (parsed.source === "expression") return "Read as an expression.";
  if (parsed.source === "roman") return "Read as a Roman numeral.";
  return `Read as ${BASE_NAMES[parsed.base] ?? `base ${parsed.base}`}.`;
}

/** Write a value back into the input field in the form the user typed, so a bit toggle keeps the base. */
function formatForInput(value: bigint, inputBase: InputBase, customBase: number | null, parsed: ReadResult): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  if (inputBase === "custom") return customBase ? sign + toBase(abs, customBase) : value.toString();
  if (typeof inputBase === "number") return sign + toBase(abs, inputBase);
  const base = ("base" in parsed && parsed.base) || 10;
  return sign + (PREFIXES[base] ?? "") + toBase(abs, base);
}

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
    q: "Can I type an expression?",
    a: "Yes. Type an integer expression such as 0xff + 0b1010 * 3 or (1 << 12) - 1. The tool supports + - * / % ** and the bitwise operators & | ^ ~ << >> >>>. Operators use JavaScript precedence. Use parentheses to change the order.",
  },
  {
    q: "What are the rules for expressions?",
    a: "The tool uses integers only. Division rounds toward zero, and division by zero is an error. >>> shifts in zeros at the selected bit width. Write (-2) ** 2 or -(2 ** 2), because -2 ** 2 is not clear. Results larger than 4096 bits are an error. In an expression, use underscores as digit separators, not spaces.",
  },
  {
    q: "How do I use the bit grid?",
    a: "Click a bit to set or clear it. The number changes to match. The grid uses the selected width. It also shows the number of set bits, the highest and lowest set bit, and the value with the byte order reversed.",
  },
  {
    q: "How do I convert a Roman numeral?",
    a: "Select Roman as the input base, then type the numeral in upper or lower case. The tool accepts only the standard form, so it rejects IIII, VX, and IC. Roman input needs its own selector because letters such as C, D, and CD are also hex digits. The Roman output shows for values from 1 to 3999.",
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

function BitGrid({ unsigned, bits, onToggle }: { unsigned: bigint; bits: number; onToggle: (bit: number) => void }) {
  const high = highestSetBit(unsigned);
  const low = lowestSetBit(unsigned);
  const swapped = toBase(byteSwap(unsigned, bits), 16).padStart(bits / 4, "0");
  // One group per byte, most significant byte first.
  const bytes = Array.from({ length: bits / 8 }, (_, i) => bits / 8 - 1 - i);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-3 gap-y-2" role="group" aria-label="Bits">
        {bytes.map((byte) => (
          <div key={byte} className="space-y-0.5">
            <div className="flex">
              {Array.from({ length: 8 }, (_, i) => {
                const bit = byte * 8 + 7 - i;
                const set = ((unsigned >> BigInt(bit)) & 1n) === 1n;
                return (
                  <button
                    key={bit}
                    type="button"
                    aria-label={`Bit ${bit}`}
                    aria-pressed={set}
                    title={`Bit ${bit}`}
                    onClick={() => onToggle(bit)}
                    className={`h-7 w-6 border-y border-l font-mono text-xs last:border-r first:rounded-l last:rounded-r ${
                      set ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {set ? 1 : 0}
                  </button>
                );
              })}
            </div>
            <p className="text-center font-mono text-[10px] text-muted-foreground">
              {byte * 8 + 7}:{byte * 8}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground" data-testid="bit-stats">
        Set bits: {popcount(unsigned)}. Highest set bit: {high ?? "none"}. Lowest set bit: {low ?? "none"}.
      </p>
      <ValueRow label="Byte-swapped hex" value={swapped} display={swapped} />
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
      return customBase ? readNumberInput(pendingInput, customBase, width) : null;
    }
    return readNumberInput(pendingInput, inputBase, width);
  }, [pendingInput, inputBase, customBase, width]);

  const value = parsed && !("error" in parsed) ? parsed.value : null;
  const show = (digits: string, size: number) => (grouped && size > 0 ? groupDigits(digits, size) : digits);
  const fixed = value === null ? null : fixedWidth(value, width);
  const roman = value === null ? null : toRoman(value);

  // Read the live input, not the debounced value, so quick clicks do not lose a toggle.
  const flipBit = (bit: number) => {
    const base = inputBase === "custom" ? customBase : inputBase;
    if (base === null) return;
    const current = readNumberInput(input, base, width);
    if ("error" in current) return;
    const next = toggleBit(current.value, bit, width);
    const nextRoman = inputBase === "roman" ? toRoman(next) : null;
    if (inputBase === "roman" && !nextRoman) setInputBase("auto");
    setInput(nextRoman ?? formatForInput(next, inputBase === "roman" ? "auto" : inputBase, customBase, current));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Number Base Converter</CardTitle>
          <CardDescription>Type a number or an expression to see it in every base. Use 0x, 0o, or 0b to set the base.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="number-input">Number</Label>
            <Input
              id="number-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={inputBase === "roman" ? "MCMXCIV" : "255, 0xFF, 0b1010, (1 << 8) - 1"}
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
                {describeSource(parsed)}
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
              {roman ? (
                <ValueRow label="Roman" value={roman} display={roman} />
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Roman</Label>
                  <p className="p-2 text-sm text-muted-foreground" data-testid="value-Roman">
                    No Roman numeral (1 to 3999 only).
                  </p>
                </div>
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
              <CardDescription>
                The number as a fixed-width integer. Negative numbers use two's complement. Click a bit to change it.
              </CardDescription>
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
              <div className="space-y-4">
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
                <BitGrid unsigned={fixed.unsigned} bits={width} onToggle={flipBit} />
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
