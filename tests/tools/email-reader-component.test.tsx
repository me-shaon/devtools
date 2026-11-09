import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("keeps the textarea after a paste that is not an email, and shows a name without empty brackets", async () => {
    render(<EmailReader />);
    const input = screen.getByLabelText("Email");
    fireEvent.change(input, { target: { value: "hello world" } });
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Email")).toBe(input);
    fireEvent.change(input, { target: { value: "From: Ada <>\r\nSubject: s\r\n\r\nbody" } });
    const details = await screen.findByRole("table", { name: "Message details" });
    expect(details.textContent).toContain("Ada");
    expect(details.textContent).not.toContain("<>");
  });

  it("follows the app theme in the preview", async () => {
    render(<EmailReader />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: EML } });
    const frame = await screen.findByTitle("Email preview");
    expect(frame.getAttribute("srcdoc")).toContain("color-scheme:light");
    await act(async () => document.documentElement.classList.add("dark"));
    await waitFor(() => expect(screen.getByTitle("Email preview").getAttribute("srcdoc")).toContain("color-scheme:dark"));
    document.documentElement.classList.remove("dark");
  });

  it("reports text that is not an email", async () => {
    render(<EmailReader />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "hello world" } });
    expect((await screen.findByRole("alert")).textContent).toContain("does not look like an email");
  });
});
