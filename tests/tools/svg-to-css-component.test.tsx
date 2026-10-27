import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SvgToCss } from "@/components/tools/SvgToCss";

describe("SvgToCss", () => {
  it("shows data URIs, sizes, and a preview image", async () => {
    render(<SvgToCss />);
    fireEvent.change(screen.getByLabelText("SVG"), {
      target: { value: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#000"/></svg>' },
    });
    const mini = (await screen.findByLabelText(/URL-encoded data URI/, { selector: "textarea" })) as HTMLTextAreaElement;
    expect(mini.value).toBe("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23000'/%3E%3C/svg%3E");
    expect(screen.getByAltText("Preview of the SVG")).toHaveAttribute("src", mini.value);
    expect((screen.getByLabelText(/Base64 data URI/, { selector: "textarea" }) as HTMLTextAreaElement).value).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("warns about scripts and reports parser errors inline", async () => {
    render(<SvgToCss />);
    const input = screen.getByLabelText("SVG");
    fireEvent.change(input, { target: { value: '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>y()</script></svg>' } });
    expect(await screen.findByRole("status")).toHaveTextContent(/1 script and 1 event handler/);
    expect((screen.getByLabelText(/Optimized SVG/, { selector: "textarea" }) as HTMLTextAreaElement).value).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');

    fireEvent.change(input, { target: { value: "<svg><g></svg>" } });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Invalid SVG")).toBeInTheDocument();
  });
});
