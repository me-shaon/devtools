import { blobSource, patchedBlob, type ByteSource } from "@/utils/byte-source";
import { scanBmff } from "@/utils/video-bmff";
import { scanEbml } from "@/utils/video-ebml";
import { DEFAULT_VIDEO_OPTIONS, VIDEO_MIME, VideoError, type ScanResult, type VideoCleanOptions } from "@/utils/video-format";

/**
 * Finds and removes metadata in MP4, MOV, M4V, 3GP, MKV, and WebM videos
 * without re-encoding. The audio and video samples are not changed.
 */

const BMFF_TOP = new Set(["ftyp", "moov", "mdat", "free", "skip", "wide", "pnot"]);

export async function detectContainer(source: ByteSource): Promise<"bmff" | "ebml" | null> {
  const h = await source.read(0, 12);
  if (h.length >= 4 && h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) return "ebml";
  if (h.length >= 8 && BMFF_TOP.has(String.fromCharCode(h[4], h[5], h[6], h[7]))) return "bmff";
  return null;
}

export interface VideoInspection extends ScanResult {
  size: number;
  hasAi: boolean;
  hasLocation: boolean;
}

export async function inspectVideo(source: ByteSource, options: VideoCleanOptions = DEFAULT_VIDEO_OPTIONS): Promise<VideoInspection> {
  const container = await detectContainer(source);
  if (!container) throw new VideoError("This file is not an MP4, MOV, M4V, 3GP, MKV, or WebM video.");
  const scan = container === "bmff" ? await scanBmff(source, options) : await scanEbml(source, options);
  return {
    ...scan,
    size: source.size,
    hasAi: scan.findings.some((f) => f.kind === "ai"),
    hasLocation: scan.findings.some((f) => f.kind === "location"),
  };
}

export interface VideoCleanResult {
  blob: Blob;
  before: VideoInspection;
  /** A second scan of the clean copy. It shows what is left. */
  after: VideoInspection;
  removedCount: number;
}

/** Builds the clean copy and scans it again. */
export async function cleanVideo(file: Blob, before: VideoInspection, options: VideoCleanOptions): Promise<VideoCleanResult> {
  const blob = patchedBlob(file, before.patches, VIDEO_MIME[before.format]);
  const after = await inspectVideo(blobSource(blob), options);
  return { blob, before, after, removedCount: before.findings.filter((f) => f.removable).length };
}
