import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SemverCalculator } from "@/components/tools/SemverCalculator";

const results = () =>
  within(screen.getByRole("table", { name: "Version results" }))
    .getAllByRole("row")
    .map((row) => row.textContent);

describe("SemverCalculator", () => {
  it("makes the range the first text field so pasted text lands in it", () => {
    const { container } = render(<SemverCalculator />);
    expect(container.querySelector('input[type="text"]')).toBe(screen.getByLabelText("Range"));
    expect(screen.getByText("When does a pre-release match?")).toBeInTheDocument();
  });

  it("checks each version against an npm range and names the highest match", async () => {
    render(<SemverCalculator />);
    fireEvent.change(screen.getByLabelText("Range"), { target: { value: "^1.2 || ~2.0" } });
    fireEvent.change(screen.getByLabelText("Versions"), { target: { value: "1.1.9\n1.4.2\n1.9.0-beta.1\n2.0.5\n2.1.0" } });

    await waitFor(() =>
      expect(results()).toEqual(["1.1.9No match", "1.4.2Matches", "1.9.0-beta.1Pre-release excluded", "2.0.5MatchesHighest", "2.1.0No match"]),
    );
    expect(screen.getByLabelText("Normalized range")).toHaveTextContent(">=1.2.0 <2.0.0-0 || >=2.0.0 <2.1.0-0");
    expect(screen.getByText("At least 1.2.0 and below 2.0.0.")).toBeInTheDocument();
    expect(screen.getByText(/Highest match:/)).toHaveTextContent("Highest match: 2.0.5");
  });

  it("reads a bare version as a caret requirement in Cargo", async () => {
    render(<SemverCalculator />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Cargo" }));
    await waitFor(() => expect(screen.getByLabelText("Range")).toHaveValue("1.2"));
    fireEvent.change(screen.getByLabelText("Versions"), { target: { value: "1.2.0\n1.9.9\n2.0.0" } });

    await waitFor(() => expect(results()).toEqual(["1.2.0Matches", "1.9.9MatchesHighest", "2.0.0No match"]));
    expect(screen.getByLabelText("Normalized range")).toHaveTextContent(">=1.2.0, <2.0.0");
  });

  it("keeps a typed range when the package manager changes and shows the error", async () => {
    render(<SemverCalculator />);
    fireEvent.change(screen.getByLabelText("Range"), { target: { value: ">=1.2 <1.5" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Cargo" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cargo separates comparators with commas"));
    expect(screen.getByLabelText("Range")).toHaveValue(">=1.2 <1.5");
  });

  it("compares two versions and lists the next versions", async () => {
    render(<SemverCalculator />);
    fireEvent.change(screen.getByLabelText("First version"), { target: { value: "2.0.0-rc.1" } });
    fireEvent.change(screen.getByLabelText("Second version"), { target: { value: "2.0.0-beta.11" } });

    await waitFor(() => expect(screen.getByText("2.0.0-rc.1 is newer than 2.0.0-beta.11.")).toBeInTheDocument());
    expect(screen.getByLabelText("Order")).toHaveTextContent(">");
    expect(screen.getByText("Change between them: prerelease")).toBeInTheDocument();
    const next = within(screen.getByRole("list", { name: "Next versions" }));
    expect(next.getByText("2.0.0-rc.2")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Pre-release id"), { target: { value: "beta" } });
    await waitFor(() => expect(next.getByText("2.0.0-beta.0")).toBeInTheDocument());
  });

  it("points at the invalid version in compare mode", async () => {
    render(<SemverCalculator />);
    fireEvent.change(screen.getByLabelText("Second version"), { target: { value: "1.2" } });

    await waitFor(() => expect(screen.getByLabelText("Second version")).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("alert")).toHaveTextContent("Second version: Not a valid SemVer version.");
  });
});
