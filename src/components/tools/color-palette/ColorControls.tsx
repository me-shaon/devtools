import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ChannelFieldProps {
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
}

export function ChannelField({ id, label, value, invalid, onChange, onCommit }: ChannelFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit();
          }
        }}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid}
        className="font-mono"
      />
    </div>
  );
}

interface AlphaControlProps {
  value: string;
  invalid: boolean;
  onDraft: (value: string) => void;
  onSlider: (percent: number) => void;
  onCommit: () => void;
}

export function AlphaControl({ value, invalid, onDraft, onSlider, onCommit }: AlphaControlProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="color-alpha">Alpha</Label>
        <output className="text-xs tabular-nums text-muted-foreground">{value}%</output>
      </div>
      <input
        id="color-alpha"
        type="range"
        min={0}
        max={100}
        step={1}
        value={Number(value) || 0}
        onChange={(event) => onSlider(Number(event.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="w-full accent-primary"
        aria-invalid={invalid}
        aria-describedby={invalid ? "color-alpha-error" : undefined}
      />
      <div className="flex items-center gap-2">
        <Label htmlFor="color-alpha-input" className="text-xs">
          Alpha percent
        </Label>
        <Input
          id="color-alpha-input"
          value={value}
          onChange={(event) => onDraft(event.target.value)}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommit();
            }
          }}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={invalid}
          className="h-8 w-20 font-mono"
        />
      </div>
      {invalid && (
        <p id="color-alpha-error" className="text-xs text-destructive" role="alert">
          Use a percentage from 0 to 100.
        </p>
      )}
    </div>
  );
}
