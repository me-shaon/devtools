import { fireEvent, render, screen } from "@testing-library/react";
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
});
