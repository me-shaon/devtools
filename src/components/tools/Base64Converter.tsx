import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, ArrowLeft, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function Base64Converter() {
  const [activeTab, setActiveTab] = useState<"encode" | "decode">("encode");
  const [textToEncode, setTextToEncode] = useState("");
  const [encodedOutput, setEncodedOutput] = useState("");
  const [base64ToDecode, setBase64ToDecode] = useState("");
  const [decodedOutput, setDecodedOutput] = useState("");

  const encodeToBase64 = () => {
    if (!textToEncode.trim()) {
      toast.error("Please enter text to encode.");
      return;
    }

    try {
      const encoded = btoa(unescape(encodeURIComponent(textToEncode)));
      setEncodedOutput(encoded);
      toast.success("Text encoded to Base64!");
    } catch (err) {
      toast.error("Error encoding text");
      setEncodedOutput("");
    }
  };

  const decodeFromBase64 = () => {
    if (!base64ToDecode.trim()) {
      toast.error("Please enter Base64 to decode.");
      return;
    }

    try {
      const decoded = decodeURIComponent(escape(atob(base64ToDecode.trim())));
      setDecodedOutput(decoded);
      toast.success("Base64 decoded successfully!");
    } catch (err) {
      toast.error("Invalid Base64 format or corrupted data");
      setDecodedOutput("");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "encode" | "decode")} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="encode">Encode</TabsTrigger>
          <TabsTrigger value="decode">Decode</TabsTrigger>
        </TabsList>

        {/* Encode Tab */}
        <TabsContent value="encode" className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Text to Encode</label>
            <textarea
              value={textToEncode}
              onChange={(e) => setTextToEncode(e.target.value)}
              placeholder="Enter text to encode to Base64..."
              className="w-full h-32 p-3 rounded-md border bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex justify-center">
            <Button onClick={encodeToBase64} size="sm" className="gap-2">
              Encode to Base64
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          {encodedOutput && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Encoded Output</label>
                <Button onClick={() => copyToClipboard(encodedOutput)} variant="ghost" size="sm">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              </div>
              <textarea
                value={encodedOutput}
                readOnly
                className="w-full h-32 p-3 rounded-md border bg-muted text-foreground resize-none focus:outline-none"
              />
            </div>
          )}
        </TabsContent>

        {/* Decode Tab */}
        <TabsContent value="decode" className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Base64 to Decode</label>
            <textarea
              value={base64ToDecode}
              onChange={(e) => setBase64ToDecode(e.target.value)}
              placeholder="Enter Base64 string to decode..."
              className="w-full h-32 p-3 rounded-md border bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex justify-center">
            <Button onClick={decodeFromBase64} size="sm" className="gap-2">
              Decode from Base64
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>

          {decodedOutput && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Decoded Output</label>
                <Button onClick={() => copyToClipboard(decodedOutput)} variant="ghost" size="sm">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              </div>
              <textarea
                value={decodedOutput}
                readOnly
                className="w-full h-32 p-3 rounded-md border bg-muted text-foreground resize-none focus:outline-none"
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
