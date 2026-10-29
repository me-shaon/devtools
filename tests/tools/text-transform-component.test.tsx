import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LineTools } from "@/components/tools/LineTools";
import { runRegexInWorker } from "@/utils/regex-runner";

vi.mock("@/utils/regex-runner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/regex-runner")>()),
  runRegexInWorker: vi.fn(),
}));

const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const openMode = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });

afterEach(() => vi.clearAllMocks());

describe("Line Tools Transform mode", () => {
  it("transforms text and reports numeric errors", async () => {
    render(<LineTools />);
    openMode("Transform");
    change("Input", "a,b,c");
    expect(await screen.findByText(/^a\s+b\s+c$/)).toBeInTheDocument();
    change("Transformation", "sum");
    change("Input", "2\n3");
    expect(await screen.findByText("5")).toBeInTheDocument();
    change("Input", "2\nx");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Not a number"));
  });

  it("shares the text with Process mode and keeps its options across modes", async () => {
    render(<LineTools />);
    change("Lines", "b\na");
    openMode("Transform");
    expect(screen.getByLabelText("Input")).toHaveValue("b\na");
    change("Transformation", "join");
    change("Separator", ";");
    openMode("Process");
    openMode("Transform");
    expect(screen.getByLabelText("Transformation")).toHaveValue("join");
    expect(await screen.findByText("b;a")).toBeInTheDocument();
  });

  it("runs regex replacement through the shared regex runner", async () => {
    vi.mocked(runRegexInWorker).mockResolvedValue({ ok: true, matches: [], truncated: false, replaced: "x-x" });
    render(<LineTools />);
    openMode("Transform");
    change("Transformation", "regex");
    change("Input", "a1a");
    change("Find", "\\d");
    change("Replacement", "-");
    // Each field settles on its own debounce, so wait for the run that has all three values.
    await waitFor(() =>
      expect(runRegexInWorker).toHaveBeenLastCalledWith(expect.objectContaining({ pattern: "\\d", flags: "g", text: "a1a", replacement: "-" })),
    );
    expect(await screen.findByText("x-x")).toBeInTheDocument();
  });

  it("shows a regex error and refuses replacements that could grow too large", async () => {
    vi.mocked(runRegexInWorker).mockResolvedValue({ ok: false, error: "Invalid pattern: bad" });
    render(<LineTools />);
    openMode("Transform");
    change("Transformation", "regex");
    change("Input", "abc");
    change("Find", "(");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Invalid pattern"));
    change("Input", "a".repeat(5000));
    change("Find", "a");
    change("Replacement", "$`");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("too large"));
    expect(runRegexInWorker).not.toHaveBeenCalledWith(expect.objectContaining({ replacement: "$`" }));
  });
});
