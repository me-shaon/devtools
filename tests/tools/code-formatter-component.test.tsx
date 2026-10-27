import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodeFormatter } from "@/components/tools/CodeFormatter";

describe("CodeFormatter", () => {
  it("formats HTML as the user types", async () => {
    render(<CodeFormatter />);
    fireEvent.change(screen.getByLabelText("HTML input"), { target: { value: "<div><p>a</p></div>" } });
    const output = (await screen.findByLabelText("Formatted HTML")) as HTMLTextAreaElement;
    expect(output.value).toBe("<div>\n  <p>a</p>\n</div>");
  });

  it("switches language and mode", async () => {
    render(<CodeFormatter />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "CSS" }));
    fireEvent.change(await screen.findByLabelText("CSS input"), { target: { value: "a { color: red; }" } });
    await waitFor(() => expect((screen.getByLabelText("Formatted CSS") as HTMLTextAreaElement).value).toBe("a {\n  color: red;\n}"));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Minify" }));
    await waitFor(() => expect((screen.getByLabelText("Minified CSS") as HTMLTextAreaElement).value).toBe("a{color:red}"));
    expect(screen.queryByLabelText("Indentation")).toBeNull();
  });

  it("shows the SQL dialect only for SQL and reports parse errors inline", async () => {
    render(<CodeFormatter />);
    expect(screen.queryByLabelText("SQL dialect")).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "SQL" }));
    expect(await screen.findByLabelText("SQL dialect")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("SQL input"), { target: { value: "select ( from" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Parse error/);
    expect(screen.getByText("Invalid input")).toBeInTheDocument();
  });
});
