import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

type Base = 2 | 8 | 10 | 16;

export function NumberBaseConverter() {
  const [value, setValue] = useState("");
  const [fromBase, setFromBase] = useState<Base>(10);
  const [toBase, setToBase] = useState<Base>(16);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);

  const bases: { value: Base; label: string; example: string }[] = [
    { value: 2, label: "Binary (Base 2)", example: "1010" },
    { value: 8, label: "Octal (Base 8)", example: "12" },
    { value: 10, label: "Decimal (Base 10)", example: "10" },
    { value: 16, label: "Hexadecimal (Base 16)", example: "A" },
  ];

  const convert = () => {
    if (!value.trim()) {
      toast.error("Please enter a value to convert");
      return;
    }

    try {
      // Parse the input value based on fromBase
      const decimalValue = parseInt(value, fromBase);

      if (isNaN(decimalValue)) {
        toast.error(`Invalid ${fromBase}-base number`);
        return;
      }

      // Convert to target base
      const converted = decimalValue.toString(toBase).toUpperCase();
      setResult(converted);
      toast.success("Converted successfully!");
    } catch (error) {
      toast.error("Conversion failed");
    }
  };

  const swapBases = () => {
    const temp = fromBase;
    setFromBase(toBase);
    setToBase(temp);
    if (result) {
      setValue(result);
    }
  };

  const copyResult = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Result copied!");
  };

  const getConversionInfo = () => {
    if (!result) return null;
    const decimalValue = parseInt(value, fromBase);
    return {
      decimal: decimalValue.toString(),
      binary: decimalValue.toString(2),
      octal: decimalValue.toString(8),
      hex: decimalValue.toString(16).toUpperCase(),
    };
  };

  const info = getConversionInfo();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Number Base Converter</CardTitle>
          <CardDescription>Convert numbers between different bases</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="from-base">From Base</Label>
              <Select value={fromBase.toString()} onValueChange={(v) => setFromBase(parseInt(v) as Base)}>
                <SelectTrigger id="from-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bases.map((base) => (
                    <SelectItem key={base.value} value={base.value.toString()}>
                      {base.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={swapBases} variant="outline" size="icon" className="mb-0.5">
              ↔
            </Button>

            <div className="space-y-2">
              <Label htmlFor="to-base">To Base</Label>
              <Select value={toBase.toString()} onValueChange={(v) => setToBase(parseInt(v) as Base)}>
                <SelectTrigger id="to-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bases.map((base) => (
                    <SelectItem key={base.value} value={base.value.toString()}>
                      {base.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="input-value">
              Input ({bases.find((b) => b.value === fromBase)?.label})
            </Label>
            <Input
              id="input-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={bases.find((b) => b.value === fromBase)?.example}
              className="font-mono"
            />
          </div>

          <Button onClick={convert} className="w-full" size="lg">
            Convert
          </Button>

          {result && (
            <div className="space-y-2">
              <Label htmlFor="result">
                Result ({bases.find((b) => b.value === toBase)?.label})
              </Label>
              <div className="flex gap-2">
                <Input id="result" value={result} readOnly className="font-mono" />
                <Button onClick={copyResult} variant="outline" size="icon">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {info && (
        <Card>
          <CardHeader>
            <CardTitle>All Bases</CardTitle>
            <CardDescription>Decimal: {info.decimal}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Binary (2)</Label>
                <div className="p-2 bg-muted rounded font-mono text-sm">{info.binary}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Octal (8)</Label>
                <div className="p-2 bg-muted rounded font-mono text-sm">{info.octal}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Hexadecimal (16)</Label>
                <div className="p-2 bg-muted rounded font-mono text-sm">{info.hex}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
