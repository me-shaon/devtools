import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("shows only quick access on a fresh home screen", () => {
    setupMatchMedia();

    render(<DevToolsApp />);

    const main = screen.getByRole("main");

    expect(within(main).getByText("Quick Access")).toBeInTheDocument();
    expect(within(main).queryByText("Recently Used")).not.toBeInTheDocument();
    expect(within(main).queryByText("Favorites")).not.toBeInTheDocument();
  });

  it("opens a tool from quick access after lazy loading", async () => {
    setupMatchMedia();

    render(<DevToolsApp />);

    fireEvent.click(screen.getAllByRole("button", { name: /json viewer/i })[0]);

    await waitFor(() => {
      expect(screen.getByText("JSON Input")).toBeInTheDocument();
    });
  });

  it("shows recently used tools on the home page in most-recent-first order", async () => {
    setupMatchMedia();

    render(<DevToolsApp />);

    fireEvent.click(screen.getAllByRole("button", { name: /json viewer/i })[0]);

    await waitFor(() => {
      expect(screen.getByText("JSON Input")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^home$/i }));
    const sidebarNav = screen.getAllByRole("navigation")[0];
    fireEvent.click(within(sidebarNav).getByRole("button", { name: /generators/i }));
    fireEvent.click(within(sidebarNav).getByRole("button", { name: /^uuid generator$/i }));

    await waitFor(() => {
      expect(screen.getByText("Version")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^home$/i }));

    const main = screen.getByRole("main");

    expect(within(main).getByText("Recently Used")).toBeInTheDocument();
    expect(within(main).getByText("Quick Access")).toBeInTheDocument();
    expect(within(main).queryByText("Favorites")).not.toBeInTheDocument();

    const recentSection = within(main).getByText("Recently Used").parentElement;

    if (!recentSection) {
      throw new Error("Recently Used section not found");
    }

    const recentButtons = within(recentSection).getAllByRole("button", {
      name: /json viewer|uuid generator/i,
    });
    expect(recentButtons[0]).toHaveTextContent("UUID Generator");
    expect(recentButtons[1]).toHaveTextContent("JSON Viewer");
  });

  it("shows favorites on the home page when tools are favorited", async () => {
    setupMatchMedia();

    render(<DevToolsApp />);

    fireEvent.click(screen.getAllByRole("button", { name: /json viewer/i })[0]);

    await waitFor(() => {
      expect(screen.getByText("JSON Input")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /favorite/i }));
    fireEvent.click(screen.getByRole("button", { name: /^home$/i }));

    const main = screen.getByRole("main");

    expect(within(main).getByText("Favorites")).toBeInTheDocument();
    expect(within(main).getByText("Recently Used")).toBeInTheDocument();
    expect(within(main).getByText("Quick Access")).toBeInTheDocument();

    const favoritesSection = within(main).getByText("Favorites").parentElement;

    if (!favoritesSection) {
      throw new Error("Favorites section not found");
    }

    expect(
      within(favoritesSection).getByRole("button", { name: /json viewer/i })
    ).toBeInTheDocument();
  });

  it("filters quick access to avoid tools already shown in recent or favorites", () => {
    setupMatchMedia();

    localStorage.setItem("devtools-recent-tools", JSON.stringify(["json-viewer"]));
    localStorage.setItem("devtools-favorites", JSON.stringify(["json-typescript"]));

    render(<DevToolsApp />);

    const main = screen.getByRole("main");
    const quickAccessSection = within(main).getByText("Quick Access").parentElement;

    if (!quickAccessSection) {
      throw new Error("Quick Access section not found");
    }

    expect(
      within(quickAccessSection).queryByRole("button", { name: /json viewer/i })
    ).not.toBeInTheDocument();
    expect(
      within(quickAccessSection).queryByRole("button", { name: /json to typescript/i })
    ).not.toBeInTheDocument();
    expect(
      within(quickAccessSection).getByRole("button", { name: /code playground/i })
    ).toBeInTheDocument();
    expect(
      within(quickAccessSection).getByRole("button", { name: /regex generator/i })
    ).toBeInTheDocument();
  });

  it("persists recent tools across launches and caps the list at six unique entries", async () => {
    setupMatchMedia();

    localStorage.setItem(
      "devtools-recent-tools",
      JSON.stringify([
        "password-generator",
        "uuid-generator",
        "hash-generator",
        "json-typescript",
        "regex-generator",
        "code-playground",
      ])
    );

    const { unmount } = render(<DevToolsApp />);

    const firstMain = screen.getByRole("main");

    expect(within(firstMain).getByText("Recently Used")).toBeInTheDocument();
    expect(within(firstMain).getByText("Quick Access")).toBeInTheDocument();

    unmount();
    render(<DevToolsApp />);

    const main = screen.getByRole("main");

    expect(within(main).getByText("Recently Used")).toBeInTheDocument();
    expect(within(main).getByText("Quick Access")).toBeInTheDocument();

    const recentSection = within(main).getByText("Recently Used").parentElement;

    if (!recentSection) {
      throw new Error("Recently Used section not found");
    }

    const recentButtons = within(recentSection).getAllByRole("button", {
      name: /code playground|regex generator|json to typescript|hash generator|uuid generator|password generator/i,
    });

    expect(recentButtons).toHaveLength(6);
    expect(recentButtons[0]).toHaveTextContent("Password Generator");
    expect(recentButtons[5]).toHaveTextContent("Code Playground");
    expect(
      within(recentSection).queryByRole("button", { name: /json viewer/i })
    ).not.toBeInTheDocument();
  });
});
