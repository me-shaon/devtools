import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "sonner";
import DevToolsApp from "@/app/DevToolsApp";
import type { DesktopBridge, UpdateState } from "@/lib/desktop";

const desktopMock = vi.hoisted(() => ({ bridge: null as DesktopBridge | null }));

vi.mock("@/lib/desktop", () => ({
  getDesktopBridge: () => desktopMock.bridge,
  saveFile: vi.fn(async () => true),
}));

let pushState: (state: UpdateState) => void = () => {};

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false, media: "", addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
    })),
  });
  localStorage.setItem("devtools-whats-new-seen-version", "2.1.1");
  const idle = { status: "idle" as const, currentVersion: "2.1.1" };
  desktopMock.bridge = {
    platform: "darwin",
    getVersion: vi.fn(async () => "2.1.1"),
    getUpdateState: vi.fn(async () => idle),
    onUpdateState: vi.fn((callback) => {
      pushState = callback;
      return () => {};
    }),
    checkForUpdates: vi.fn(async () => idle),
    downloadUpdate: vi.fn(async () => true),
    installUpdate: vi.fn(async () => true),
    setAutoUpdate: vi.fn(),
  };
});

afterEach(() => {
  localStorage.clear();
  desktopMock.bridge = null;
});

describe("DevToolsApp automatic updates", () => {
  it("turns automatic updates on by default and saves the switch", async () => {
    render(<DevToolsApp />);
    await waitFor(() => expect(desktopMock.bridge?.setAutoUpdate).toHaveBeenLastCalledWith(true));

    fireEvent.click(screen.getByRole("switch", { name: "Update automatically" }));

    await waitFor(() => expect(desktopMock.bridge?.setAutoUpdate).toHaveBeenLastCalledWith(false));
    expect(localStorage.getItem("devtools-auto-update")).toBe("false");
  });

  it("keeps automatic updates off after a restart when the user turned them off", async () => {
    localStorage.setItem("devtools-auto-update", "false");
    render(<DevToolsApp />);
    await waitFor(() => expect(desktopMock.bridge?.setAutoUpdate).toHaveBeenLastCalledWith(false));
    expect(screen.getByRole("switch", { name: "Update automatically" })).toHaveAttribute("aria-checked", "false");
  });

  it("announces a downloaded update once and restarts from the notice", async () => {
    render(
      <>
        <DevToolsApp />
        <Toaster />
      </>,
    );
    await waitFor(() => expect(desktopMock.bridge?.onUpdateState).toHaveBeenCalled());

    act(() => pushState({ status: "downloaded", version: "2.2.0", progress: 100 }));

    expect(await screen.findByText("DevTools 2.2.0 is ready")).toBeInTheDocument();
    expect(screen.getByText("Version 2.2.0 is ready. It installs when you quit DevTools.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restart now" }));
    expect(desktopMock.bridge?.installUpdate).toHaveBeenCalled();
  });
});
