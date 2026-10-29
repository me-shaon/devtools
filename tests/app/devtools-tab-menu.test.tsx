import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DevToolsApp from "@/app/DevToolsApp";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

const TOOLS = ["UUID Generator", "Password Generator", "Lorem Ipsum", "Random String"];

const openTools = () => {
  render(<DevToolsApp />);
  const sidebarNav = screen.getAllByRole("navigation")[0];
  fireEvent.click(within(sidebarNav).getByRole("button", { name: /generators/i }));
  for (const name of TOOLS) fireEvent.click(within(sidebarNav).getByRole("button", { name, exact: true }));
};
const tabNames = () => screen.queryAllByRole("tab").map((tab) => tab.textContent);
const openMenu = (name: string) => {
  fireEvent.contextMenu(screen.getByRole("tab", { name }), { clientX: 40, clientY: 30 });
  return screen.getByRole("menu", { name: `${name} tab` });
};

describe("Tab context menu", () => {
  it("closes the other tabs and selects the clicked tab", () => {
    openTools();
    expect(tabNames()).toEqual(TOOLS);
    fireEvent.click(within(openMenu("Password Generator")).getByRole("menuitem", { name: "Close other tabs" }));
    expect(tabNames()).toEqual(["Password Generator"]);
    expect(screen.getByRole("tab", { name: "Password Generator" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the tabs to the right and keeps the selection when it stays open", () => {
    openTools();
    fireEvent.click(screen.getByRole("tab", { name: "UUID Generator" }));
    fireEvent.click(within(openMenu("Password Generator")).getByRole("menuitem", { name: "Close tabs to the right" }));
    expect(tabNames()).toEqual(["UUID Generator", "Password Generator"]);
    expect(screen.getByRole("tab", { name: "UUID Generator" })).toHaveAttribute("aria-selected", "true");
  });

  it("closes all tabs and returns to the home screen", () => {
    openTools();
    fireEvent.click(within(openMenu("Lorem Ipsum")).getByRole("menuitem", { name: "Close all tabs" }));
    expect(tabNames()).toEqual([]);
    expect(within(screen.getByRole("main")).getByText("Quick Access")).toBeInTheDocument();
  });

  it("closes one tab and disables actions that have no tabs to close", () => {
    openTools();
    const menu = openMenu("Random String");
    expect(within(menu).getByRole("menuitem", { name: "Close tabs to the right" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Close", exact: true }));
    expect(tabNames()).toEqual(TOOLS.slice(0, 3));
  });

  it("dismisses the menu with Escape without closing tabs", () => {
    openTools();
    const menu = openMenu("UUID Generator");
    expect(within(menu).getAllByRole("menuitem")[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(within(menu).getByRole("menuitem", { name: "Close other tabs" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(tabNames()).toEqual(TOOLS);
  });
});
