import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { RandomString } from "@/components/tools/RandomString";

beforeEach(() => {
  // The Radix slider measures itself with ResizeObserver, which jsdom lacks.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const outputLines = async () => ((await screen.findByLabelText("Output")) as HTMLTextAreaElement).value.split("\n");

describe("RandomString", () => {
  it("generates Nano IDs by default and shows the entropy", async () => {
    render(<RandomString />);
    const lines = await outputLines();
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(line).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect(screen.getByText("~126 bits")).toBeInTheDocument();
  });

  it("regenerates, applies the count and prefix, and switches to hex", async () => {
    render(<RandomString />);
    const first = (await outputLines()).join("\n");
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect((await outputLines()).join("\n")).not.toBe(first);

    fireEvent.change(screen.getByLabelText("Count"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Prefix"), { target: { value: "id_" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Hex" }), { button: 0 });
    fireEvent.change(screen.getByLabelText("Bytes"), { target: { value: "8" } });

    await waitFor(async () => {
      const lines = await outputLines();
      expect(lines).toHaveLength(2);
      for (const line of lines) expect(line).toMatch(/^id_[0-9a-f]{16}$/);
    });
    expect(screen.getByText("~64 bits")).toBeInTheDocument();
  });

  it("uses a custom alphabet and reports an empty character set", async () => {
    render(<RandomString />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Custom" }), { button: 0 });
    for (const name of ["Lowercase", "Uppercase", "Digits"]) fireEvent.click(screen.getByRole("switch", { name }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Select at least one character set or enter an alphabet.");

    fireEvent.change(screen.getByLabelText("Alphabet"), { target: { value: "xy" } });
    await waitFor(async () => {
      const lines = await outputLines();
      for (const line of lines) expect(line).toMatch(/^[xy]{21}$/);
    });
    expect(screen.getByText("~21 bits")).toBeInTheDocument();
  });
});
