import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Asn1Inspector } from "@/components/tools/Asn1Inspector";

describe("Asn1Inspector", () => {
  it("opens the example structure and reports truncation", async () => {
    render(<Asn1Inspector />);
    fireEvent.click(screen.getByText("Example"));
    await waitFor(() => expect(screen.getByText("SEQUENCE")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("ASN.1 data"), { target: { value: "02 02 01" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("beyond"));
  });

  it("reads the same file again after Clear file", async () => {
    render(<Asn1Inspector />);
    const file = new File([new Uint8Array([0x05, 0x00])], "null.der");
    const open = () => fireEvent.change(screen.getByLabelText("Open DER file"), { target: { files: [file] } });
    open();
    expect(await screen.findByText("null.der · 2 bytes")).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>("Open DER file").value).toBe("");
    fireEvent.click(screen.getByText("Clear file"));
    open();
    expect(await screen.findByText("null.der · 2 bytes")).toBeInTheDocument();
  });
});
