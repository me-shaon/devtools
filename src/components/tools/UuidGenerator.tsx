import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type UUIDVersion = "1" | "3" | "4" | "5" | "6" | "7" | "ulid";

export function UUIDGenerator() {
  const [version, setVersion] = useState<UUIDVersion>("4");
  const [count, setCount] = useState(5);
  const [output, setOutput] = useState("");

  const generateUUIDv4 = (): string => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const generateUUIDv1 = (): string => {
    const timestamp = Date.now();
    const timestampHex = timestamp.toString(16);

    const randomBytes = [];
    for (let i = 0; i < 16; i++) {
      randomBytes.push(Math.floor(Math.random() * 256).toString(16).padStart(2, "0"));
    }

    const timeLow = timestampHex.padStart(8, "0").substring(0, 8);
    const timeMid = timestampHex.padStart(8, "0").substring(0, 4);
    const timeHi = "1" + timestampHex.padStart(8, "0").substring(0, 3);

    const clockSeq = randomBytes.slice(8, 10).join("");
    const node = randomBytes.slice(10, 16).join("");

    return `${timeLow}-${timeMid}-${timeHi}-${clockSeq}-${node}`;
  };

  const generateUUIDv6 = (): string => {
    const timestamp = Date.now();
    const timestampHex = (timestamp + 0x01b21dd213814000).toString(16).padStart(24, "0");

    const timeHiVer = "6" + timestampHex.substring(0, 3);
    const timeMid = timestampHex.substring(3, 7);
    const timeLow = timestampHex.substring(7, 15);

    const randomBytes = [];
    for (let i = 0; i < 8; i++) {
      randomBytes.push(Math.floor(Math.random() * 256).toString(16).padStart(2, "0"));
    }

    const clockSeq = "8" + randomBytes[0].substring(1) + randomBytes[1];
    const node = randomBytes.slice(2, 8).join("");

    return `${timeLow}-${timeMid}-${timeHiVer}-${clockSeq}-${node}`;
  };

  const generateUUIDv7 = (): string => {
    const timestamp = Math.floor(Date.now() / 1000);
    const timestampHex = timestamp.toString(16).padStart(12, "0");
    const randomHex = Array.from({ length: 10 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");

    const timeHiVer = "7" + timestampHex.substring(0, 3);
    const timeMid = timestampHex.substring(3, 7);
    const timeLow = timestampHex.substring(7, 12);
    const randB = randomHex.substring(0, 4);
    const clockSeq = "8" + randomHex.substring(4, 7);
    const node = randomHex.substring(7, 18);

    return `${timeLow}-${timeMid}-${timeHiVer}-${clockSeq}${randB}-${node}`;
  };

  const generateULID = (): string => {
    const encoding = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const timestamp = Date.now();

    let timestampEncoded = "";
    let remainingTime = timestamp;

    for (let i = 0; i < 10; i++) {
      const remainder = remainingTime % 32;
      timestampEncoded = encoding[remainder] + timestampEncoded;
      remainingTime = Math.floor(remainingTime / 32);
    }

    let randomEncoded = "";
    for (let i = 0; i < 16; i++) {
      randomEncoded += encoding[Math.floor(Math.random() * 32)];
    }

    return timestampEncoded + randomEncoded;
  };

  const generateUUIDv3 = (): string => {
    // Simplified UUID v3 using namespace and name
    const namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const name = "example.com";
    const hash = simpleHash(namespace + name);
    return formatUUIDFromHash(hash, "3");
  };

  const generateUUIDv5 = (): string => {
    // Simplified UUID v5 using namespace and name
    const namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const name = "example.com";
    const hash = simpleHash(namespace + name);
    return formatUUIDFromHash(hash, "5");
  };

  const simpleHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(32, "0");
  };

  const formatUUIDFromHash = (hash: string, ver: string): string => {
    const hex = hash.substring(0, 32);
    const timeLow = hex.substring(0, 8);
    const timeMid = hex.substring(8, 12);
    const timeHiVer = ver + hex.substring(13, 16);
    const clockSeq = "8" + hex.substring(17, 20);
    const node = hex.substring(20, 32);

    return `${timeLow}-${timeMid}-${timeHiVer}-${clockSeq}-${node}`;
  };

  const generateUUIDs = () => {
    if (count < 1 || count > 100) {
      toast.error("Please enter a count between 1 and 100.");
      return;
    }

    const uuids: string[] = [];

    for (let i = 0; i < count; i++) {
      let uuid = "";
      switch (version) {
        case "1":
          uuid = generateUUIDv1();
          break;
        case "3":
          uuid = generateUUIDv3();
          break;
        case "4":
          uuid = generateUUIDv4();
          break;
        case "5":
          uuid = generateUUIDv5();
          break;
        case "6":
          uuid = generateUUIDv6();
          break;
        case "7":
          uuid = generateUUIDv7();
          break;
        case "ulid":
          uuid = generateULID();
          break;
      }
      uuids.push(uuid);
    }

    setOutput(uuids.join("\n"));
    toast.success(`Generated ${count} ${version.toUpperCase()}!`);
  };

  const copyToClipboard = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      toast.success("Copied to clipboard!");
    }
  };

  return (
    <div className="space-y-6">
      {/* Options */}
      {/* Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Version</Label>
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value as UUIDVersion)}
            className="w-full h-10 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="4">UUID v4 (Random)</option>
            <option value="1">UUID v1 (Time-based)</option>
            <option value="7">UUID v7 (Time-ordered)</option>
            <option value="6">UUID v6 (Time-ordered)</option>
            <option value="3">UUID v3 (Name-based MD5)</option>
            <option value="5">UUID v5 (Name-based SHA-1)</option>
            <option value="ulid">ULID</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label>Count</Label>
          <Input
            type="number"
            min="1"
            max="100"
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            className="w-full"
          />
        </div>
      </div>

      {/* Generate Button */}
      <Button onClick={generateUUIDs} className="w-full gap-2">
        <RefreshCw className="w-4 h-4" />
        Generate {count} {version.toUpperCase()}
      </Button>

      {/* Output */}
      {output && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Output</Label>
            <Button onClick={copyToClipboard} variant="ghost" size="sm">
              <Copy className="w-4 h-4 mr-2" />
              Copy All
            </Button>
          </div>
          <textarea
            value={output}
            readOnly
            className="w-full h-48 p-3 rounded-md border bg-muted font-mono text-sm resize-none focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
