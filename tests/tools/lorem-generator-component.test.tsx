import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoremGenerator } from "@/components/tools/LoremGenerator";

const output = () => screen.getByLabelText("Output") as HTMLTextAreaElement;

describe("LoremGenerator", () => {
  it("shows three paragraphs that start with Lorem ipsum on open", async () => {
    render(<LoremGenerator />);
    await waitFor(() => expect(output().value).toMatch(/^Lorem ipsum /));
    expect(output().value.split("\n\n")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /generate lorem/i })).not.toBeInTheDocument();
  });

  it("turns off the Lorem ipsum start", async () => {
    render(<LoremGenerator />);
    fireEvent.click(screen.getByRole("switch", { name: 'Start with "Lorem ipsum"' }));
    await waitFor(() => expect(output().value.startsWith("Lorem ipsum dolor")).toBe(false));
  });

  it("makes unique emails as a JSON array", async () => {
    render(<LoremGenerator />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Emails" }), { button: 0 });
    expect(screen.queryByRole("switch", { name: 'Start with "Lorem ipsum"' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Count"), { target: { value: "4" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "JSON array" }), { button: 0 });

    await waitFor(() => {
      const emails = JSON.parse(output().value) as string[];
      expect(emails).toHaveLength(4);
      expect(new Set(emails).size).toBe(4);
      for (const email of emails) expect(email).toMatch(/@example\.(com|org|net)$/);
    });
    expect(screen.getByText("4 emails")).toBeInTheDocument();
  });

  it("regenerates names one per line", async () => {
    render(<LoremGenerator />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Names" }), { button: 0 });
    await waitFor(() => expect(output().value.split("\n")).toHaveLength(10));
    const first = output().value;
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(output().value).not.toBe(first));
  });
});
