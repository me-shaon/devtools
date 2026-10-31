import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodePlayground } from "@/components/tools/CodePlayground";
import type { RunnerMessage } from "@/utils/code-runner";

const runnerFrames = () => document.querySelectorAll<HTMLIFrameElement>('iframe[title="Code runner"]');

const fromFrame = (data: RunnerMessage) =>
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, source: runnerFrames()[0].contentWindow }));
  });

describe("CodePlayground", () => {
  it("runs the code in a sandboxed frame and shows its output", () => {
    render(<CodePlayground />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(runnerFrames()).toHaveLength(1);
    expect(runnerFrames()[0].getAttribute("sandbox")).toBe("allow-scripts");
    expect(screen.getByText("Running...")).toBeInTheDocument();

    fromFrame({ type: "log", text: "Hello, World!" });
    fromFrame({ type: "result", text: null });
    expect(screen.getByText("Hello, World!")).toBeInTheDocument();
  });

  it("shows the return value when nothing is logged", () => {
    render(<CodePlayground />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    fromFrame({ type: "result", text: "42" });
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("shows errors in the error panel", () => {
    render(<CodePlayground />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    fromFrame({ type: "error", message: "x is not defined" });
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("x is not defined")).toBeInTheDocument();
  });

  it("stops the previous run when the code runs again or the tool closes", () => {
    const { unmount } = render(<CodePlayground />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(runnerFrames()).toHaveLength(1);

    unmount();
    expect(runnerFrames()).toHaveLength(0);
  });
});
