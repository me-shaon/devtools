import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IpCidrCalculator } from "@/components/tools/IpCidrCalculator";

const value = (label: string) => screen.getByTestId(`value-${label}`).textContent;

const enter = (text: string) => fireEvent.change(screen.getByLabelText("Address or CIDR block"), { target: { value: text } });

describe("IpCidrCalculator", () => {
  it("makes the address the first text field and shows a default block", () => {
    const { container } = render(<IpCidrCalculator />);
    expect(container.querySelector('input[type="text"]')).toBe(screen.getByLabelText("Address or CIDR block"));
    expect(value("Network address")).toBe("192.168.1.0");
    expect(value("Broadcast address")).toBe("192.168.1.255");
    expect(value("Usable hosts")).toBe("254");
    expect(screen.getByText("192.168.1.10 is a host in the block 192.168.1.0/24.")).toBeInTheDocument();
    expect(screen.getByText("How are IPv6 hosts counted?")).toBeInTheDocument();
  });

  it("reads a dotted netmask and updates as you type", async () => {
    render(<IpCidrCalculator />);
    enter("10.20.30.40 255.255.240.0");
    await waitFor(() => expect(value("CIDR block")).toBe("10.20.16.0/20"));
    expect(value("Wildcard mask")).toBe("0.0.15.255");
    expect(value("Last usable host")).toBe("10.20.31.254");
    expect(value("Hex")).toBe("0x0A141E28");
    expect(value("Reverse DNS name")).toBe("40.30.20.10.in-addr.arpa");
    expect(value("IPv4-mapped IPv6")).toBe("::ffff:10.20.30.40");
    expect(within(screen.getByLabelText("Address type")).getByText("Private")).toBeInTheDocument();
  });

  it("shows no broadcast for a /31", async () => {
    render(<IpCidrCalculator />);
    enter("203.0.113.10/31");
    await waitFor(() => expect(value("Broadcast address")).toBe("None"));
    expect(value("First usable host")).toBe("203.0.113.10");
    expect(value("Last usable host")).toBe("203.0.113.11");
    expect(screen.getByText(/A point-to-point link \(RFC 3021\)/)).toBeInTheDocument();
  });

  it("shows IPv6 forms", async () => {
    render(<IpCidrCalculator />);
    enter("2001:DB8:0:0:0:0:0:1/64");
    await waitFor(() => expect(value("Compressed")).toBe("2001:db8::1"));
    expect(value("Expanded")).toBe("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(value("Netmask")).toBe("ffff:ffff:ffff:ffff::");
    expect(value("Total addresses")).toBe("18,446,744,073,709,551,616 (2^64)");
    expect(screen.queryByTestId("value-Broadcast address")).toBeNull();
  });

  it("shows a specific error for invalid input", async () => {
    render(<IpCidrCalculator />);
    enter("1::2::3");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent('An IPv6 address can have only one "::".'));
    expect(screen.getByLabelText("Address or CIDR block")).toHaveAttribute("aria-invalid", "true");
    enter("10.0.0.300/8");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The fourth part is 300."));
  });

  it("checks if an address is inside the block", async () => {
    render(<IpCidrCalculator />);
    const check = screen.getByLabelText("Address or range to check");
    fireEvent.change(check, { target: { value: "192.168.1.200" } });
    await waitFor(() => expect(screen.getByText("Inside the block.")).toBeInTheDocument());
    fireEvent.change(check, { target: { value: "192.168.0.0/23" } });
    await waitFor(() => expect(screen.getByText(/Partly inside the block/)).toBeInTheDocument());
    fireEvent.change(check, { target: { value: "192.168.2.1" } });
    await waitFor(() => expect(screen.getByText("Outside the block.")).toBeInTheDocument());
  });

  it("splits the block into subnets", async () => {
    render(<IpCidrCalculator />);
    const rows = () =>
      within(screen.getByRole("table", { name: "Subnets" }))
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.cells[0].textContent);
    expect(rows()).toEqual(["192.168.1.0/26", "192.168.1.64/26", "192.168.1.128/26", "192.168.1.192/26"]);

    fireEvent.click(screen.getByRole("button", { name: "Subnet prefix" }));
    fireEvent.change(screen.getByLabelText("Prefix length"), { target: { value: "32" } });
    await waitFor(() => expect(screen.getByText(/256 subnets of \/32/)).toBeInTheDocument());

    enter("10.0.0.0/8");
    await waitFor(() => expect(screen.getByText(/The list shows the first 256/)).toBeInTheDocument());
    expect(rows()).toHaveLength(256);
    expect(screen.getByRole("button", { name: "Copy first 256" })).toBeInTheDocument();
  });

  it("turns a range into blocks and merges a list", async () => {
    render(<IpCidrCalculator />);
    const blocks = () => within(screen.getByRole("list", { name: "CIDR blocks" })).getAllByRole("listitem").map((item) => item.textContent);
    expect(blocks()).toEqual(["10.0.0.5/32", "10.0.0.6/31", "10.0.0.8/29", "10.0.0.16/30", "10.0.0.20/32"]);

    fireEvent.click(screen.getByRole("button", { name: "Merge CIDRs" }));
    fireEvent.change(screen.getByLabelText("Blocks to merge"), { target: { value: "10.0.0.0/24\n10.0.1.0/24\nbad" } });
    await waitFor(() => expect(blocks()).toEqual(["10.0.0.0/23"]));
    expect(screen.getByText(/^Line 3:/)).toBeInTheDocument();
  });
});
