import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DevToolsApp from "@/app/DevToolsApp";
import { THEME_STORAGE_KEY } from "@/utils/theme";

type MatchMediaController = {
  setMatches: (matches: boolean) => void;
};

const setupMatchMedia = (initialMatches: boolean): MatchMediaController => {
  let matches = initialMatches;
  let changeHandler: ((event: MediaQueryListEvent) => void) | undefined;

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((event: string, listener: EventListenerOrEventListenerObject) => {
      if (event === "change" && typeof listener === "function") {
        changeHandler = listener as (event: MediaQueryListEvent) => void;
      }
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      changeHandler = listener;
    }),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => mediaQueryList),
  });

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      changeHandler?.({ matches: nextMatches } as MediaQueryListEvent);
    },
  };
};

afterEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});

describe("DevToolsApp theme", () => {
  it("uses the system dark theme on initial load", async () => {
    setupMatchMedia(true);

    render(<DevToolsApp />);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });

    expect(screen.getByText("Dark")).toBeInTheDocument();
  });

  it("updates when the system theme changes", async () => {
    const matchMedia = setupMatchMedia(false);

    render(<DevToolsApp />);

    await waitFor(() => {
      expect(document.documentElement).not.toHaveClass("dark");
    });

    act(() => {
      matchMedia.setMatches(true);
    });

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });

    expect(screen.getByText("Dark")).toBeInTheDocument();
  });

  it("persists a manual theme override across launches", async () => {
    setupMatchMedia(false);

    const { unmount } = render(<DevToolsApp />);

    await waitFor(() => {
      expect(screen.getByText("Light")).toBeInTheDocument();
    });

    const themeToggle = screen.getByText("Light").closest("button");

    if (!themeToggle) {
      throw new Error("Theme toggle button not found");
    }

    fireEvent.click(themeToggle);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    unmount();
    document.documentElement.classList.remove("dark");

    render(<DevToolsApp />);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
  });
});
