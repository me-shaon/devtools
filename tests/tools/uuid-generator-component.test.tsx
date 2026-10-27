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
    expect(screen.getByText(/v1, v6, and v7 are lightweight local implementations/i)).toBeInTheDocument();
    expect(screen.getByText("Which version should I pick most of the time?")).toBeInTheDocument();
  });

  it("generates RFC 4122 v5 from namespace and name", async () => {
    render(<UUIDGenerator />);
    fireEvent.change(screen.getByLabelText("Version"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "www.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Generate 1 UUID v5/ }));
    const output = (await screen.findByLabelText("Output")) as HTMLTextAreaElement;
    expect(output.value).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("inspects a UUID v7 and a bad value", () => {
    render(<UUIDGenerator />);
    const input = screen.getByLabelText("UUID or ULID");
    fireEvent.change(input, { target: { value: "01890a5d-ac96-774b-bcce-b302099a8057" } });
    expect(screen.getByText("RFC 4122 / RFC 9562")).toBeInTheDocument();
    expect(screen.getByText(/^2023-06-/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "nope" } });
    expect(screen.getByText("Not a valid UUID or ULID")).toBeInTheDocument();
  });

  it("uses a human-friendly label for ULIDs", () => {
    render(<UUIDGenerator />);

    fireEvent.change(screen.getByLabelText("Version"), {
      target: { value: "ulid" },
    });

    expect(screen.getByRole("button", { name: "Generate 5 ULIDs" })).toBeInTheDocument();
  });
});
