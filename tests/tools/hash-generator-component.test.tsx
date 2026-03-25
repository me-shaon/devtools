import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HashGenerator } from "@/components/tools/HashGenerator";

describe("HashGenerator", () => {
  it("generates hashes after the input changes", async () => {
    render(<HashGenerator />);

    fireEvent.change(screen.getByPlaceholderText("Enter text to generate hashes..."), {
      target: { value: "hello" },
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("SHA-256 hash will appear here...")).toHaveValue(
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
      );
    });

    expect(screen.getByPlaceholderText("SHA-1 hash will appear here...")).toHaveValue(
      "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d"
    );
  });
});
