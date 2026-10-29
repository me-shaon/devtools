import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { XmlInspector } from "@/components/tools/XmlInspector";

const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("XmlInspector", () => {
  it("queries XML and reports invalid input without a stale result", async () => {
    render(<XmlInspector />);
    change("XML", "<root><item>one</item><item>two</item></root>");
    change("XML mode", "xpath");
    change("XPath expression", "count(//item)");
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    change("XML", "<root>");
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });
});
