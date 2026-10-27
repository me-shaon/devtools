import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
  getVersion: vi.fn(async () => "1.3.0"),
  platform: vi.fn(() => "macos"),
  openUrl: vi.fn(async () => {}),
  relaunch: vi.fn(async () => {}),
  check: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: tauri.isTauri, invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: tauri.getVersion }));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: tauri.platform }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: tauri.openUrl }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: tauri.relaunch }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: tauri.check }));

const blobOf = (bytes: number[]) =>
  ({ arrayBuffer: async () => new Uint8Array(bytes).buffer }) as Blob;

const loadDesktop = async () => {
  vi.resetModules();
  return import("@/lib/desktop");
};

beforeEach(() => {
  vi.stubEnv("DEV", false);
  tauri.isTauri.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("getDesktopBridge", () => {
  it("returns null outside the desktop runtime", async () => {
    tauri.isTauri.mockReturnValue(false);
    const { getDesktopBridge } = await loadDesktop();

    expect(getDesktopBridge()).toBeNull();
  });

  it("maps the OS platform to Node-style names", async () => {
    tauri.platform.mockReturnValue("windows");
    const { getDesktopBridge } = await loadDesktop();

    expect(getDesktopBridge()?.platform).toBe("win32");
  });

  it("checks, downloads, and installs an available update", async () => {
    const update = {
      version: "1.4.0",
      download: vi.fn(async (onEvent: (event: unknown) => void) => {
        onEvent({ event: "Started", data: { contentLength: 200 } });
        onEvent({ event: "Progress", data: { chunkLength: 100 } });
        onEvent({ event: "Finished" });
      }),
      install: vi.fn(async () => {}),
    };
    tauri.check.mockResolvedValue(update);

    const { getDesktopBridge } = await loadDesktop();
    const bridge = getDesktopBridge()!;
    const states: string[] = [];
    bridge.onUpdateState((state) => states.push(`${state.status}:${state.progress ?? ""}`));

    await expect(bridge.checkForUpdates()).resolves.toEqual({
      status: "available",
      version: "1.4.0",
      currentVersion: "1.3.0",
    });

    await expect(bridge.downloadUpdate()).resolves.toBe(true);
    await expect(bridge.installUpdate()).resolves.toBe(true);

    expect(states).toEqual([
      "checking:",
      "available:",
      "downloading:0",
      "downloading:50",
      "downloaded:100",
    ]);
    expect(update.install).toHaveBeenCalled();
    expect(tauri.relaunch).toHaveBeenCalled();
  });

  it("reports when no update is available", async () => {
    tauri.check.mockResolvedValue(null);
    const { getDesktopBridge } = await loadDesktop();

    await expect(getDesktopBridge()!.checkForUpdates()).resolves.toMatchObject({
      status: "not-available",
    });
    await expect(getDesktopBridge()!.downloadUpdate()).resolves.toBe(false);
  });

  it("reports update check errors", async () => {
    tauri.check.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { getDesktopBridge } = await loadDesktop();

    await expect(getDesktopBridge()!.checkForUpdates()).resolves.toMatchObject({
      status: "error",
      message: "offline",
    });
  });

  it("passes a timeout to the update check", async () => {
    tauri.check.mockResolvedValue(null);
    const { getDesktopBridge } = await loadDesktop();

    await getDesktopBridge()!.checkForUpdates();

    expect(tauri.check).toHaveBeenCalledWith({ timeout: 30000 });
  });

  it("does not start a new check while an update downloads", async () => {
    let finishDownload = () => {};
    const update = {
      version: "1.4.0",
      download: vi.fn(() => new Promise<void>((resolve) => (finishDownload = resolve))),
      install: vi.fn(async () => {}),
    };
    tauri.check.mockResolvedValue(update);
    const { getDesktopBridge } = await loadDesktop();
    const bridge = getDesktopBridge()!;

    await bridge.checkForUpdates();
    const download = bridge.downloadUpdate();

    await expect(bridge.checkForUpdates()).resolves.toMatchObject({ status: "downloading" });
    expect(tauri.check).toHaveBeenCalledTimes(1);

    finishDownload();
    await download;
    await expect(bridge.checkForUpdates()).resolves.toMatchObject({ status: "downloaded" });
    await expect(bridge.installUpdate()).resolves.toBe(true);
    expect(update.install).toHaveBeenCalled();
  });

  it("reports download errors and rethrows them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    tauri.check.mockResolvedValue({
      version: "1.4.0",
      download: vi.fn(async () => {
        throw new Error("connection reset");
      }),
      install: vi.fn(),
    });
    const { getDesktopBridge } = await loadDesktop();
    const bridge = getDesktopBridge()!;

    await bridge.checkForUpdates();

    await expect(bridge.downloadUpdate()).rejects.toThrow("connection reset");
    await expect(bridge.getUpdateState()).resolves.toMatchObject({
      status: "error",
      message: "connection reset",
    });
  });

  it("does not install or relaunch without a pending update", async () => {
    tauri.check.mockResolvedValue(null);
    const { getDesktopBridge } = await loadDesktop();
    const bridge = getDesktopBridge()!;

    await expect(bridge.installUpdate()).resolves.toBe(false);
    expect(tauri.relaunch).not.toHaveBeenCalled();
  });

  it("does not relaunch when the install fails", async () => {
    const update = {
      version: "1.4.0",
      download: vi.fn(async () => {}),
      install: vi.fn(async () => {
        throw new Error("install failed");
      }),
    };
    tauri.check.mockResolvedValue(update);
    const { getDesktopBridge } = await loadDesktop();
    const bridge = getDesktopBridge()!;

    await bridge.checkForUpdates();
    await bridge.downloadUpdate();

    await expect(bridge.installUpdate()).rejects.toThrow("install failed");
    expect(tauri.relaunch).not.toHaveBeenCalled();
  });

  it("disables updates in development builds", async () => {
    vi.stubEnv("DEV", true);
    const { getDesktopBridge } = await loadDesktop();

    await expect(getDesktopBridge()!.getUpdateState()).resolves.toMatchObject({
      status: "unsupported",
    });
    await expect(getDesktopBridge()!.checkForUpdates()).resolves.toMatchObject({
      status: "unsupported",
    });
    expect(tauri.check).not.toHaveBeenCalled();
  });
});

