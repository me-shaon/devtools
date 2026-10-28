import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/tools/CopyButton";

export function PasswordGenerator() {
  const [length, setLength] = useState(16);
  const [password, setPassword] = useState("");
  const [options, setOptions] = useState({
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });

  const generatePassword = useCallback(() => {
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

    let chars = "";
    if (options.uppercase) chars += uppercase;
    if (options.lowercase) chars += lowercase;
    if (options.numbers) chars += numbers;
    if (options.symbols) chars += symbols;

    if (!chars) {
      toast.error("Please select at least one character type");
      return;
    }

    let result = "";
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);

    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length];
    }

    setPassword(result);
  }, [length, options]);

  useEffect(() => {
    generatePassword();
  }, [generatePassword]);


  const getStrength = () => {
    let strength = 0;
    if (length >= 12) strength++;
    if (length >= 16) strength++;
    if (options.uppercase && options.lowercase) strength++;
    if (options.numbers) strength++;
    if (options.symbols) strength++;

    if (strength <= 2) return { label: "Weak", color: "text-destructive", bg: "bg-destructive text-destructive-foreground" };
    if (strength <= 3) return { label: "Fair", color: "text-warning", bg: "bg-warning" };
    if (strength <= 4) return { label: "Good", color: "text-info", bg: "bg-info" };
    return { label: "Strong", color: "text-success", bg: "bg-success text-success-foreground" };
  };

  const strength = getStrength();

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <Label>Password Length: {length}</Label>
            <Slider
              value={[length]}
              onValueChange={([value]) => setLength(value)}
              min={4}
              max={64}
              step={1}
              className="w-full"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="uppercase">Uppercase (A-Z)</Label>
              <Switch
                id="uppercase"
                checked={options.uppercase}
                onCheckedChange={(checked) => setOptions({ ...options, uppercase: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="lowercase">Lowercase (a-z)</Label>
              <Switch
                id="lowercase"
                checked={options.lowercase}
                onCheckedChange={(checked) => setOptions({ ...options, lowercase: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="numbers">Numbers (0-9)</Label>
              <Switch
                id="numbers"
                checked={options.numbers}
                onCheckedChange={(checked) => setOptions({ ...options, numbers: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="symbols">Symbols (!@#$...)</Label>
              <Switch
                id="symbols"
                checked={options.symbols}
                onCheckedChange={(checked) => setOptions({ ...options, symbols: checked })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Generated Password</Label>
            <div className="flex gap-2">
              <Input value={password} readOnly className="font-mono" />
              <CopyButton value={password} label="Copy password" iconOnly />
              <button type="button" className="toolbar-text-button" onClick={generatePassword} aria-label="Generate new password" title="Generate new password"><RefreshCw size={14} aria-hidden="true" /></button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Strength</Label>
              <span className={`font-medium ${strength.color}`}>{strength.label}</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${strength.bg} transition-all`}
                style={{
                  width: `${(strength.label === "Weak" ? 25 : strength.label === "Fair" ? 50 : strength.label === "Good" ? 75 : 100)}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
