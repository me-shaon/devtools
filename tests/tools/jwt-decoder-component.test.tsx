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

    expect(await screen.findByText(/^Expires in /)).toBeInTheDocument();
    expect(screen.getByText("Signature not checked")).toBeInTheDocument();
    expect(screen.getByText("What is a JWT?")).toBeInTheDocument();
  });

  it("shows decode errors inline", async () => {
    render(<JwtDecoder />);

    fireEvent.change(screen.getByPlaceholderText(/eyJhbGciOiJIUzI1Ni/), {
      target: { value: "not-a-jwt" },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/Invalid JWT/);
  });
});
