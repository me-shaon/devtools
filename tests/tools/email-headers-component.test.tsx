import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmailHeaderAnalyzer } from "@/components/tools/EmailHeaderAnalyzer";

const HEADERS = [
  "Received: from mx.relay.example (mx.relay.example [192.0.2.9]) by mx.inbox.example with ESMTPS id 1; Tue, 10 Mar 2026 16:32:30 +0000",
  "Received: from mail.sender.example (mail.sender.example [203.0.113.5]) by mx.relay.example with ESMTP id 2; Tue, 10 Mar 2026 16:30:05 +0000",
  "Authentication-Results: mx.inbox.example; spf=pass smtp.mailfrom=sender.example; dkim=fail header.d=sender.example; dmarc=fail header.from=sender.example",
  "From: Ada <ada@sender.example>",
  "Subject: Invoice",
  "Date: Tue, 10 Mar 2026 16:30:00 +0000",
].join("\n");

describe("EmailHeaderAnalyzer", () => {
  it("shows the hops, the slow hop, and the authentication results", async () => {
    render(<EmailHeaderAnalyzer />);
    fireEvent.change(screen.getByLabelText("Headers"), { target: { value: HEADERS } });

    const hops = await screen.findByRole("table", { name: "Delivery path" });
    const rows = within(hops).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("mail.sender.example");
    expect(rows[0]).toHaveTextContent("203.0.113.5");
    expect(rows[0]).toHaveTextContent("5 s");
    expect(rows[1]).toHaveTextContent("mx.inbox.example");
    expect(within(rows[1]).getByText("2 min 25 s")).toHaveClass("text-warning");
    expect(screen.getByText("Total 2 min 30 s")).toBeInTheDocument();

    const auth = screen.getByRole("table", { name: "Authentication" });
    expect(within(auth).getByText("pass")).toHaveClass("text-success");
    expect(within(auth).getAllByText("fail")).toHaveLength(2);
    expect(screen.getByText("Checked by mx.inbox.example")).toBeInTheDocument();
    expect(screen.getByText("DKIM fail, DMARC fail")).toBeInTheDocument();
  });

  it("shows an error for text without headers and recovers after a valid paste", async () => {
    render(<EmailHeaderAnalyzer />);
    const input = screen.getByLabelText("Headers");
    fireEvent.change(input, { target: { value: "hello world" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("No email headers found");
    fireEvent.change(input, { target: { value: "Subject: Hi\nFrom: a@b.example" } });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText("The headers have no Received lines.")).toBeInTheDocument();
    expect(screen.getByText("0 hops")).toBeInTheDocument();
  });
});
