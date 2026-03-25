import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import {
  decodeJwt as decodeJwtToken,
  getJwtExpirationDate,
  getJwtIssuedAtDate,
  type DecodedJwt,
} from "@/utils/jwt";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What is a JWT?",
    a: "A JSON Web Token is a compact string with a header, payload, and signature. It is commonly used to carry claims between applications and APIs.",
  },
  {
    q: "Does decoding a JWT prove it is authentic?",
    a: "No. Decoding only reveals the token contents. You still need to verify the signature with the correct secret or public key before trusting it.",
  },
  {
    q: "Are JWTs encrypted by default?",
    a: "No. Most JWTs are only base64url-encoded, so their contents are easy to inspect. Signed tokens protect integrity, not confidentiality.",
  },
  {
    q: "What does this tool actually validate?",
    a: "This tool decodes the token locally and checks whether the `exp` claim is already in the past. It does not verify issuer, audience, signature, or key trust.",
  },
];

export function JwtDecoder() {
  const [input, setInput] = useState("");
  const [decoded, setDecoded] = useState<DecodedJwt | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const decodeJwt = () => {
    const result = decodeJwtToken(input);

    if (result.error) {
      setDecoded(null);
      toast.error(result.error);
      return;
    }

    setDecoded(result);
    toast.success("JWT decoded successfully!");
  };

  const copyToClipboard = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
    toast.success(`${label} copied!`);
  };

  const formatTimestamp = (date: Date | null, rawValue?: number) => {
    if (!date || rawValue === undefined) return "N/A";
    return `${date.toLocaleString()} (${rawValue})`;
  };

  const renderObject = (obj: Record<string, unknown>, title: string) => (
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

  const expirationDate = decoded ? getJwtExpirationDate(decoded) : null;
  const issuedAtDate = decoded ? getJwtIssuedAtDate(decoded) : null;
  const notBeforeDate = decoded?.payload.nbf ? new Date(decoded.payload.nbf * 1000) : null;
  const expirationStatus = decoded?.isExpired
    ? { label: "Expired", className: "bg-red-500" }
    : decoded?.payload.exp
    ? { label: "Not expired", className: "bg-green-500" }
    : { label: "No exp claim", className: "bg-amber-500 text-black" };

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
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-medium">Expiration Status</h3>
              <Badge className={expirationStatus.className}>{expirationStatus.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Token decoded locally. Signature not verified.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verification Notice</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              This tool decodes the token and checks the `exp` claim, but it does not prove the token was signed by a trusted issuer. Verify the signature and claims on the server before relying on it.
            </CardContent>
          </Card>

          {renderObject(decoded.header, "Header")}

          {renderObject(decoded.payload, "Payload")}

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
                onClick={() => copyToClipboard(decoded.signature, "Signature")}
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

          {(decoded.payload.iat || decoded.payload.exp || decoded.payload.nbf) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Timestamp Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Issued At (iat):</span>
                  <span className="font-mono text-right">
                    {formatTimestamp(issuedAtDate, decoded.payload.iat)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Expires At (exp):</span>
                  <span className="font-mono text-right">
                    {formatTimestamp(expirationDate, decoded.payload.exp)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Not Before (nbf):</span>
                  <span className="font-mono text-right">
                    {formatTimestamp(notBeforeDate, decoded.payload.nbf)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
