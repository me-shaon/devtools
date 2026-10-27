import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HtmlToJsx } from "@/components/tools/HtmlToJsx";

describe("HtmlToJsx", () => {
  it("converts HTML as the user types and wraps it in a component", async () => {
    render(<HtmlToJsx />);
    fireEvent.change(screen.getByLabelText("HTML"), { target: { value: '<p class="lead">Hi</p>' } });
    expect(await screen.findByDisplayValue('<p className="lead">Hi</p>')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Wrap in a component" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Intro" } });
    expect(await screen.findByDisplayValue(/export function Intro\(\) \{/)).toBeInTheDocument();
  });

  it("reports an invalid component name inline", async () => {
    render(<HtmlToJsx />);
    fireEvent.change(screen.getByLabelText("HTML"), { target: { value: "<p>Hi</p>" } });
    fireEvent.click(screen.getByRole("switch", { name: "Wrap in a component" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "intro" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/capital letter/);
  });
});
