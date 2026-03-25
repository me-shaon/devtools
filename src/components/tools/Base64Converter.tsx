import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, ArrowLeft, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { encodeText, decodeText } from "@/utils/base64";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Is Base64 encryption?",
    a: "No. Base64 is only an encoding format that turns binary data into plain text characters, and anyone can decode it back without a secret key.",
  },
  {
    q: "When should I use Base64?",
    a: "Use it when a system expects text but you need to safely transport bytes, such as embedding binary data in JSON, HTML, or data URLs. It is a transport format, not a security feature.",
  },
  {
    q: "Why is the Base64 output longer than the original text?",
    a: "Base64 expands data because it represents every 3 bytes of input as 4 text characters. That usually adds about 33% overhead.",
  },
  {
    q: "Can I Base64-encode Unicode text?",
    a: "Yes. This tool encodes text as UTF-8 first, so characters outside plain ASCII are preserved when you decode them later.",
  },
];

export function Base64Converter() {
  const [activeTab, setActiveTab] = useState<"encode" | "decode">("encode");
  const [textToEncode, setTextToEncode] = useState("");
  const [encodedOutput, setEncodedOutput] = useState("");
  const [base64ToDecode, setBase64ToDecode] = useState("");
  const [decodedOutput, setDecodedOutput] = useState("");

  const encodeToBase64 = () => {
    try {
      const encoded = encodeText(textToEncode);
      setEncodedOutput(encoded);
      toast.success("Text encoded to Base64!");
    } catch (err) {
      toast.error((err as Error).message || "Error encoding text");
      setEncodedOutput("");
    }
  };

  const decodeFromBase64 = () => {
    try {
      const decoded = decodeText(base64ToDecode);
      setDecodedOutput(decoded);
      toast.success("Base64 decoded successfully!");
    } catch (err) {
      toast.error((err as Error).message || "Invalid Base64 format or corrupted data");
      setDecodedOutput("");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <div className="space-y-6">
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

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
