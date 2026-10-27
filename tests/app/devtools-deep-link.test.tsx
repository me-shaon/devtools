import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DevToolsApp from "@/app/DevToolsApp";
import type { DesktopBridge } from "@/lib/desktop";

const desktopMock = vi.hoisted(() => ({ bridge: null as DesktopBridge | null }));

vi.mock("@/lib/desktop", () => ({
  getDesktopBridge: () => desktopMock.bridge,
  saveFile: vi.fn(async () => true),
}));

let sendLink: (url: string) => void = () => {};

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
  localStorage.setItem("devtools-whats-new-seen-version", "2.0.0");
  const idle = { status: "idle" as const, currentVersion: "2.0.0" };
  desktopMock.bridge = {
    platform: "darwin",
    getVersion: vi.fn(async () => "2.0.0"),
    getUpdateState: vi.fn(async () => idle),
    onUpdateState: vi.fn(() => () => {}),
    checkForUpdates: vi.fn(async () => idle),
    downloadUpdate: vi.fn(async () => true),
    installUpdate: vi.fn(async () => true),
    onDeepLink: vi.fn((callback: (url: string) => void) => {
      sendLink = callback;
      return () => {};
    }),
  };
});

afterEach(() => {
  localStorage.clear();
  desktopMock.bridge = null;
  sendLink = () => {};
});

describe("DevToolsApp deep links", () => {
  it("opens the tool named in a devtoolsapp:// link", async () => {
    render(<DevToolsApp />);
    await waitFor(() => expect(desktopMock.bridge?.onDeepLink).toHaveBeenCalled());

    act(() => sendLink("devtoolsapp://open/hash-generator"));

    expect(await screen.findByRole("tab", { name: /Hash Generator/ })).toHaveAttribute("aria-selected", "true");
  });

  it("opens the command palette with the query from a search link", async () => {
    render(<DevToolsApp />);
    await waitFor(() => expect(desktopMock.bridge?.onDeepLink).toHaveBeenCalled());

    act(() => sendLink("devtoolsapp://search?q=yaml"));

    expect(await screen.findByPlaceholderText("Search tools...")).toHaveValue("yaml");
  });

  it("ignores links to unknown tools", async () => {
    render(<DevToolsApp />);
    await waitFor(() => expect(desktopMock.bridge?.onDeepLink).toHaveBeenCalled());

    act(() => sendLink("devtoolsapp://open/not-a-tool"));

    expect(screen.queryByRole("tab", { selected: true })).toBeNull();
  });
});
