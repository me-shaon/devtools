import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Lock, ShieldCheck, ShieldX, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import {
  hashBcrypt,
  verifyBcrypt,
  isValidBcryptHash,
  extractRoundsFromHash,
  BCRYPT_MIN_ROUNDS,
  BCRYPT_MAX_ROUNDS,
  BCRYPT_DEFAULT_ROUNDS,
} from "@/utils/bcrypt";

// Moved outside component — pure function, no need to recreate on every render
const getRoundLabel = (r: number) => {
  if (r <= 6) return { label: "Very Fast (less secure)", color: "text-red-500" };
  if (r <= 9) return { label: "Fast", color: "text-yellow-500" };
  if (r <= 12) return { label: "Balanced (recommended)", color: "text-green-500" };
  return { label: "Slow (high security)", color: "text-blue-500" };
};

// Moved outside component — static data, no need to recreate on every render
const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What is bcrypt?",
    a: "Bcrypt is a password hashing function designed to be computationally intensive. It's commonly used for securely storing passwords in databases.",
  },
  {
    q: "How many rounds should I use?",
    a: "12 rounds is the recommended minimum for production use. More rounds increase security but also processing time. Choose based on your security requirements.",
  },
  {
    q: "Is this tool secure?",
    a: "All processing happens in your browser using the bcryptjs library. No data is sent to any servers or stored anywhere.",
  },
  {
    q: "Can I use this in production?",
    a: "This tool is primarily for testing and learning. For production use, implement bcrypt directly in your application using a trusted library.",
  },
];

export function BcryptGenerator() {
  const [activeTab, setActiveTab] = useState<"hash" | "verify">("hash");

  // Hash tab state
  const [plainText, setPlainText] = useState("");
  const [rounds, setRounds] = useState(BCRYPT_DEFAULT_ROUNDS);
  const [hashOutput, setHashOutput] = useState("");
  const [hashing, setHashing] = useState(false);

  // Verify tab state
  const [verifyPlainText, setVerifyPlainText] = useState("");
  const [verifyHash, setVerifyHash] = useState("");
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [detectedRounds, setDetectedRounds] = useState<number | null>(null);

  const handleHash = async () => {
    setHashing(true);
    setHashOutput("");
    try {
      const result = await hashBcrypt(plainText, rounds);
      setHashOutput(result);
      toast.success("Bcrypt hash generated!");
    } catch (err) {
      toast.error((err as Error).message || "Failed to generate hash.");
    } finally {
      setHashing(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const detected = extractRoundsFromHash(verifyHash);
      setDetectedRounds(detected);
      const match = await verifyBcrypt(verifyPlainText, verifyHash);
      setVerifyResult(match);
    } catch (err) {
      toast.error((err as Error).message || "Verification failed.");
      setVerifyResult(null);
    } finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const roundInfo = getRoundLabel(rounds);

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "hash" | "verify")} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="hash">
            <Lock className="w-4 h-4 mr-2" />
            Hash Password
          </TabsTrigger>
          <TabsTrigger value="verify">
            <ShieldCheck className="w-4 h-4 mr-2" />
            Verify Hash
          </TabsTrigger>
        </TabsList>

        {/* Hash Tab */}
        <TabsContent value="hash" className="space-y-5 mt-5">
          {/* Plain text input */}
          <div className="space-y-2">
            <Label>Plain Text / Password</Label>
            <Input
              type="password"
              value={plainText}
              onChange={(e) => setPlainText(e.target.value)}
              placeholder="Enter password or text to hash..."
              onKeyDown={(e) => e.key === "Enter" && !hashing && handleHash()}
            />
          </div>

          {/* Rounds selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Salt Rounds (Cost Factor): {rounds}</Label>
              <span className={`text-xs font-medium ${roundInfo.color}`}>{roundInfo.label}</span>
            </div>
            <input
              type="range"
              min={BCRYPT_MIN_ROUNDS}
              max={BCRYPT_MAX_ROUNDS}
              value={rounds}
              onChange={(e) => setRounds(parseInt(e.target.value, 10))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{BCRYPT_MIN_ROUNDS} (fastest)</span>
              <span>{BCRYPT_MAX_ROUNDS} (slowest)</span>
            </div>
          </div>

          {/* Info box */}
          <div className="text-xs text-muted-foreground bg-muted rounded-md p-3 leading-relaxed">
            Each additional round doubles the computation time. Round 12 (~250ms) is recommended for most
            applications. Rounds above 14 may take many seconds.
          </div>

          {/* Hash button */}
          <Button onClick={handleHash} disabled={hashing || !plainText} className="w-full gap-2">
            {hashing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Hashing (round {rounds})…
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Generate Bcrypt Hash
              </>
            )}
          </Button>

          {/* Output */}
          {hashOutput && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Bcrypt Hash</Label>
                <Button onClick={() => copyToClipboard(hashOutput)} variant="ghost" size="sm">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              </div>
              <textarea
                value={hashOutput}
                readOnly
                className="w-full h-20 p-3 rounded-md border bg-muted font-mono text-sm resize-none focus:outline-none"
              />
            </div>
          )}
        </TabsContent>

        {/* Verify Tab */}
        <TabsContent value="verify" className="space-y-5 mt-5">
          {/* Plain text */}
          <div className="space-y-2">
            <Label>Plain Text / Password</Label>
            <Input
              type="password"
              value={verifyPlainText}
              onChange={(e) => { setVerifyPlainText(e.target.value); setVerifyResult(null); }}
              placeholder="Enter the original plain text..."
            />
          </div>

          {/* Bcrypt hash */}
          <div className="space-y-2">
            <Label>Bcrypt Hash</Label>
            <textarea
              value={verifyHash}
              onChange={(e) => { setVerifyHash(e.target.value.trim()); setVerifyResult(null); setDetectedRounds(null); }}
              placeholder="Paste the bcrypt hash here (e.g. $2b$12$…)"
              className="w-full h-20 p-3 rounded-md border bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
            />
            {verifyHash && !isValidBcryptHash(verifyHash) && (
              <p className="text-xs text-red-500">
                This doesn't look like a valid bcrypt hash. It should start with $2a$, $2b$, or $2y$ and be 60 characters long.
              </p>
            )}
          </div>

          {/* Verify button */}
          <Button
            onClick={handleVerify}
            disabled={verifying || !verifyPlainText || !verifyHash}
            className="w-full gap-2"
          >
            {verifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying…
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                Verify Hash
              </>
            )}
          </Button>

          {/* Verification result */}
          {verifyResult !== null && (
            <div
              className={`flex items-center gap-3 p-4 rounded-md border ${
                verifyResult
                  ? "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400"
                  : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
              }`}
            >
              {verifyResult ? (
                <ShieldCheck className="w-6 h-6 shrink-0" />
              ) : (
                <ShieldX className="w-6 h-6 shrink-0" />
              )}
              <div>
                <p className="font-semibold text-sm">
                  {verifyResult ? "✓ Match — the hash matches the plain text." : "✗ No Match — the hash does not match the plain text."}
                </p>
                {detectedRounds !== null && (
                  <p className="text-xs mt-0.5 opacity-75">
                    Hash cost factor: {detectedRounds} rounds
                  </p>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
