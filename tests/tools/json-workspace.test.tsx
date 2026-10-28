import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonViewer } from "@/components/tools/JsonViewer";
import DevToolsApp from "@/app/DevToolsApp";

const sample = '{"project":"DevTools","tools":["JSON","JWT"]}';
const output = () => screen.getByRole("region", { name: "Output" });
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("JSON workspace", () => {
  it("formats without changing data, switches orientation, and minifies", () => {
    render(<JsonViewer />);
    fireEvent.change(screen.getByRole("textbox", { name: "JSON Input" }), { target: { value: sample } });
    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    const code = () => [...output().querySelectorAll("code")].map(el => el.textContent).join("\n");
    expect(JSON.parse(code())).toEqual(JSON.parse(sample));
    fireEvent.click(screen.getByRole("button", { name: "Below" }));
    expect(screen.getByRole("button", { name: "Below" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("devtools-json-layout")).toBe("below");
    expect(JSON.parse(code())).toEqual(JSON.parse(sample));
    fireEvent.click(screen.getByRole("button", { name: "Minify" }));
    expect(code()).toBe(sample);
  });
  it("clears stale output and reports invalid input", () => {
    render(<JsonViewer />);
    const input = screen.getByRole("textbox", { name: "JSON Input" });
    fireEvent.change(input, { target: { value: sample } });
    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    fireEvent.change(input, { target: { value: '{"broken":' } });
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid JSON");
    expect(output().querySelector("code")).toBeNull();
  });
  it("copies exactly the formatted content", async () => {
    render(<JsonViewer />);
    fireEvent.change(screen.getByRole("textbox", { name: "JSON Input" }), { target: { value: sample } });
    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify(JSON.parse(sample), null, 2)));
  });
  it("keeps JSON state while navigating tabs, then removes a closed tab", async () => {
    render(<DevToolsApp />);
    fireEvent.click(screen.getByRole("button", { name: "JSON Viewer" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "JSON Input" }), { target: { value: sample } });
    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Code Playground" }));
    await screen.findByRole("button", { name: "Run" }, { timeout: 5000 });
    fireEvent.click(screen.getByRole("tab", { name: "JSON Viewer" }));
    expect(screen.getByRole("textbox", { name: "JSON Input" })).toHaveValue(sample);
    expect(within(output()).getByText('"DevTools"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close JSON Viewer" }));
    expect(screen.queryByRole("tab", { name: "JSON Viewer" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Code Playground" })).toHaveAttribute("aria-selected", "true");
  }, 20000);
});
