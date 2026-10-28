import type { MetadataFinding } from "@/utils/image-metadata";
import type { Patch } from "@/utils/byte-source";

export type VideoFormat = "mp4" | "mov" | "m4v" | "3gp" | "mkv" | "webm";

export interface VideoCleanOptions {
  /** Set the creation and modification dates in the movie, track, and segment headers to zero. */
  clearDates: boolean;
  /** Remove timed metadata tracks (GoPro telemetry, camera motion, face detection) and zero their samples. */
  removeMetadataTracks: boolean;
  /** Keep fonts attached to a Matroska file, because subtitles need them. */
  keepFonts: boolean;
}

export const DEFAULT_VIDEO_OPTIONS: VideoCleanOptions = { clearDates: true, removeMetadataTracks: true, keepFonts: true };

export interface ScanResult {
  format: VideoFormat;
  findings: MetadataFinding[];
  /** The changes that make the clean copy with the options of the scan. */
  patches: Patch[];
  /** Parts of the file the scan could not check. */
  warnings: string[];
}

export class VideoError extends Error {}

/** saveFile in the desktop app holds the whole file in memory, so the tool sets a limit. */
export const MAX_VIDEO_BYTES = 2 * 1024 ** 3;

export const VIDEO_FORMAT_LABELS: Record<VideoFormat, string> = { mp4: "MP4", mov: "MOV", m4v: "M4V", "3gp": "3GP", mkv: "MKV", webm: "WebM" };

export const VIDEO_MIME: Record<VideoFormat, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  "3gp": "video/3gpp",
  mkv: "video/x-matroska",
  webm: "video/webm",
};

export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/x-m4v,video/3gpp,video/3gpp2,video/x-matroska,video/webm,.mp4,.mov,.qt,.m4v,.3gp,.3g2,.mkv,.webm";

const KNOWN_EXTENSIONS = new Set(["mp4", "mov", "qt", "m4v", "3gp", "3g2", "mkv", "webm"]);

/** Builds "<name>-clean.<ext>". Keeps the original extension when it is a video extension. */
export function cleanVideoName(name: string, format: VideoFormat): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name) || "video";
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  return `${base}-clean.${KNOWN_EXTENSIONS.has(ext.toLowerCase()) ? ext : format}`;
}
