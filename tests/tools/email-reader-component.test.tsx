import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveFile = vi.fn(async (_blob: Blob, _name: string) => true);
vi.mock("@/lib/desktop", () => ({ saveFile: (b: Blob, n: string) => saveFile(b, n) }));

import { EmailReader } from "@/components/tools/EmailReader";

const EML = [
  "From: Ada Lovelace <ada@example.com>",
  "To: bob@example.com",
  "Subject: Quarterly plan",
  "Date: Tue, 10 Mar 2026 09:30:00 +0000",
  'Content-Type: multipart/mixed; boundary="b"',
  "",
  "--b",
  "Content-Type: text/html; charset=utf-8",
  "",
  '<p>Hello</p><img src="https://tracker.example/p.gif">',
  "--b",
  'Content-Type: text/plain; name="notes.txt"',
  'Content-Disposition: attachment; filename="notes.txt"',
  "",
  "attachment data",
  "--b--",
  "",
].join("\r\n");

describe("EmailReader", () => {
  beforeEach(() => saveFile.mockClear());

  it("shows the message details, blocks remote images, and saves an attachment", async () => {
    render(<EmailReader />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: EML } });

    expect(await screen.findByRole("heading", { name: "Quarterly plan" })).toBeTruthy();
    const details = screen.getByRole("table", { name: "Message details" });
    expect(details.textContent).toContain("Ada Lovelace");
    expect(details.textContent).toContain("bob@example.com");
    expect(screen.getByRole("status").textContent).toContain("Remote images blocked");
    expect(screen.getByTitle("Email preview").getAttribute("sandbox")).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Save notes.txt" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(saveFile.mock.calls[0][1]).toBe("notes.txt");
  });

  it("reports text that is not an email", async () => {
    render(<EmailReader />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "hello world" } });
    expect((await screen.findByRole("alert")).textContent).toContain("does not look like an email");
  });
});
