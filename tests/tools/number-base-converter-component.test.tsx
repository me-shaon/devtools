import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NumberBaseConverter } from "@/components/tools/NumberBaseConverter";

const type = (value: string) => fireEvent.change(screen.getByLabelText("Number"), { target: { value } });

describe("NumberBaseConverter", () => {
  it("shows every base as the user types, with no convert button", async () => {
    render(<NumberBaseConverter />);
    type("0xFF");
    expect(await screen.findByTestId("value-Binary")).toHaveTextContent("11111111");
    expect(screen.getByTestId("value-Octal")).toHaveTextContent("377");
    expect(screen.getByTestId("value-Decimal")).toHaveTextContent("255");
    expect(screen.getByTestId("value-Hexadecimal")).toHaveTextContent("FF");
    expect(screen.getByTestId("value-Base 36")).toHaveTextContent("73");
    expect(screen.getByText("Read as hexadecimal.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convert" })).toBeNull();
  });

  it("uses the selected input base", async () => {
    render(<NumberBaseConverter />);
    fireEvent.click(screen.getByRole("button", { name: "Bin" }));
    type("1010");
    expect(await screen.findByTestId("value-Decimal")).toHaveTextContent("10");
  });

  it("shows an error for an invalid digit", async () => {
    render(<NumberBaseConverter />);
    fireEvent.click(screen.getByRole("button", { name: "Oct" }));
    type("19");
    expect(await screen.findByRole("alert")).toHaveTextContent('"9" is not a valid base 8 digit.');
  });

  it("changes the custom base", async () => {
    render(<NumberBaseConverter />);
    fireEvent.change(screen.getByLabelText("Custom base"), { target: { value: "32" } });
    type("1024");
    expect(await screen.findByTestId("value-Base 32")).toHaveTextContent("100");
  });

  it("groups digits for display only", async () => {
    render(<NumberBaseConverter />);
    fireEvent.click(screen.getByRole("switch", { name: "Group digits" }));
    type("1000000");
    expect(await screen.findByTestId("value-Decimal")).toHaveTextContent("1 000 000");
  });

  it("shows two's complement for the selected width", async () => {
    render(<NumberBaseConverter />);
    type("-1");
    expect(await screen.findByTestId("value-Unsigned")).toHaveTextContent("4294967295");
    expect(screen.getByTestId("value-Hex (32-bit)")).toHaveTextContent("FFFFFFFF");
    fireEvent.click(screen.getByRole("button", { name: "8-bit" }));
    expect(screen.getByTestId("value-Unsigned")).toHaveTextContent("255");
    expect(screen.getByTestId("value-Signed")).toHaveTextContent("-1");
  });

  it("says when the number does not fit the width", async () => {
    render(<NumberBaseConverter />);
    type("300");
    await screen.findByTestId("value-Decimal");
    fireEvent.click(screen.getByRole("button", { name: "8-bit" }));
    expect(screen.getByText("The number does not fit in 8 bits.")).toBeInTheDocument();
  });

  it("evaluates an expression and shows the result in every base", async () => {
    render(<NumberBaseConverter />);
    type("0xff + 0b1010 * 3");
    expect(await screen.findByTestId("value-Decimal")).toHaveTextContent("285");
    expect(screen.getByTestId("value-Hexadecimal")).toHaveTextContent("11D");
    expect(screen.getByText("Read as an expression.")).toBeInTheDocument();
  });

  it("shows a clear error for a bad expression", async () => {
    render(<NumberBaseConverter />);
    type("1 / 0");
    expect(await screen.findByRole("alert")).toHaveTextContent("Division by zero.");
  });

  it("toggles a bit in the grid and shows bit facts", async () => {
    render(<NumberBaseConverter />);
    type("0x12345678");
    expect(await screen.findByTestId("value-Byte-swapped hex")).toHaveTextContent("78563412");
    expect(screen.getByTestId("bit-stats")).toHaveTextContent(
      "Set bits: 13. Highest set bit: 28. Lowest set bit: 3.",
    );
    const bit0 = screen.getByRole("button", { name: "Bit 0" });
    expect(bit0).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(bit0);
    expect(screen.getByLabelText("Number")).toHaveValue("0x12345679");
    await waitFor(() => expect(screen.getByTestId("value-Decimal")).toHaveTextContent("305419897"));
    expect(screen.getByRole("button", { name: "Bit 0" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the bit grid at the selected width", async () => {
    render(<NumberBaseConverter />);
    type("5");
    await screen.findByTestId("value-Decimal");
    fireEvent.click(screen.getByRole("button", { name: "8-bit" }));
    expect(screen.getByRole("button", { name: "Bit 7" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bit 8" })).toBeNull();
  });

  it("shows the Roman numeral, or a note when there is none", async () => {
    render(<NumberBaseConverter />);
    type("1994");
    expect(await screen.findByTestId("value-Roman")).toHaveTextContent("MCMXCIV");
    type("0");
    expect(await screen.findByText("No Roman numeral (1 to 3999 only).")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reads Roman input only with the Roman base", async () => {
    render(<NumberBaseConverter />);
    type("CD");
    expect(await screen.findByTestId("value-Decimal")).toHaveTextContent("205");
    fireEvent.click(screen.getByRole("button", { name: "Roman" }));
    expect(await screen.findByText("Read as a Roman numeral.")).toBeInTheDocument();
    expect(screen.getByTestId("value-Decimal")).toHaveTextContent("400");
    type("IIII");
    expect(await screen.findByRole("alert")).toHaveTextContent("not a valid Roman numeral");
  });
});
