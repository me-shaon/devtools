import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface ConversionUnit {
  name: string;
  symbol: string;
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
}

const conversions: Record<string, { category: string; units: Record<string, ConversionUnit> }> = {
  length: {
    category: "Length",
    units: {
      meter: { name: "Meter", symbol: "m", toBase: (v) => v, fromBase: (v) => v },
      kilometer: { name: "Kilometer", symbol: "km", toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      centimeter: { name: "Centimeter", symbol: "cm", toBase: (v) => v / 100, fromBase: (v) => v * 100 },
      millimeter: { name: "Millimeter", symbol: "mm", toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      mile: { name: "Mile", symbol: "mi", toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },
      yard: { name: "Yard", symbol: "yd", toBase: (v) => v * 0.9144, fromBase: (v) => v / 0.9144 },
      foot: { name: "Foot", symbol: "ft", toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
      inch: { name: "Inch", symbol: "in", toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
    },
  },
  weight: {
    category: "Weight",
    units: {
      kilogram: { name: "Kilogram", symbol: "kg", toBase: (v) => v, fromBase: (v) => v },
      gram: { name: "Gram", symbol: "g", toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      milligram: { name: "Milligram", symbol: "mg", toBase: (v) => v / 1000000, fromBase: (v) => v * 1000000 },
      pound: { name: "Pound", symbol: "lb", toBase: (v) => v * 0.453592, fromBase: (v) => v / 0.453592 },
      ounce: { name: "Ounce", symbol: "oz", toBase: (v) => v * 0.0283495, fromBase: (v) => v / 0.0283495 },
    },
  },
  temperature: {
    category: "Temperature",
    units: {
      celsius: { name: "Celsius", symbol: "°C", toBase: (v) => v, fromBase: (v) => v },
      fahrenheit: {
        name: "Fahrenheit",
        symbol: "°F",
        toBase: (v) => (v - 32) * 5 / 9,
        fromBase: (v) => v * 9 / 5 + 32,
      },
      kelvin: { name: "Kelvin", symbol: "K", toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
    },
  },
  data: {
    category: "Data",
    units: {
      byte: { name: "Byte", symbol: "B", toBase: (v) => v, fromBase: (v) => v },
      kilobyte: { name: "Kilobyte", symbol: "KB", toBase: (v) => v * 1024, fromBase: (v) => v / 1024 },
      megabyte: { name: "Megabyte", symbol: "MB", toBase: (v) => v * 1024 * 1024, fromBase: (v) => v / (1024 * 1024) },
      gigabyte: { name: "Gigabyte", symbol: "GB", toBase: (v) => v * 1024 * 1024 * 1024, fromBase: (v) => v / (1024 * 1024 * 1024) },
    },
  },
};

export function UnitConverter() {
  const [category, setCategory] = useState<string>("length");
  const [fromUnit, setFromUnit] = useState<string>("meter");
  const [toUnit, setToUnit] = useState<string>("kilometer");
  const [fromValue, setFromValue] = useState<string>("1");
  const [toValue, setToValue] = useState<string>("");

  const currentConversion = conversions[category];

  useEffect(() => {
    const unitKeys = Object.keys(currentConversion.units);
    if (unitKeys.length > 0) {
      const newFrom = unitKeys[0];
      const newTo = unitKeys.length > 1 ? unitKeys[1] : unitKeys[0];

      setFromUnit(newFrom);
      setToUnit(newTo);
    }
  }, [category]);

  useEffect(() => {
    if (!fromValue || isNaN(Number(fromValue))) {
      setToValue("");
      return;
    }

    try {
      const value = parseFloat(fromValue);
      const from = currentConversion.units[fromUnit];
      const to = currentConversion.units[toUnit];

      if (!from || !to) {
        setToValue("");
        return;
      }

      const baseValue = from.toBase(value);
      const result = to.fromBase(baseValue);

      if (Number.isInteger(result)) {
        setToValue(result.toString());
      } else {
        setToValue(result.toFixed(6).replace(/\.?0+$/, ""));
      }
    } catch (err) {
      console.error("Conversion error:", err);
      setToValue("");
    }
  }, [fromValue, fromUnit, toUnit, category]);

  const swapUnits = () => {
    const temp = fromUnit;
    setFromUnit(toUnit);
    setToUnit(temp);
    if (toValue) {
      setFromValue(toValue);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Unit Converter</CardTitle>
          <CardDescription>Convert between different units of measurement</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(conversions).map((conv) => (
                  <SelectItem key={conv.category.toLowerCase()} value={conv.category.toLowerCase()}>
                    {conv.category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-end">
            <div className="space-y-2">
              <Label>From</Label>
              <Select value={fromUnit} onValueChange={setFromUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(currentConversion.units).map(([key, unit]) => (
                    <SelectItem key={key} value={key}>
                      {unit.name} ({unit.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={swapUnits} variant="outline" size="icon">
              <ArrowRight className="h-4 w-4" />
            </Button>

            <div className="space-y-2">
              <Label>To</Label>
              <Select value={toUnit} onValueChange={setToUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(currentConversion.units).map(([key, unit]) => (
                    <SelectItem key={key} value={key}>
                      {unit.name} ({unit.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from-value">Value</Label>
              <Input
                id="from-value"
                type="number"
                value={fromValue}
                onChange={(e) => setFromValue(e.target.value)}
                placeholder="Enter value"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="to-value">Result</Label>
              <Input
                id="to-value"
                value={toValue}
                readOnly
                placeholder="Result"
                className="font-semibold"
              />
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg text-center">
            <p className="text-sm text-muted-foreground">
              {fromValue}{currentConversion.units[fromUnit]?.name && ` ${currentConversion.units[fromUnit].name}`} ={" "}
              {toValue}{currentConversion.units[toUnit]?.name && ` ${currentConversion.units[toUnit].name}`}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}