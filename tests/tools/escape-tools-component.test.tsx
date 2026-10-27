import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EscapeTools } from "@/components/tools/EscapeTools";

describe("EscapeTools", () => {
  it("escapes HTML and swaps the result into the decoder", async () => {
    render(<EscapeTools />);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "<b>&</b>" } });
    expect(await screen.findByDisplayValue("&lt;b&gt;&amp;&lt;/b&gt;")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect(screen.getByLabelText("Escaped text")).toHaveValue("&lt;b&gt;&amp;&lt;/b&gt;");
    expect(await screen.findByDisplayValue("<b>&</b>")).toBeInTheDocument();
  });

  it("reports invalid hex inline", async () => {
    render(<EscapeTools />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Hex" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Decode" }));
    fireEvent.change(screen.getByLabelText("Hex"), { target: { value: "486" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/3 digits/);
  });

  it("escapes Unicode with braces when asked", async () => {
    render(<EscapeTools />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Unicode" }));
    fireEvent.click(screen.getByRole("switch", { name: "Use \\u{…}" }));
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "a\u{1F600}" } });
    expect(await screen.findByDisplayValue("a\\u{1F600}")).toBeInTheDocument();
  });
});
