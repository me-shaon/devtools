import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DevToolsApp from "@/app/DevToolsApp";

const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

const paste = (text: string, target: EventTarget = document.body) => {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
  act(() => {
    target.dispatchEvent(event);
  });
};

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false, media: "", addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
    })),
  });
});

afterEach(() => localStorage.clear());

describe("DevToolsApp paste suggestions", () => {
  it("suggests the JWT Decoder for a pasted token and opens it with the token filled in", async () => {
    render(<DevToolsApp />);
    paste(JWT);

    expect(await screen.findByText("Looks like a JWT.")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Enter" });

    expect(await screen.findByRole("tab", { name: /JWT Decoder/ })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(document.querySelector("#panel-jwt-decoder textarea")).toHaveValue(JWT));
  });

  it("ignores pastes into text fields and text it does not recognise", async () => {
    render(<DevToolsApp />);
    paste("hello world");
    const input = screen.getByPlaceholderText("Search...");
    paste(JWT, input);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/Looks like/)).toBeNull();
  });

  it("dismisses the suggestion with Escape", async () => {
    render(<DevToolsApp />);
    paste('{"a": 1}');
    expect(await screen.findByText("Looks like JSON.")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Looks like JSON.")).toBeNull());
  });
});
