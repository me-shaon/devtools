import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UrlEncoder } from "@/components/tools/UrlEncoder";

describe("UrlEncoder", () => {
  it("encodes as the user types and swaps the result into the decoder", async () => {
    render(<UrlEncoder />);
    fireEvent.change(screen.getByPlaceholderText(/Enter text to encode/), { target: { value: "a b&c" } });
    expect(await screen.findByDisplayValue("a%20b%26c")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect(screen.getByPlaceholderText(/Enter URL-encoded text/)).toHaveValue("a%20b%26c");
    expect(await screen.findByDisplayValue("a b&c")).toBeInTheDocument();
  });

  it("encodes spaces as + when asked", async () => {
    render(<UrlEncoder />);
    fireEvent.click(screen.getByRole("switch", { name: "Spaces as +" }));
    fireEvent.change(screen.getByPlaceholderText(/Enter text to encode/), { target: { value: "a b" } });
    expect(await screen.findByDisplayValue("a+b")).toBeInTheDocument();
  });

  it("reports malformed percent-encoding inline", async () => {
    render(<UrlEncoder />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Decode" }));
    fireEvent.change(screen.getByPlaceholderText(/Enter URL-encoded text/), { target: { value: "%E0%A4%A" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Invalid percent-encoding/);
  });

  it("parses a URL and rebuilds it after a parameter edit", async () => {
    render(<UrlEncoder />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Parse URL" }));
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://example.com/p?q=1" } });
    const value = await screen.findByLabelText("Parameter 1 value");
    fireEvent.change(value, { target: { value: "two words" } });
    expect(screen.getByLabelText("Rebuilt URL")).toHaveValue("https://example.com/p?q=two%20words");
  });
});
