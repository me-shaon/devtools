import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JwtDecoder } from "@/components/tools/JwtDecoder";

describe("JwtDecoder", () => {
  it("labels expiration honestly and shows the verification warning", async () => {
    const futureJwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjk5OTk5OTk5OTksImlhdCI6MTUxNjIzOTAyMn0.f_dummy_signature";

    render(<JwtDecoder />);

    fireEvent.change(screen.getByPlaceholderText(/eyJhbGciOiJIUzI1Ni/), {
      target: { value: futureJwt },
    });
    fireEvent.click(screen.getByRole("button", { name: "Decode JWT" }));

    expect(await screen.findByText("Expiration Status")).toBeInTheDocument();
    expect(screen.getByText("Not expired")).toBeInTheDocument();
    expect(screen.getByText("Token decoded locally. Signature not verified.")).toBeInTheDocument();
    expect(screen.getByText("What is a JWT?")).toBeInTheDocument();
  });
});