describe("saveFile", () => {
  it("sends the file bytes and encoded name to the save_file command", async () => {
    tauri.invoke.mockResolvedValue("/tmp/qr code.png");
    const { saveFile } = await loadDesktop();

    await expect(saveFile(blobOf([1, 2, 3]), "qr code.png")).resolves.toBe(true);

    const [command, body, options] = tauri.invoke.mock.calls[0];
    expect(command).toBe("save_file");
    expect(Array.from(body as Uint8Array)).toEqual([1, 2, 3]);
    expect(options).toEqual({ headers: { "x-file-name": "qr%20code.png" } });
  });

  it("returns false when the user cancels the dialog", async () => {
    tauri.invoke.mockResolvedValue(null);
    const { saveFile } = await loadDesktop();

    await expect(saveFile(blobOf([120]), "a.txt")).resolves.toBe(false);
  });

  it("falls back to an anchor download in the browser", async () => {
    tauri.isTauri.mockReturnValue(false);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { saveFile } = await loadDesktop();

    await expect(saveFile(new Blob(["x"]), "a.txt")).resolves.toBe(true);
    expect(click).toHaveBeenCalled();
    expect(tauri.invoke).not.toHaveBeenCalled();
    click.mockRestore();
  });
});

describe("installExternalLinkHandler", () => {
  it("opens external links in the system browser", async () => {
    const { installExternalLinkHandler } = await loadDesktop();
    const uninstall = installExternalLinkHandler();

    const external = document.createElement("a");
    external.href = "https://example.com/docs";
    const internal = document.createElement("a");
    internal.href = "#section";
    document.body.append(external, internal);

    const externalEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    external.dispatchEvent(externalEvent);
    const internalEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    internal.dispatchEvent(internalEvent);

    expect(externalEvent.defaultPrevented).toBe(true);
    expect(internalEvent.defaultPrevented).toBe(false);
    expect(tauri.openUrl).toHaveBeenCalledTimes(1);
    expect(tauri.openUrl).toHaveBeenCalledWith("https://example.com/docs");

    uninstall();
    external.remove();
    internal.remove();
  });
});
