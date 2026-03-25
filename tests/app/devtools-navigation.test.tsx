import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DevToolsApp from "@/app/DevToolsApp";

afterEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
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

describe("DevToolsApp navigation", () => {
  it("opens a tool from quick access after lazy loading", async () => {
    setupMatchMedia();

    render(<DevToolsApp />);

    fireEvent.click(screen.getAllByRole("button", { name: /json viewer/i })[0]);

    await waitFor(() => {
      expect(screen.getByText("JSON Input")).toBeInTheDocument();
    });
  });
});
