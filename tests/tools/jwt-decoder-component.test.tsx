import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JwtDecoder } from "@/components/tools/JwtDecoder";
import { generateJwtKeyPair, signJwt } from "@/utils/jwt";

const tokenField = () => screen.getByPlaceholderText(/eyJhbGciOiJIUzI1Ni/);

describe("JwtDecoder", () => {
  it("labels expiration honestly and shows the verification warning", async () => {
    const futureJwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjk5OTk5OTk5OTksImlhdCI6MTUxNjIzOTAyMn0.f_dummy_signature";

    render(<JwtDecoder />);
    fireEvent.change(tokenField(), { target: { value: futureJwt } });

    expect((await screen.findAllByText(/^Expires in /)).length).toBeGreaterThan(0);
    expect(screen.getByText("Signature not checked")).toBeInTheDocument();
    expect(screen.getByText("Issued at (iat)")).toBeInTheDocument();
    expect(screen.getByText(/\(\d+ y( \d+ d)? ago\)$/)).toBeInTheDocument();
    expect(screen.getByText("What is a JWT?")).toBeInTheDocument();
  });

  it("shows an expired token clearly", async () => {
    const expired = await signJwt({ alg: "HS256", typ: "JWT" }, { exp: Math.floor(Date.now() / 1000) - 7200 }, "s");
    render(<JwtDecoder />);
    fireEvent.change(tokenField(), { target: { value: expired } });

    const labels = await screen.findAllByText("Expired 2 h ago");
    expect(labels[0]).toHaveClass("text-destructive");
  });

  it("shows decode errors inline", async () => {
    render(<JwtDecoder />);
    fireEvent.change(tokenField(), { target: { value: "not-a-jwt" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Invalid JWT/);
  });

  it("verifies an HS256 token with the secret", async () => {
    const token = await signJwt({ alg: "HS256", typ: "JWT" }, { sub: "a" }, "s3cret");
    render(<JwtDecoder />);
    fireEvent.change(tokenField(), { target: { value: token } });

    fireEvent.change(await screen.findByLabelText("Secret"), { target: { value: "s3cret" } });
    expect(await screen.findByText("Signature valid")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Secret"), { target: { value: "wrong" } });
    expect(await screen.findByText("Signature invalid")).toBeInTheDocument();
  });

  it("verifies an ES256 token with a PEM public key", async () => {
    const { privateKeyPem, publicKeyPem } = await generateJwtKeyPair("ES256");
    const token = await signJwt({ alg: "ES256", typ: "JWT" }, { sub: "a" }, privateKeyPem);
    render(<JwtDecoder />);
    fireEvent.change(tokenField(), { target: { value: token } });

    expect(screen.queryByLabelText("Secret")).not.toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("Public key"), { target: { value: publicKeyPem } });
    expect(await screen.findByText("Signature valid")).toBeInTheDocument();
  });

  it("signs a token live in the Encode tab and opens it in the decoder", async () => {
    render(<JwtDecoder />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Encode" }));

    expect(await screen.findByText("Enter a secret to sign the token")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Secret"), { target: { value: "s3cret" } });
    fireEvent.change(screen.getByLabelText("Payload JSON"), { target: { value: '{"sub":"tester"}' } });

    const output = await screen.findByLabelText("Signed token");
    await waitFor(() => expect(output.textContent).toMatch(/^eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+$/));

    fireEvent.click(screen.getByRole("button", { name: "Decode" }));
    expect(await screen.findByText("Signature valid")).toBeInTheDocument();
    expect(screen.getByText(/"sub": "tester"/)).toBeInTheDocument();
  });

  it("reports invalid payload JSON while encoding", async () => {
    render(<JwtDecoder />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Encode" }));
    fireEvent.change(screen.getByLabelText("Payload JSON"), { target: { value: "{" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Payload is not valid JSON/);
  });

  it("generates a key pair for RS256 and shows the public key", async () => {
    render(<JwtDecoder />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Encode" }));
    fireEvent.change(screen.getByLabelText("Algorithm"), { target: { value: "RS256" } });
    expect(screen.getByLabelText("Header JSON")).toHaveValue('{\n  "alg": "RS256",\n  "typ": "JWT"\n}');

    fireEvent.click(screen.getByRole("button", { name: "Generate key pair" }));
    await waitFor(() => expect((screen.getByLabelText("Private key") as HTMLTextAreaElement).value).toMatch(/^-----BEGIN PRIVATE KEY-----/), { timeout: 5000 });
    expect(await screen.findByText("Public key (PEM)", {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Signed token").textContent).toMatch(/^eyJ/));

    fireEvent.click(screen.getByRole("button", { name: "Decode" }));
    expect(await screen.findByText("Signature valid")).toBeInTheDocument();
  }, 15000);

  it("copies a decoded token into the encoder with Edit and sign", async () => {
    const token = await signJwt({ alg: "HS384", typ: "JWT", kid: "k1" }, { role: "admin" }, "s");
    render(<JwtDecoder />);
    fireEvent.change(tokenField(), { target: { value: token } });
    fireEvent.click(await screen.findByRole("button", { name: "Edit and sign" }));

    expect(screen.getByLabelText("Header JSON")).toHaveValue('{\n  "alg": "HS384",\n  "typ": "JWT",\n  "kid": "k1"\n}');
    expect(screen.getByLabelText("Payload JSON")).toHaveValue('{\n  "role": "admin"\n}');
    expect(screen.getByLabelText("Algorithm")).toHaveValue("HS384");
  });
});
