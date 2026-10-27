import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CurlToCode } from "@/components/tools/CurlToCode";

const COMMAND = "curl -s https://api.example.com/v1/items -H 'Authorization: Bearer abc' --json '{\"a\":1}'";

describe("CurlToCode", () => {
  it("converts a command, switches language, and summarises the request", async () => {
    render(<CurlToCode />);
    fireEvent.change(screen.getByLabelText("cURL command"), { target: { value: COMMAND } });

    const output = (await screen.findByLabelText("JavaScript")) as HTMLTextAreaElement;
    expect(output.value).toContain('await fetch("https://api.example.com/v1/items"');
    expect(screen.getByText("POST")).toBeInTheDocument();
    expect(screen.getByText("api.example.com/v1/items")).toBeInTheDocument();
    expect(screen.getByText("3 headers")).toBeInTheDocument();
    expect(screen.getByText("JSON body")).toBeInTheDocument();
    expect(screen.getByText("Ignored flags: -s")).toBeInTheDocument();
    expect(screen.getByText(/To mask them before you share it/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy JavaScript/ })).toBeEnabled();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Rust" }));
    await waitFor(() => expect((screen.getByLabelText("Rust") as HTMLTextAreaElement).value).toContain("reqwest::blocking"));
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect((screen.getByLabelText("Rust") as HTMLTextAreaElement).value).toContain("#[tokio::main]"));
  });

  it("shows parse errors inline", async () => {
    render(<CurlToCode />);
    fireEvent.change(screen.getByLabelText("cURL command"), { target: { value: "curl 'https://x.test" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Unterminated single quote \(line 1, column 6\)/);
    expect(screen.getByText("Invalid command")).toBeInTheDocument();
  });
});
