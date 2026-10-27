import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SecretRedactor } from "@/components/tools/SecretRedactor";

const GITHUB = `ghp_${"x".repeat(36)}`;

describe("SecretRedactor", () => {
  it("redacts with placeholders, lists findings, and restores an AI reply", async () => {
    render(<SecretRedactor />);
    fireEvent.change(screen.getByLabelText("Text to redact"), {
      target: { value: `mail jane@example.com\ntoken ${GITHUB}` },
    });
    const output = await screen.findByLabelText("Redacted");
    await waitFor(() => expect(output).toHaveValue("mail <EMAIL_1>\ntoken <GITHUB_TOKEN_1>"));
    expect(screen.getByText("2 items redacted · 2 types")).toBeInTheDocument();
    expect(screen.getByText("Email addresses")).toBeInTheDocument();
    expect(screen.getByText("First on line 2")).toBeInTheDocument();
    expect(screen.getByText("The map stays on this device. Copy redacted never includes it.")).toBeInTheDocument();
    expect(screen.queryByText("jane@example.com")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Restore an AI reply"), { target: { value: "Reply to <EMAIL_1>." } });
    expect(await screen.findByLabelText("Restored reply")).toHaveValue("Reply to jane@example.com.");
    expect(screen.getByRole("status")).toHaveTextContent("1 placeholder restored");
  });

  it("switches mask style and toggles detectors", async () => {
    render(<SecretRedactor />);
    fireEvent.change(screen.getByLabelText("Text to redact"), { target: { value: "mail jane@example.com" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Label" }));
    const output = await screen.findByLabelText("Redacted");
    await waitFor(() => expect(output).toHaveValue("mail [REDACTED:email]"));

    fireEvent.click(screen.getByRole("button", { name: /Detectors/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Email addresses" }));
    await waitFor(() => expect(output).toHaveValue("mail jane@example.com"));
    expect(screen.getByText("No items found")).toBeInTheDocument();
  });
});
