import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface JwtHeader {
  alg?: string;
  typ?: string;
  [key: string]: any;
}

interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: any;
}

interface DecodedJwt {
  header: JwtHeader;
  payload: JwtPayload;
  signature: string;
  isValid: boolean;
}

export function JwtDecoder() {
  const [input, setInput] = useState("");
  const [decoded, setDecoded] = useState<DecodedJwt | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const decodeJwt = () => {
    if (!input.trim()) {
      toast.error("Please enter a JWT token");
      return;
    }

    try {
      const parts = input.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format. Expected 3 parts separated by dots.");
      }

      const [headerB64, payloadB64, signature] = parts;

      // Add padding if needed
      const addPadding = (str: string) => str + "=".repeat((4 - (str.length % 4)) % 4);

      // Decode base64url
      const base64urlDecode = (str: string) => {
        const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
        const padded = addPadding(base64);
        return atob(padded);
      };

      const headerJson = base64urlDecode(headerB64);
      const payloadJson = base64urlDecode(payloadB64);

      const header: JwtHeader = JSON.parse(headerJson);
      const payload: JwtPayload = JSON.parse(payloadJson);

      // Check expiration
      let isValid = true;
      if (payload.exp) {
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
          isValid = false;
        }
      }

      setDecoded({
        header,
        payload,
        signature,
        isValid,
      });

      toast.success("JWT decoded successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to decode JWT");
      setDecoded(null);
    }
  };

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const copyToClipboard = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
    toast.success(`${label} copied!`);
  };

  const renderObject = (obj: Record<string, any>, title: string, color: string) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
          <code>{JSON.stringify(obj, null, 2)}</code>
        </pre>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>JWT Token</CardTitle>
          <CardDescription>Enter a JSON Web Token to decode</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="font-mono"
          />
          <Button onClick={decodeJwt} className="mt-4 w-full" size="lg">
            Decode JWT
          </Button>
        </CardContent>
      </Card>

      {decoded && (
        <>
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-medium">Token Status</h3>
            <Badge className={decoded.isValid ? "bg-green-500" : "bg-red-500"}>
              {decoded.isValid ? "Valid" : "Expired"}
            </Badge>
          </div>

          {renderObject(decoded.header, "Header", "text-blue-500")}

          {renderObject(decoded.payload, "Payload", "text-green-500")}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Signature</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted p-4 rounded-lg">
                <code className="text-sm break-all">{decoded.signature}</code>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(decoded!.signature, "Signature")}
                className="mt-2"
              >
                {copied === "Signature" ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy Signature
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {decoded.payload.iat && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Timestamp Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Issued At (iat):</span>
                  <span className="font-mono">{formatTimestamp(decoded.payload.iat)}</span>
                </div>
                {decoded.payload.exp && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expires At (exp):</span>
                    <span className="font-mono">{formatTimestamp(decoded.payload.exp)}</span>
                  </div>
                )}
                {decoded.payload.nbf && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Not Before (nbf):</span>
                    <span className="font-mono">{formatTimestamp(decoded.payload.nbf)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
