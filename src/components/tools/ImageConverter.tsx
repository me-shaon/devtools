import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Upload, Download, ImageIcon as ImageIconLucide } from "lucide-react";
import { toast } from "sonner";

type Format = "png" | "jpeg" | "webp";

export function ImageConverter() {
  const [image, setImage] = useState<string | null>(null);
  const [originalFormat, setOriginalFormat] = useState<string>("");
  const [format, setFormat] = useState<Format>("png");
  const [quality, setQuality] = useState([90]);
  const [originalSize, setOriginalSize] = useState(0);
  const [convertedSize, setConvertedSize] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (image && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const mimeType = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
        const dataUrl = canvas.toDataURL(mimeType, quality[0] / 100);

        setConvertedSize(Math.round((dataUrl.length - "data:".length) * 3 / 4));
      };
      img.src = image;
    }
  }, [image, format, quality]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    setOriginalFormat(file.type);
    setOriginalSize(file.size);

    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const downloadImage = () => {
    if (!canvasRef.current) return;

    const mimeType = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `converted-image.${format}`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      toast.success("Image downloaded!");
    }, mimeType, quality[0] / 100);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Image Converter</CardTitle>
          <CardDescription>Convert images between PNG, JPEG, and WebP formats</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
              variant="outline"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Image
            </Button>
          </div>

          {image && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Original Image</Label>
                  <div className="p-4 bg-muted rounded-lg">
                    <img src={image} alt="Original" className="max-w-full h-auto mx-auto" />
                    <div className="text-center text-sm text-muted-foreground mt-2">
                      {originalFormat} • {formatSize(originalSize)}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="p-4 bg-muted rounded-lg">
                    <canvas ref={canvasRef} className="max-w-full h-auto mx-auto hidden" />
                    <img src={image} alt="Preview" className="max-w-full h-auto mx-auto" />
                    <div className="text-center text-sm text-muted-foreground mt-2">
                      {format.toUpperCase()} • {formatSize(convertedSize)}
                      {convertedSize < originalSize && (
                        <span className="text-green-500 ml-2">
                          ({Math.round((1 - convertedSize / originalSize) * 100)}% smaller)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Output Format</Label>
                  <Select value={format} onValueChange={(v: any) => setFormat(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="png">PNG (Lossless)</SelectItem>
                      <SelectItem value="jpeg">JPEG (Lossy)</SelectItem>
                      <SelectItem value="webp">WebP (Modern)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(format === "jpeg" || format === "webp") && (
                  <div className="space-y-2">
                    <Label>Quality: {quality[0]}%</Label>
                    <Slider
                      value={quality}
                      onValueChange={setQuality}
                      min={1}
                      max={100}
                      step={1}
                    />
                  </div>
                )}

                <Button onClick={downloadImage} className="w-full" size="lg">
                  <Download className="h-4 w-4 mr-2" />
                  Download Converted Image
                </Button>
              </div>
            </>
          )}

          {!image && (
            <div className="text-center py-12 text-muted-foreground">
              <ImageIconLucide className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Upload an image to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Format Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="font-medium">PNG</dt>
              <dd className="text-muted-foreground">Lossless compression, best for graphics with transparent backgrounds</dd>
            </div>
            <div>
              <dt className="font-medium">JPEG</dt>
              <dd className="text-muted-foreground">Lossy compression, best for photos and complex images</dd>
            </div>
            <div>
              <dt className="font-medium">WebP</dt>
              <dd className="text-muted-foreground">Modern format with excellent compression and quality</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
