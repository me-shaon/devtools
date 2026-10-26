import { invoke, isTauri } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { platform as getOsPlatform } from "@tauri-apps/plugin-os";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error"
  | "unsupported";

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  progress?: number;
  message?: string;
  currentVersion?: string;
}

export interface DesktopBridge {
  /** Node-style platform name: "darwin", "win32", or "linux". */
  platform: string;
  getVersion: () => Promise<string>;
  getUpdateState: () => Promise<UpdateState>;
  onUpdateState: (callback: (state: UpdateState) => void) => () => void;
  checkForUpdates: () => Promise<UpdateState>;
  downloadUpdate: () => Promise<boolean>;
  installUpdate: () => Promise<boolean>;
}

const UPDATE_CHECK_DELAY_MS = 15000;

function toNodePlatform(osPlatform: string): string {
  if (osPlatform === "macos") {
    return "darwin";
  }

  if (osPlatform === "windows") {
    return "win32";
  }

  return osPlatform;
}

function createTauriBridge(): DesktopBridge {
  const isDev = import.meta.env.DEV;
  const listeners = new Set<(state: UpdateState) => void>();
  let pendingUpdate: Update | null = null;
  let updateCheckTimeout: ReturnType<typeof setTimeout> | null = null;
  let updateState: UpdateState = { status: isDev ? "unsupported" : "idle" };

  const setUpdateState = (nextState: UpdateState) => {
    updateState = nextState;
    listeners.forEach((listener) => listener(updateState));
  };

  const withCurrentVersion = async (): Promise<UpdateState> => ({
    ...updateState,
    currentVersion: await getVersion(),
  });

  const runUpdateCheck = async (): Promise<UpdateState> => {
    if (isDev) {
      setUpdateState({
        status: "unsupported",
        message: "Update checks are disabled in development builds.",
      });
      return withCurrentVersion();
    }

    setUpdateState({ status: "checking" });

    try {
      pendingUpdate = await check();
      setUpdateState(
        pendingUpdate
          ? { status: "available", version: pendingUpdate.version }
          : { status: "not-available" },
      );
    } catch (error) {
      console.error("Update check failed:", error);
      setUpdateState({
        status: "error",
        message: error instanceof Error ? error.message : String(error ?? "Unable to check for updates."),
      });
    }

    return withCurrentVersion();
  };

  const scheduleUpdateCheck = () => {
    if (isDev || updateCheckTimeout) {
      return;
    }

    // Let the renderer settle before starting network/update work.
    updateCheckTimeout = setTimeout(() => {
      runUpdateCheck();
    }, UPDATE_CHECK_DELAY_MS);
  };

  return {
    platform: toNodePlatform(getOsPlatform()),
    getVersion,
    getUpdateState: async () => {
      scheduleUpdateCheck();
      return withCurrentVersion();
    },
    onUpdateState: (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    checkForUpdates: runUpdateCheck,
    downloadUpdate: async () => {
      if (isDev || !pendingUpdate) {
        if (isDev) {
          setUpdateState({
            status: "unsupported",
            message: "Updates are disabled in development builds.",
          });
        }
        return false;
      }

      let contentLength = 0;
      let downloaded = 0;

      setUpdateState({ ...updateState, status: "downloading", progress: 0 });

      try {
        await pendingUpdate.download((event) => {
          if (event.event === "Started") {
            contentLength = event.data.contentLength ?? 0;
          } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            setUpdateState({
              ...updateState,
              status: "downloading",
              progress: contentLength ? (downloaded / contentLength) * 100 : undefined,
            });
          }
        });
      } catch (error) {
        console.error("Update download failed:", error);
        setUpdateState({
          status: "error",
          message: error instanceof Error ? error.message : String(error ?? "Unable to download the update."),
        });
        throw error;
      }

      setUpdateState({ status: "downloaded", version: pendingUpdate.version, progress: 100 });
      return true;
    },
    installUpdate: async () => {
      if (isDev || !pendingUpdate) {
        return false;
      }

      await pendingUpdate.install();
      await relaunch();
      return true;
    },
  };
}

let bridge: DesktopBridge | null | undefined;

/** Returns the desktop runtime bridge, or `null` when the app runs in a plain browser. */
export function getDesktopBridge(): DesktopBridge | null {
  if (bridge === undefined) {
    bridge = isTauri() ? createTauriBridge() : null;
  }

  return bridge;
}

/**
 * Saves a file to disk. The desktop app shows a native save dialog.
 * A browser falls back to an anchor download.
 * Returns false when the user cancels the save dialog.
 */
export async function saveFile(data: Blob, fileName: string): Promise<boolean> {
  if (!isTauri()) {
    const downloadUrl = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
    return true;
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  const savedPath = await invoke<string | null>("save_file", bytes, {
    headers: { "x-file-name": encodeURIComponent(fileName) },
  });

  return savedPath !== null;
}

/** Opens http(s) and mailto links in the system browser instead of the app window. */
export function installExternalLinkHandler(root: Document = document): () => void {
  if (!isTauri()) {
    return () => {};
  }

  const handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) {
      return;
    }

    const url = new URL(anchor.href);
    if (!/^(https?|mailto):$/.test(url.protocol) || url.origin === window.location.origin) {
      return;
    }

    event.preventDefault();
    openUrl(anchor.href).catch((error) => {
      console.error("Failed to open external link:", error);
    });
  };

  root.addEventListener("click", handleClick);
  return () => root.removeEventListener("click", handleClick);
}
