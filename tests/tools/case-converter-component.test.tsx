import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaseConverter } from "@/components/tools/CaseConverter";

describe("CaseConverter", () => {
  it("shows every case live, without a convert button", async () => {
    render(<CaseConverter />);
    expect(screen.queryByRole("button", { name: /convert/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Input"), { target: { value: "HTTPServerID" } });

    await waitFor(() => expect(screen.getByLabelText("snake_case")).toHaveValue("http_server_id"));
    expect(screen.getByLabelText("camelCase")).toHaveValue("httpServerId");
    expect(screen.getByLabelText("Train-Case")).toHaveValue("Http-Server-Id");
    expect(screen.getByRole("button", { name: "Copy snake_case" })).toBeEnabled();
  });

  it("converts one name per line", async () => {
    render(<CaseConverter />);
    fireEvent.change(screen.getByLabelText("Input"), { target: { value: "user id\nuserIDs" } });
    await waitFor(() => expect(screen.getByLabelText("kebab-case")).toHaveValue("user-id\nuser-ids"));
    expect(screen.getByText("2 lines")).toBeInTheDocument();
  });

  it("keeps acronyms when the switch is on", async () => {
    render(<CaseConverter />);
    fireEvent.change(screen.getByLabelText("Input"), { target: { value: "user_ID" } });
    await waitFor(() => expect(screen.getByLabelText("PascalCase")).toHaveValue("UserId"));

    fireEvent.click(screen.getByRole("switch", { name: "Keep acronyms" }));
    await waitFor(() => expect(screen.getByLabelText("PascalCase")).toHaveValue("UserID"));
    expect(screen.getByLabelText("snake_case")).toHaveValue("user_id");
  });

  it("shows a URL slug with its options", async () => {
    render(<CaseConverter />);
    fireEvent.change(screen.getByLabelText("Input"), { target: { value: "Crème Brûlée Straße" } });
    await waitFor(() => expect(screen.getByLabelText("slug")).toHaveValue("creme-brulee-strasse"));

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Underscore" }));
    fireEvent.click(screen.getByRole("switch", { name: "Keep case" }));
    await waitFor(() => expect(screen.getByLabelText("slug")).toHaveValue("Creme_Brulee_Strasse"));

    fireEvent.change(screen.getByLabelText("Max length"), { target: { value: "13" } });
    await waitFor(() => expect(screen.getByLabelText("slug")).toHaveValue("Creme_Brulee"));
  });
});
