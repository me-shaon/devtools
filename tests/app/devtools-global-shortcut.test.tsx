import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DevToolsApp from "@/app/DevToolsApp";
import type { DesktopBridge } from "@/lib/desktop";

const desktopMock = vi.hoisted(() => ({ bridge: null as DesktopBridge | null }));

vi.mock("@/lib/desktop", () => ({
  getDesktopBridge: () => desktopMock.bridge,
  saveFile: vi.fn(async () => true),
}));

let openPalette: () => void = () => {};
let setGlobalShortcut: ReturnType<typeof vi.fn>;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false, media: "", addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
    })),
  });
  localStorage.setItem("devtools-whats-new-seen-version", "2.0.0");
  const idle = { status: "idle" as const, currentVersion: "2.0.0" };
  setGlobalShortcut = vi.fn(async () => null);
  desktopMock.bridge = {
    platform: "darwin",
    getVersion: vi.fn(async () => "2.0.0"),
    getUpdateState: vi.fn(async () => idle),
    onUpdateState: vi.fn(() => () => {}),
    checkForUpdates: vi.fn(async () => idle),
    downloadUpdate: vi.fn(async () => true),
    installUpdate: vi.fn(async () => true),
    setGlobalShortcut,
    onOpenCommandPalette: vi.fn((callback: () => void) => {
      openPalette = callback;
      return () => {};
    }),
  };
});

afterEach(() => {
  localStorage.clear();
  desktopMock.bridge = null;
});

describe("DevToolsApp global shortcut", () => {
  it("registers Ctrl+Shift+Space by default and pauses it while the Shortcuts dialog is open", async () => {
    render(<DevToolsApp />);
    await waitFor(() => expect(setGlobalShortcut).toHaveBeenLastCalledWith("Control+Shift+Space"));

    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }));
    await waitFor(() => expect(setGlobalShortcut).toHaveBeenLastCalledWith(null));
    expect(screen.getByText("Show DevTools")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Use the Show DevTools shortcut" }));
    fireEvent.click(screen.getByRole("button", { name: "Close shortcut settings" }));
    await waitFor(() => expect(setGlobalShortcut).toHaveBeenLastCalledWith(null));
    expect(JSON.parse(localStorage.getItem("devtools-global-shortcut-v1") ?? "{}")).toMatchObject({ enabled: false });
  });

  it("opens the command palette when the tray menu or shortcut asks for it", async () => {
    render(<DevToolsApp />);
    await waitFor(() => expect(desktopMock.bridge?.onOpenCommandPalette).toHaveBeenCalled());
    act(() => openPalette());
    expect(await screen.findByPlaceholderText("Search tools...")).toBeInTheDocument();
  });
});
