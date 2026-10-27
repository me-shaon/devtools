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
    expect(screen.getByPlaceholderText("SHA-3-256 hash will appear here...")).toHaveValue(
      "3338be694f50c5f338814986cdf0686453a888b84f424d792af4b9202398f392"
    );
    expect(screen.getByPlaceholderText("Keccak-256 hash will appear here...")).toHaveValue(
      "1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8"
    );
    expect(screen.getByPlaceholderText("SHA-384 hash will appear here...")).toHaveValue(
      "59e1748777448c69de6b800d7a33bbfb9ff1b463e44354c3553bcdb9c666fa90125a3c79f90397bdf5f6a13de828684f"
    );
  });

  it("shows HMAC output when a key is set", async () => {
    render(<HashGenerator />);

    fireEvent.change(screen.getByPlaceholderText("Enter text to generate hashes..."), {
      target: { value: "what do ya want for nothing?" },
    });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.change(screen.getByPlaceholderText("Enter secret key..."), {
      target: { value: "Jefe" },
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("HMAC-SHA256 will appear here...")).toHaveValue(
        "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
      );
    });
  });

  it("hashes a selected file and shows its name and size", async () => {
    render(<HashGenerator />);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "File" }));
    const file = new File(["hello"], "greeting.txt", { type: "text/plain" });
    await waitFor(() => expect(document.querySelector('input[type="file"]')).not.toBeNull());
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("SHA-256 hash will appear here...")).toHaveValue(
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
      );
    });
    expect(screen.getByTestId("hash-file-name")).toHaveTextContent("greeting.txt");
    expect(screen.getByText("5 B")).toBeInTheDocument();
  });
});
