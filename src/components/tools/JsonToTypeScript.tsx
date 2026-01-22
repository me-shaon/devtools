import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface TypeDefinition {
  name: string;
  type: string;
  optional: boolean;
  isArray: boolean;
  children?: Record<string, TypeDefinition>;
}

export function JsonToTypeScript() {
  const [jsonInput, setJsonInput] = useState("");
  const [tsOutput, setTsOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState({
    rootName: "RootObject",
    readonly: false,
    strictNullChecks: true,
  });

  const getType = (value: any): string => {
    if (value === null) return options.strictNullChecks ? "null" : "any";
    if (value === undefined) return "undefined";

    const type = typeof value;
    if (type === "boolean") return "boolean";
    if (type === "number") return "number";
    if (type === "string") return "string";
    if (Array.isArray(value)) return "array";
    if (type === "object") return "object";
    return "any";
  };

  const generateInterface = (obj: any, name: string): string => {
    if (obj === null || typeof obj !== "object") {
      return `export type ${name} = ${getType(obj)};\n`;
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        return `export type ${name} = any[];\n`;
      }

      // Infer array type from first element
      const elementType = generateTypeDefinition(obj[0], "Item");
      return `export type ${name} = ${elementType}[];\n`;
    }

    const lines: string[] = [];
    lines.push(`export interface ${name} {`);

    for (const [key, value] of Object.entries(obj)) {
      const typeDef = generateTypeDefinition(value, key);
      const readonly = options.readonly ? "readonly " : "";
      const optional = typeDef.optional ? "?" : "";

      if (typeDef.children) {
        // Nested object - generate inline interface
        const nestedName = toPascalCase(key);
        const nestedInterface = generateInterface(value, nestedName);
        lines.push(`  ${readonly}${key}${optional}: ${nestedName};`);
      } else {
        lines.push(`  ${readonly}${key}${optional}: ${typeDef.type};`);
      }
    }

    lines.push("}");
    return lines.join("\n");
  };

  const generateTypeDefinition = (value: any, key: string): Omit<TypeDefinition, "name"> => {
    const type = getType(value);

    if (type === "array") {
      if (value.length === 0) {
        return { type: "any[]", optional: false, isArray: true };
      }
      const itemType = generateTypeDefinition(value[0], key);
      return {
        type: `${itemType.type}[]`,
        optional: false,
        isArray: true,
        children: itemType.children,
      };
    }

    if (type === "object") {
      return {
        type: toPascalCase(key),
        optional: false,
        isArray: false,
        children: value,
      };
    }

    return { type, optional: false, isArray: false };
  };

  const toPascalCase = (str: string): string => {
    return str
      .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
      .replace(/^(.)/, (c) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, "");
  };

  const convert = () => {
    if (!jsonInput.trim()) {
      toast.error("Please enter JSON to convert");
      return;
    }

    try {
      const parsed = JSON.parse(jsonInput);
      const result = generateInterface(parsed, options.rootName);
      setTsOutput(result);
      toast.success("Converted to TypeScript!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid JSON");
    }
  };

  const copyOutput = () => {
    navigator.clipboard.writeText(tsOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("TypeScript copied!");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>JSON to TypeScript</CardTitle>
          <CardDescription>Convert JSON to TypeScript interfaces</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="root-name">Root Interface Name</Label>
            <Input
              id="root-name"
              value={options.rootName}
              onChange={(e) => setOptions({ ...options, rootName: e.target.value })}
              placeholder="RootObject"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="readonly">Use readonly properties</Label>
            <Switch
              id="readonly"
              checked={options.readonly}
              onCheckedChange={(checked) => setOptions({ ...options, readonly: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="json-input">JSON Input</Label>
            <Textarea
              id="json-input"
              placeholder='{"name": "John", "age": 30}'
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="min-h-[150px] font-mono"
            />
          </div>

          <Button onClick={convert} className="w-full" size="lg">
            Convert to TypeScript
          </Button>

          {tsOutput && (
            <>
              <div className="space-y-2">
                <Label htmlFor="ts-output">TypeScript Output</Label>
                <Textarea
                  id="ts-output"
                  value={tsOutput}
                  readOnly
                  className="min-h-[200px] font-mono text-sm"
                />
              </div>
              <Button onClick={copyOutput} variant="outline" className="w-full">
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy TypeScript
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
