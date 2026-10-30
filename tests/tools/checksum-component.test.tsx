import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Checksum } from "@/components/tools/Checksum";

const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const openFile = (file: File) => fireEvent.change(screen.getByLabelText("Checksum file"), { target: { files: [file] } });

describe("Checksum", () => {
  it("calculates a CRC and switches to Luhn generation", async () => {
    render(<Checksum />);
    change("Input", "123456789");
    expect(await screen.findByText("CBF43926")).toBeInTheDocument();
    change("Checksum operation", "generate");
    change("Input", "7992739871");
    expect(await screen.findByText("79927398713")).toBeInTheDocument();
    change("Input", "invalid");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("digits"));
  });

  it("reads a file, clears back to text, and reads the same file again", async () => {
    render(<Checksum />);
    const file = new File(["123456789"], "fixture.txt");
    openFile(file);
    expect(await screen.findByText("CBF43926")).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>("Checksum file").value).toBe("");
    fireEvent.click(screen.getByText("Clear file"));
    expect(screen.getByLabelText("Input")).toBeInTheDocument();
    openFile(file);
    expect(await screen.findByText("fixture.txt · 9 bytes")).toBeInTheDocument();
  });
});
