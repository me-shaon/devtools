import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UUIDGenerator } from "@/components/tools/UuidGenerator";

describe("UUIDGenerator", () => {
  it("generates identifiers and shows the implementation notes", async () => {
    render(<UUIDGenerator />);

    fireEvent.change(screen.getByLabelText("Count"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate 2 UUID v4s" }));

    const output = await screen.findByLabelText("Output");
    const lines = (output as HTMLTextAreaElement).value.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(screen.getByText(/v1, v3, v5, v6, and v7 are lightweight local implementations/i)).toBeInTheDocument();
    expect(screen.getByText("Which version should I pick most of the time?")).toBeInTheDocument();
  });

  it("uses a human-friendly label for ULIDs", () => {
    render(<UUIDGenerator />);

    fireEvent.change(screen.getByLabelText("Version"), {
      target: { value: "ulid" },
    });

    expect(screen.getByRole("button", { name: "Generate 5 ULIDs" })).toBeInTheDocument();
  });
});
