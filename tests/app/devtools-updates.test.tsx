import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DevToolsApp from "@/app/DevToolsApp";

afterEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
  delete (window as Window & { electronAPI?: unknown }).electronAPI;
});

const setupMatchMedia = () => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

describe("DevToolsApp updates", () => {
  it("shows the app version and update action in the sidebar footer", async () => {
    setupMatchMedia();

    window.electronAPI = {
      invoke: vi.fn(async (channel: string) => {
        if (channel === "app-version") {
          return "1.2.3";
        }

        if (channel === "update-status") {
          return { status: "available", version: "1.3.0", currentVersion: "1.2.3" };
        }

        return null;
      }),
      on: vi.fn(() => () => {}),
      platform: "darwin",
      version: "40.0.0",
    };

    render(<DevToolsApp />);

    expect(await screen.findByText("Version v1.2.3")).toBeInTheDocument();
    expect(screen.getByText("Version 1.3.0 is available.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update to v1.3.0" })).toBeInTheDocument();

    await waitFor(() => {
      expect(window.electronAPI.invoke).toHaveBeenCalledWith("app-version");
      expect(window.electronAPI.invoke).toHaveBeenCalledWith("update-status");
    });
  });

  it("shows what's new on first launch after a version bump and persists dismissal", async () => {
    setupMatchMedia();

    window.electronAPI = {
      invoke: vi.fn(async (channel: string) => {
        if (channel === "app-version") {
          return "1.1.0";
        }

        if (channel === "update-status") {
          return { status: "not-available", currentVersion: "1.1.0" };
        }

        return null;
      }),
      on: vi.fn(() => () => {}),
      platform: "darwin",
      version: "40.0.0",
    };

    const { unmount } = render(<DevToolsApp />);

    const dialog = await screen.findByRole("dialog", { name: "DevToolsApp v1.1.0" });

    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Highlights")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Text Compare now offers richer diff views");

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "DevToolsApp v1.1.0" })).not.toBeInTheDocument();
    });

    expect(localStorage.getItem("devtools-whats-new-seen-version")).toBe("1.1.0");

    unmount();
    render(<DevToolsApp />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "DevToolsApp v1.1.0" })).not.toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "What's New" })).toBeInTheDocument();
  });
});
