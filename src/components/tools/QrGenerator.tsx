import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { saveFile } from "@/lib/desktop";
import { getQrMatrix } from "@/utils/qr";

const QUIET_ZONE_MODULES = 4;

export function QrGenerator() {
  const [text, setText] = useState("");
  const [size, setSize] = useState(256);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [error, setError] = useState("");

  useEffect(() => {
    if (text && canvasRef.current) {
      drawQR(canvasRef.current);
    }
  }, [text, size]);

  const drawQR = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let matrix: boolean[][];
    try {
      matrix = getQrMatrix(text);
      setError("");
    } catch {
      setError("This text is too long for a QR code.");
      return;
    }

    // Keep the 4-module quiet zone that scanners need around the code.
    const moduleSize = size / (matrix.length + QUIET_ZONE_MODULES * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    matrix.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) {
          ctx.fillRect(
            (x + QUIET_ZONE_MODULES) * moduleSize,
            (y + QUIET_ZONE_MODULES) * moduleSize,
            Math.ceil(moduleSize),
            Math.ceil(moduleSize),
          );
        }
      }),
    );
  };

  const downloadQR = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(async (blob) => {
      if (!blob) {
        toast.error("Unable to create the QR code image.");
        return;
      }

      try {
        if (await saveFile(blob, `qr-code-${Date.now()}.png`)) {
          toast.success("QR code downloaded!");
        }
      } catch (error) {
        console.error("Failed to save QR code:", error);
        toast.error("Unable to save the QR code.");
      }
    }, "image/png");
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
              {error && <p className="text-sm text-destructive">{error}</p>}
              <canvas
                ref={canvasRef}
                width={size}
                height={size}
                hidden={Boolean(error)}
                className="border border-border rounded-lg"
              />
              <Button onClick={downloadQR} disabled={Boolean(error)} variant="outline" className="w-full max-w-xs">
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
            Codes use error correction level M, which recovers about 15% of a damaged code.
            Everything is generated on this device.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
