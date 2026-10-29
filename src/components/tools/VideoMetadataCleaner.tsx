import { useEffect, useRef, useState, type DragEvent } from "react";
import { FileUp, FileVideo, LoaderCircle, ShieldOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MetadataFindingRow } from "@/components/tools/MetadataFindingRow";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { EditorPane, PaneEmpty, PaneOpenFile, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import { saveFile } from "@/lib/desktop";
import { blobSource } from "@/utils/byte-source";
import { formatBytes } from "@/utils/hash";
import { FINDING_KIND_LABELS, FINDING_KIND_ORDER } from "@/utils/image-metadata";
import { DEFAULT_VIDEO_OPTIONS, MAX_VIDEO_BYTES, VIDEO_ACCEPT, VIDEO_FORMAT_LABELS, cleanVideoName, type VideoCleanOptions } from "@/utils/video-format";
import { cleanVideo, inspectVideo, type VideoCleanResult, type VideoInspection } from "@/utils/video-metadata";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which metadata does the tool remove?",
    a: "It removes C2PA Content Credentials, XMP (including the IPTC digital source type that marks AI video), GPS positions, camera make and model, software and encoder names, titles and comments, and recording dates. It also removes timed metadata tracks, such as GoPro telemetry and iPhone face detection data. In MKV and WebM files it removes tags, cover pictures, and app names.",
  },
  {
    q: "Does cleaning change the video or the audio?",
    a: "No. The tool does not re-encode. It overwrites each metadata block in place with empty padding of the same size, so the file size stays the same and every audio and video packet stays byte for byte the same. After cleaning, the tool reads the clean copy again and lists what is left.",
  },
  {
    q: "Does cleaning remove AI watermarks?",
    a: "No. Some AI tools hide an invisible watermark in the pixels or the audio, for example Google SynthID in Veo videos. A visible watermark is part of the picture. Metadata removal does not touch the picture or the sound, so these watermarks stay.",
  },
  {
    q: "Why are some items kept?",
    a: "Unknown vendor boxes can hold data that some players need, so the tool keeps them. Fonts in MKV files stay when Keep fonts is on, because subtitles need them. Subtitle tracks stay, but some drones and dash cameras store GPS data in them. Remove that track with a video editor if you need to.",
  },
  {
    q: "Is my video uploaded?",
    a: "No. The video stays on your device. The tool reads only the parts of the file that hold metadata, so large files open fast. Removing metadata does not change where a video came from. Follow the AI-disclosure rules of the platforms where you share it.",
  },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function VideoMetadataCleaner() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<VideoCleanOptions>(DEFAULT_VIDEO_OPTIONS);
  const [inspection, setInspection] = useState<VideoInspection | null>(null);
  const [result, setResult] = useState<VideoCleanResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setBusy(true);
    setError("");
    setResult(null);
    inspectVideo(blobSource(file), options)
      .then((next) => {
        if (!cancelled) setInspection(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setInspection(null);
        setError(err instanceof Error ? err.message : "Could not read the video.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, options]);

  const openFile = (next: File | undefined) => {
    if (!next) return;
    if (next.size > MAX_VIDEO_BYTES) {
      setFile(null);
      setInspection(null);
      setResult(null);
      setError(`The file is ${formatBytes(next.size)}. This tool opens videos up to ${formatBytes(MAX_VIDEO_BYTES)}.`);
      return;
    }
    setFile(next);
  };

  const save = async () => {
    if (!file || !inspection) return;
    setBusy(true);
    try {
      const cleaned = await cleanVideo(file, inspection, options);
      setResult(cleaned);
      const name = cleanVideoName(file.name, inspection.format);
      if (await saveFile(cleaned.blob, name)) toast.success(`Saved ${name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the clean copy.");
    } finally {
      setBusy(false);
    }
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    setDragging(false);
    openFile(event.dataTransfer.files[0]);
  };

  const setOption = (key: keyof VideoCleanOptions) => (value: boolean) => setOptions((current) => ({ ...current, [key]: value }));
  const findings = inspection?.findings ?? [];
  const removable = findings.filter((f) => f.removable).length;
  const matroska = inspection?.format === "mkv" || inspection?.format === "webm";
  const left = result?.after.findings.filter((f) => f.removable) ?? [];

  const notice = () => {
    if (error) return <div className="workspace-notice" data-tone="error" role="alert">{error}</div>;
    if (!result) return undefined;
    return (
      <div className="workspace-notice" role="status">
        {result.after.warnings.length
          ? `Removed ${plural(result.removedCount, "item")}. The scan is incomplete; metadata may remain in the clean copy. ${result.after.warnings.join(" ")}`
          : left.length
          ? `The clean copy still has ${plural(left.length, "item")}: ${left.map((f) => f.label).join(", ")}.`
          : `Removed ${plural(result.removedCount, "item")}. The clean copy has no metadata left to remove. The audio and video data did not change.`}
      </div>
    );
  };

  const status = () => {
    if (busy) return <span>Reading the video</span>;
    if (!inspection) return <span>Ready</span>;
    return (
      <span>
        {VIDEO_FORMAT_LABELS[inspection.format]} · {formatBytes(inspection.size)} · {plural(removable, "item")} to remove
        {inspection.hasAi ? " · AI labels found" : ""}
        {inspection.hasLocation ? " · Location found" : ""}
      </span>
    );
  };

  return (
    <ToolWorkspace
      id="video-metadata"
      toolbar={
        <>
          <input
            ref={inputRef}
            id="video-metadata-file"
            type="file"
            accept={VIDEO_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              openFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
            <FileUp aria-hidden="true" />
            Open video
          </Button>
          <label className="option-switch indent-control" htmlFor="video-metadata-dates">
            Clear dates
            <Switch id="video-metadata-dates" checked={options.clearDates} onCheckedChange={setOption("clearDates")} disabled={busy} />
          </label>
          <label className="option-switch" htmlFor="video-metadata-tracks">
            Remove metadata tracks
            <Switch id="video-metadata-tracks" checked={options.removeMetadataTracks} onCheckedChange={setOption("removeMetadataTracks")} disabled={busy} />
          </label>
          {matroska && (
            <label className="option-switch" htmlFor="video-metadata-fonts">
              Keep fonts
              <Switch id="video-metadata-fonts" checked={options.keepFonts} onCheckedChange={setOption("keepFonts")} disabled={busy} />
            </label>
          )}
          <Button size="sm" onClick={() => void save()} disabled={!inspection || busy} aria-busy={busy || undefined}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ShieldOff aria-hidden="true" />}
            Save clean copy
          </Button>
        </>
      }
      notice={notice()}
      first={
        <EditorPane title="Video">
          <div
            className={`flex h-full min-h-full flex-col ${dragging ? "bg-accent" : ""}`}
            data-dragging={dragging || undefined}
            onDragOver={onDragOver}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {file ? (
              <div className="space-y-3 p-4">
                <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm">
                  <FileVideo className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                </div>
                <p className="text-xs text-muted-foreground">The video is read on this device. It is not uploaded.</p>
                {inspection?.warnings.map((warning) => (
                  <p key={warning} className="text-xs text-muted-foreground">
                    {warning}
                  </p>
                ))}
              </div>
            ) : (
              <PaneOpenFile
                icon={<FileVideo size={20} aria-hidden="true" />}
                title="Drop a video here or click to open"
                hint="MP4, MOV, M4V, 3GP, MKV, or WebM. The video stays on this device."
                onClick={() => inputRef.current?.click()}
              />
            )}
          </div>
        </EditorPane>
      }
      second={
        <EditorPane title="Metadata">
          {!inspection ? (
            <PaneEmpty title="No video" hint="The metadata of the video shows here." />
          ) : findings.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">This video has no metadata that this tool can remove.</p>
          ) : (
            FINDING_KIND_ORDER.filter((kind) => findings.some((f) => f.kind === kind)).map((kind) => (
              <section key={kind} aria-labelledby={`video-metadata-group-${kind}`}>
                <h3
                  id={`video-metadata-group-${kind}`}
                  className={`flex items-center gap-1.5 px-4 pb-1 pt-3 text-xs font-semibold ${kind === "ai" ? "text-warning" : "text-muted-foreground"}`}
                >
                  {kind === "ai" && <Sparkles size={13} aria-hidden="true" />}
                  {FINDING_KIND_LABELS[kind]}
                </h3>
                <div className="result-list">
                  {findings
                    .filter((f) => f.kind === kind)
                    .map((finding, index) => (
                      <MetadataFindingRow key={`${finding.label}-${index}`} id={`video-metadata-${kind}-${index}`} finding={finding} removed={finding.removable} />
                    ))}
                </div>
              </section>
            ))
          )}
        </EditorPane>
      }
      status={status()}
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
