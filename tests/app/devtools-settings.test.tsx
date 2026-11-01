import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DevToolsApp from "@/app/DevToolsApp";

const paste = (text: string) => {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
  act(() => {
    document.body.dispatchEvent(event);
  });
};

const openSettings = () => fireEvent.click(screen.getByRole("button", { name: "Settings" }));

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: true, media: "", addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});

describe("DevToolsApp settings", () => {
  it("opens with Ctrl+, and lets the theme follow the system again", async () => {
    localStorage.setItem("devtools-theme-preference", "light");
    render(<DevToolsApp />);
    expect(document.documentElement).not.toHaveClass("dark");

    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "System" }));

    // The mocked system appearance is dark.
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(localStorage.getItem("devtools-theme-preference")).toBe("system");
  });

  it("stops paste suggestions when the user turns them off", async () => {
    render(<DevToolsApp />);
    openSettings();
    fireEvent.click(screen.getByRole("switch", { name: "Suggest a tool when I paste" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(localStorage.getItem("devtools-paste-suggestions")).toBe("false");

    paste('{"a": 1}');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Looks like JSON.")).toBeNull();
  });

  it("starts with the sidebar closed when the user turned it off", () => {
    localStorage.setItem("devtools-sidebar-on-launch", "false");
    render(<DevToolsApp />);
    expect(document.querySelector("[data-sidebar-open]")).toHaveAttribute("data-sidebar-open", "false");
  });

  it("clears favorites and recent tools", () => {
    localStorage.setItem("devtools-favorites", JSON.stringify(["json-viewer"]));
    localStorage.setItem("devtools-recent-tools", JSON.stringify(["json-viewer", "base64"]));
    render(<DevToolsApp />);
    openSettings();

    fireEvent.click(screen.getByRole("button", { name: "Clear favorites" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear recent tools" }));

    expect(screen.getByRole("button", { name: "Clear favorites" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear recent tools" })).toBeDisabled();
    expect(localStorage.getItem("devtools-favorites")).toBe("[]");
    expect(localStorage.getItem("devtools-recent-tools")).toBe("[]");
  });

  it("opens the About section with the support links from the sidebar", () => {
    render(<DevToolsApp />);
    fireEvent.click(screen.getByRole("button", { name: "Support DevTools" }));

    expect(screen.getByRole("button", { name: "About" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Patreon/ })).toHaveAttribute("href", "https://www.patreon.com/ahmed_shamim");
    expect(screen.getByRole("link", { name: /Buy me a coffee/ })).toHaveAttribute("href", "https://ahmedshamim.gumroad.com/coffee");
  });
});
