import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  ImageIcon as ImageIconLucide,
  Images,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildOutputFilename,
  formatSavingsLabel,
  formatFileSize,
  getEffectiveOutputFormat,
  getFormatLabel,
  getMimeTypeFromFormat,
  getSavingsPercent,
  isSupportedImageType,
  shouldShowQualityControl,
  SUPPORTED_IMAGE_TYPES,
  type CompressionTarget,
  type ImageFormat,
} from "@/utils/image";

interface ProcessedImage {
  blob: Blob;
  format: ImageFormat;
  width: number;
  height: number;
}

interface SingleCompressionResult extends ProcessedImage {
  previewUrl: string;
}

interface BulkCompressionResult {
  id: string;
  name: string;
  originalSize: number;
  status: "pending" | "processing" | "done" | "error";
  compressedSize?: number;
  savingsPercent?: number;
  format?: ImageFormat;
  blob?: Blob;
  error?: string;
}

const ACCEPTED_IMAGE_TYPES = SUPPORTED_IMAGE_TYPES.join(",");

function getFileId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function getProcessingErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to process this image.";
}

function getUniqueFileName(fileName: string, usedNames: Map<string, number>): string {
  const currentCount = usedNames.get(fileName) ?? 0;
  usedNames.set(fileName, currentCount + 1);

  if (currentCount === 0) {
    return fileName;
  }

  const extensionIndex = fileName.lastIndexOf(".");
  const baseName = extensionIndex === -1 ? fileName : fileName.slice(0, extensionIndex);
  const extension = extensionIndex === -1 ? "" : fileName.slice(extensionIndex);

  return `${baseName}-${currentCount + 1}${extension}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Couldn't load ${file.name}.`));
    };

    image.src = objectUrl;
  });
}

async function compressImage(
  file: File,
  target: CompressionTarget,
  quality: number,
): Promise<ProcessedImage> {
  const outputFormat = getEffectiveOutputFormat(file.type, target);

  if (!outputFormat) {
    throw new Error("This image format is not supported yet.");
  }

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser could not prepare the image canvas.");
  }

  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  if (outputFormat === "jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(image, 0, 0);

  const mimeType = getMimeTypeFromFormat(outputFormat);
  const blob = await new Promise<Blob | null>((resolve) => {
    context.canvas.toBlob(
      resolve,
      mimeType,
      shouldShowQualityControl(file.type, target) ? quality / 100 : undefined,
    );
  });

  if (!blob) {
    throw new Error(`Couldn't compress ${file.name}.`);
  }

  return {
    blob,
    format: outputFormat,
    width: canvas.width,
    height: canvas.height,
  };
}

function StatsCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-base font-semibold leading-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ImageConverter() {
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [singleTarget, setSingleTarget] = useState<CompressionTarget>("original");
  const [singleQuality, setSingleQuality] = useState([82]);
  const [singleOriginalPreviewUrl, setSingleOriginalPreviewUrl] = useState<string | null>(null);
  const [singleResult, setSingleResult] = useState<SingleCompressionResult | null>(null);
  const [singleProcessing, setSingleProcessing] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);

  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkTarget, setBulkTarget] = useState<CompressionTarget>("original");
  const [bulkQuality, setBulkQuality] = useState([82]);
  const [bulkResults, setBulkResults] = useState<BulkCompressionResult[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkCompletedCount, setBulkCompletedCount] = useState(0);
  const singleInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!singleFile) {
      setSingleOriginalPreviewUrl(null);
      return undefined;
    }

    const previewUrl = URL.createObjectURL(singleFile);
    setSingleOriginalPreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [singleFile]);

  useEffect(() => {
    let cancelled = false;
    let previewUrl: string | null = null;

    if (!singleFile) {
      setSingleResult(null);
      setSingleError(null);
      setSingleProcessing(false);
      return undefined;
    }

    setSingleProcessing(true);
    setSingleError(null);
    setSingleResult(null);

    compressImage(singleFile, singleTarget, singleQuality[0])
      .then((result) => {
        if (cancelled) {
          return;
        }

        previewUrl = URL.createObjectURL(result.blob);
        setSingleResult({ ...result, previewUrl });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setSingleError(getProcessingErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setSingleProcessing(false);
        }
      });

    return () => {
      cancelled = true;

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [singleFile, singleQuality, singleTarget]);

  useEffect(() => {
    let cancelled = false;

    if (bulkFiles.length === 0) {
      setBulkResults([]);
      setBulkCompletedCount(0);
      setBulkProcessing(false);
      return undefined;
    }

    const initialResults = bulkFiles.map((file) => ({
      id: getFileId(file),
      name: file.name,
      originalSize: file.size,
      status: "pending" as const,
    }));

    setBulkResults(initialResults);
    setBulkCompletedCount(0);
    setBulkProcessing(true);

    const processFiles = async () => {
      const nextResults = [...initialResults];

      for (const [index, file] of bulkFiles.entries()) {
        if (cancelled) {
          return;
        }

        nextResults[index] = {
          ...nextResults[index],
          status: "processing",
        };
        setBulkResults([...nextResults]);

        try {
          const result = await compressImage(file, bulkTarget, bulkQuality[0]);

          if (cancelled) {
            return;
          }

          nextResults[index] = {
            ...nextResults[index],
            status: "done",
            blob: result.blob,
            compressedSize: result.blob.size,
            savingsPercent: getSavingsPercent(file.size, result.blob.size),
            format: result.format,
          };
        } catch (error) {
          if (cancelled) {
            return;
          }

          nextResults[index] = {
            ...nextResults[index],
            status: "error",
            error: getProcessingErrorMessage(error),
          };
        }

        setBulkCompletedCount(index + 1);
        setBulkResults([...nextResults]);
      }

      if (!cancelled) {
        setBulkProcessing(false);
      }
    };

    void processFiles();

    return () => {
      cancelled = true;
    };
  }, [bulkFiles, bulkQuality, bulkTarget]);

  const handleSingleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!isSupportedImageType(file.type)) {
      toast.error("Please choose a JPG, PNG, or WebP image.");
      return;
    }

    setSingleFile(file);
  };

  const handleBulkUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    const supportedFiles = files.filter((file) => isSupportedImageType(file.type));

    if (supportedFiles.length === 0) {
      toast.error("Please choose JPG, PNG, or WebP images.");
      return;
    }

    if (supportedFiles.length !== files.length) {
      toast.error("Unsupported files were skipped. Use JPG, PNG, or WebP images.");
    }

    setBulkFiles(supportedFiles);
  };

  const handleSingleDownload = () => {
    if (!singleFile || !singleResult) {
      return;
    }

    downloadBlob(singleResult.blob, buildOutputFilename(singleFile.name, singleResult.format));
    toast.success("Compressed image downloaded.");
  };

  const handleBulkDownload = async () => {
    const completedResults = bulkResults.filter(
      (result): result is BulkCompressionResult & { blob: Blob; format: ImageFormat } =>
        result.status === "done" && Boolean(result.blob) && Boolean(result.format),
    );

    if (completedResults.length === 0) {
      return;
    }

    const usedNames = new Map<string, number>();
    const zipEntries = Object.fromEntries(
      await Promise.all(
        completedResults.map(async (result) => {
          const outputName = getUniqueFileName(
            buildOutputFilename(result.name, result.format),
            usedNames,
          );

          return [outputName, new Uint8Array(await result.blob.arrayBuffer())];
        }),
      ),
    );

    const zipBlob = new Blob([zipSync(zipEntries, { level: 6 })], {
      type: "application/zip",
    });

    downloadBlob(zipBlob, "compressed-images.zip");
    toast.success("ZIP download is ready.");
  };

  const bulkHasQualityControl = bulkFiles.some((file) =>
    shouldShowQualityControl(file.type, bulkTarget),
  );
  const completedBulkResults = bulkResults.filter((result) => result.status === "done");
  const totalBulkOriginalSize = completedBulkResults.reduce((sum, result) => sum + result.originalSize, 0);
  const totalBulkCompressedSize = completedBulkResults.reduce(
    (sum, result) => sum + (result.compressedSize ?? 0),
    0,
  );
  const totalBulkSavings =
    completedBulkResults.length > 0
      ? getSavingsPercent(totalBulkOriginalSize, totalBulkCompressedSize)
      : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Image Converter & Compressor</CardTitle>
          <CardDescription>
            Compress a single image or process a batch locally with optional WebP output.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs defaultValue="single" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="single">Single Image</TabsTrigger>
              <TabsTrigger value="bulk">Bulk Compress</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="space-y-6">
              <input
                ref={singleInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                onChange={handleSingleUpload}
                className="hidden"
              />

              <Button
                onClick={() => singleInputRef.current?.click()}
                className="w-full"
                variant="outline"
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Image
              </Button>

              {!singleFile ? (
                <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
                  <ImageIconLucide className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>Choose a JPG, PNG, or WebP image to compress locally.</p>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px] lg:items-start">
                    <div className="space-y-2">
                      <Label>Original</Label>
                      <div className="rounded-lg bg-muted p-3">
                        {singleOriginalPreviewUrl ? (
                          <img
                            src={singleOriginalPreviewUrl}
                            alt="Original"
                            className="mx-auto max-h-64 w-auto max-w-full rounded-md"
                          />
                        ) : null}
                        <div className="mt-2 text-center text-sm text-muted-foreground">
                          {singleFile.name} • {formatFileSize(singleFile.size)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Compressed Preview</Label>
                      <div className="rounded-lg bg-muted p-3">
                        {singleProcessing ? (
                          <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
                            <LoaderCircle className="h-8 w-8 animate-spin" />
                            <p>Compressing image...</p>
                          </div>
                        ) : singleError ? (
                          <div className="flex min-h-64 items-center justify-center text-center text-sm text-destructive">
                            {singleError}
                          </div>
                        ) : singleResult ? (
                          <>
                            <img
                              src={singleResult.previewUrl}
                              alt="Compressed preview"
                              className="mx-auto max-h-64 w-auto max-w-full rounded-md"
                            />
                            <div className="mt-2 text-center text-sm text-muted-foreground">
                              {getFormatLabel(singleResult.format)} •{" "}
                              {formatFileSize(singleResult.blob.size)}
                              <span
                                className={`ml-2 ${
                                  getSavingsPercent(singleFile.size, singleResult.blob.size) >= 0
                                    ? "text-green-600"
                                    : "text-amber-600"
                                }`}
                              >
                                (
                                {formatSavingsLabel(
                                  getSavingsPercent(singleFile.size, singleResult.blob.size),
                                )}
                                )
                              </span>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Compression Settings</Label>
                      <div className="space-y-4 rounded-lg border p-4">
                        <div className="space-y-1.5">
                          <Label>Output Format</Label>
                          <Select
                            value={singleTarget}
                            onValueChange={(value) => setSingleTarget(value as CompressionTarget)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="original">Keep Original Format</SelectItem>
                              <SelectItem value="jpeg">Convert to JPEG</SelectItem>
                              <SelectItem value="png">Convert to PNG</SelectItem>
                              <SelectItem value="webp">Convert to WebP</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {shouldShowQualityControl(singleFile.type, singleTarget) ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label>Quality</Label>
                              <span className="text-sm text-muted-foreground">{singleQuality[0]}%</span>
                            </div>
                            <Slider
                              value={singleQuality}
                              onValueChange={setSingleQuality}
                              min={1}
                              max={100}
                              step={1}
                            />
                          </div>
                        ) : (
                          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                            PNG output is re-encoded locally, but browser-only PNG compression gains
                            are usually limited.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatsCard
                      label="Original Size"
                      value={formatFileSize(singleFile.size)}
                      hint={singleFile.type.replace("image/", "").toUpperCase()}
                    />
                    <StatsCard
                      label="Compressed Size"
                      value={singleResult ? formatFileSize(singleResult.blob.size) : "Processing..."}
                      hint={singleResult ? getFormatLabel(singleResult.format) : undefined}
                    />
                    <StatsCard
                      label="Savings"
                      value={
                        singleResult
                          ? formatSavingsLabel(
                              getSavingsPercent(singleFile.size, singleResult.blob.size),
                            )
                          : "Processing..."
                      }
                      hint={singleResult ? `${singleResult.width} × ${singleResult.height}` : undefined}
                    />
                  </div>

                  <div className="flex justify-center">
                    <Button
                      onClick={handleSingleDownload}
                      className="w-full sm:w-auto sm:min-w-[220px]"
                      size="lg"
                      disabled={!singleResult || singleProcessing}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Image
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="bulk" className="space-y-6">
              <input
                ref={bulkInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                onChange={handleBulkUpload}
                className="hidden"
                multiple
              />

              <Button
                onClick={() => bulkInputRef.current?.click()}
                className="w-full"
                variant="outline"
              >
                <Images className="mr-2 h-4 w-4" />
                Upload Images
              </Button>

              {!bulkFiles.length ? (
                <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
                  <Images className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>Batch compress JPG, PNG, and WebP images into one ZIP download.</p>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <StatsCard
                      label="Files"
                      value={`${bulkFiles.length}`}
                      hint={`${bulkCompletedCount} processed`}
                    />
                    <StatsCard
                      label="Original Size"
                      value={formatFileSize(totalBulkOriginalSize)}
                      hint="Completed results only"
                    />
                    <StatsCard
                      label="Compressed Size"
                      value={formatFileSize(totalBulkCompressedSize)}
                      hint={
                        completedBulkResults.length > 0 ? `${totalBulkSavings}% smaller overall` : undefined
                      }
                    />
                  </div>

                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="space-y-2">
                      <Label>Bulk Output</Label>
                      <Select
                        value={bulkTarget}
                        onValueChange={(value) => setBulkTarget(value as CompressionTarget)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="original">Keep Original Format</SelectItem>
                          <SelectItem value="webp">Convert to WebP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {bulkHasQualityControl ? (
                      <div className="space-y-2">
                        <Label>Quality: {bulkQuality[0]}%</Label>
                        <Slider
                          value={bulkQuality}
                          onValueChange={setBulkQuality}
                          min={1}
                          max={100}
                          step={1}
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        PNG files can be re-encoded in bulk, but the biggest savings usually come
                        from JPEG or WebP output.
                      </p>
                    )}

                    <Button
                      onClick={() => void handleBulkDownload()}
                      className="w-full"
                      size="lg"
                      disabled={completedBulkResults.length === 0 || bulkProcessing}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download ZIP
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Compression Results</Label>
                      {bulkProcessing ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          Processing {bulkCompletedCount} of {bulkFiles.length}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      {bulkResults.map((result) => (
                        <div
                          key={result.id}
                          className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{result.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatFileSize(result.originalSize)}
                              {result.compressedSize
                                ? ` -> ${formatFileSize(result.compressedSize)}`
                                : ""}
                            </p>
                            {result.error ? (
                              <p className="text-sm text-destructive">{result.error}</p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {result.format ? <Badge variant="secondary">{getFormatLabel(result.format)}</Badge> : null}
                            {typeof result.savingsPercent === "number" ? (
                              <Badge variant={result.savingsPercent >= 0 ? "default" : "destructive"}>
                                {formatSavingsLabel(result.savingsPercent)}
                              </Badge>
                            ) : null}
                            <Badge variant="outline">
                              {result.status === "processing"
                                ? "Processing"
                                : result.status === "done"
                                  ? "Ready"
                                  : result.status === "error"
                                    ? "Failed"
                                    : "Queued"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compression Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm md:grid-cols-3">
            <div>
              <dt className="font-medium">Keep Original Format</dt>
              <dd className="text-muted-foreground">
                Best when you want a smaller file without changing the extension.
              </dd>
            </div>
            <div>
              <dt className="font-medium">WebP Output</dt>
              <dd className="text-muted-foreground">
                Usually gives the best size savings for photos and mixed-content images.
              </dd>
            </div>
            <div>
              <dt className="font-medium">PNG Re-encoding</dt>
              <dd className="text-muted-foreground">
                PNG compression is limited in browser-only mode, so savings may be modest.
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
