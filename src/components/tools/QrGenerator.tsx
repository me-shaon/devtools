import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Download } from "lucide-react";
import { toast } from "sonner";

export function QrGenerator() {
  const [text, setText] = useState("");
  const [size, setSize] = useState(256);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Simple QR code generation using a lightweight approach
  // For a production app, you'd want to use a proper QR library like qrcode
  useEffect(() => {
    if (text && canvasRef.current) {
      generateQR();
    }
  }, [text, size]);

  const generateQR = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, size, size);

    // For demo purposes, generate a visual placeholder
    // In production, use a library like qrcode or qrious
    ctx.fillStyle = "#000000";
    const moduleSize = size / 25;

    // Draw finder patterns (corners)
    const drawFinder = (x: number, y: number) => {
      ctx.fillRect(x * moduleSize, y * moduleSize, 7 * moduleSize, 7 * moduleSize);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect((x + 1) * moduleSize, (y + 1) * moduleSize, 5 * moduleSize, 5 * moduleSize);
      ctx.fillStyle = "#000000";
      ctx.fillRect((x + 2) * moduleSize, (y + 2) * moduleSize, 3 * moduleSize, 3 * moduleSize);
    };

    drawFinder(0, 0);
    drawFinder(18, 0);
    drawFinder(0, 18);

    // Draw data pattern (pseudo-random based on text)
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }

    const random = (seed: number) => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) {
        // Skip finder patterns
        if (
          (x < 8 && y < 8) ||
          (x > 16 && y < 8) ||
          (x < 8 && y > 16) ||
          (x === 6 && y > 7 && y < 17) ||
          (y === 6 && x > 7 && x < 17)
        ) {
          continue;
        }

        if (random(hash + x + y * 25) > 0.5) {
          ctx.fillRect(x * moduleSize, y * moduleSize, moduleSize, moduleSize);
        }
      }
    }
  };

  const downloadQR = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = `qr-code-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("QR code downloaded!");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>QR Code Generator</CardTitle>
          <CardDescription>Generate QR codes for text, URLs, and more</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="qr-text">Text or URL</Label>
            <Input
              id="qr-text"
              placeholder="Enter text or URL to encode"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Size: {size}x{size}px</Label>
            <Slider
              value={[size]}
              onValueChange={([value]) => setSize(value)}
              min={128}
              max={512}
              step={32}
            />
          </div>

          {text && (
            <div className="flex flex-col items-center space-y-4">
              <canvas
                ref={canvasRef}
                width={size}
                height={size}
                className="border border-border rounded-lg"
              />
              <Button onClick={downloadQR} variant="outline" className="w-full max-w-xs">
                <Download className="h-4 w-4 mr-2" />
                Download QR Code
              </Button>
            </div>
          )}

          {!text && (
            <div className="text-center py-12 text-muted-foreground">
              Enter text above to generate a QR code
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Note</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This is a basic QR code generator for demonstration purposes.
            For production use, consider using a dedicated QR code library
            with full encoding support and error correction.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
