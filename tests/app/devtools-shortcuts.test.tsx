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

describe("DevToolsApp shortcuts", () => {
  it("opens the command palette with Ctrl+K and launches a tool with Enter", async () => {
    setupMatchMedia();

    render(<DevToolsApp />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    const dialog = await screen.findByRole("dialog", { name: "Command Palette" });
    expect(dialog).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Search tools...");
    fireEvent.change(input, { target: { value: "json viewer" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("JSON Input")).toBeInTheDocument();
    });
  });

  it("closes the command palette with Escape", async () => {
    setupMatchMedia();

    render(<DevToolsApp />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    const input = await screen.findByPlaceholderText("Search tools...");
    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Command Palette" })).not.toBeInTheDocument();
    });
  });

  it("closes shortcut settings when clicking the backdrop", async () => {
    setupMatchMedia();

    render(<DevToolsApp />);

    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }));

    const dialog = await screen.findByRole("dialog", { name: "Shortcut Settings" });
    const backdrop = dialog.parentElement;

    expect(backdrop).not.toBeNull();

    fireEvent.mouseDown(backdrop!);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Shortcut Settings" })).not.toBeInTheDocument();
    });
  });

  it("supports arrow-key navigation inside the command palette", async () => {
    setupMatchMedia();

    render(<DevToolsApp />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    const input = await screen.findByPlaceholderText("Search tools...");
    fireEvent.change(input, { target: { value: "json" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Convert to TypeScript" })).toBeInTheDocument();
    });
  });

  it("does not trigger global shortcuts while typing in a tool input", async () => {
    setupMatchMedia();

    render(<DevToolsApp />);

    fireEvent.click(screen.getAllByRole("button", { name: /json viewer/i })[0]);

    const textarea = await screen.findByPlaceholderText("Paste your JSON here...");
    fireEvent.focus(textarea);
    fireEvent.keyDown(textarea, { key: "k", ctrlKey: true });

    expect(screen.queryByRole("dialog", { name: "Command Palette" })).not.toBeInTheDocument();
  });

  it("persists customized shortcuts across remounts", async () => {
    setupMatchMedia();

    const { unmount } = render(<DevToolsApp />);

    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }));

    expect(await screen.findByRole("dialog", { name: "Shortcut Settings" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Record Go Home" }));
    fireEvent.keyDown(window, { key: "H", ctrlKey: true, shiftKey: true });

    expect(screen.getByText("Ctrl+Shift+H")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    fireEvent.click(screen.getAllByRole("button", { name: /json viewer/i })[0]);
    await waitFor(() => {
      expect(screen.getByText("JSON Input")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "H", ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(screen.getByText("Quick Access")).toBeInTheDocument();
    });

    unmount();
    render(<DevToolsApp />);

    fireEvent.click(screen.getAllByRole("button", { name: /json viewer/i })[0]);
    await waitFor(() => {
      expect(screen.getByText("JSON Input")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "H", ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(screen.getByText("Quick Access")).toBeInTheDocument();
    });
  });
});
