import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyGenerator } from "@/components/tools/KeyGenerator";
import { ED25519_PUBLIC, FINGERPRINTS, RSA_PRIVATE, RSA_PUBLIC } from "./key-generator.fixtures";

const saveFile = vi.fn(async (_data: Blob, _name: string) => true);
vi.mock("@/lib/desktop", () => ({ saveFile: (data: Blob, name: string) => saveFile(data, name) }));

afterEach(() => {
  vi.restoreAllMocks();
  saveFile.mockClear();
});

const keyInput = () => screen.getByLabelText("Key") as HTMLTextAreaElement;
const block = (name: string) => screen.getByRole("region", { name });
const showFormat = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });

describe("KeyGenerator", () => {
  it("generates an Ed25519 key on open and shows every format", async () => {
    render(<KeyGenerator />);
    await waitFor(() => expect(keyInput().value).toMatch(/^-----BEGIN PRIVATE KEY-----/));
    await waitFor(() => expect(screen.getByTestId("ssh-fingerprint")).toHaveTextContent(/^SHA256:/));
    expect(screen.getByRole("status")).toHaveTextContent("Keys are generated on this device and never leave it.");
    expect(screen.getByText("Ed25519 · private key")).toBeInTheDocument();
    expect(block("Public key (SPKI)")).toHaveTextContent("-----BEGIN PUBLIC KEY-----");

    showFormat("OpenSSH");
    expect(block("OpenSSH public key")).toHaveTextContent(/^OpenSSH public key\s*ssh-ed25519 AAAA/);
    expect(block("OpenSSH private key")).toHaveTextContent("-----BEGIN OPENSSH PRIVATE KEY-----");

    showFormat("JWK");
    const thumbprint = screen.getByTestId("jwk-thumbprint").textContent!;
    const publicJwk = JSON.parse(within(block("Public JWK")).getByText(/"kty"/).textContent!);
    expect(publicJwk).toMatchObject({ kty: "OKP", crv: "Ed25519", kid: thumbprint, use: "sig", alg: "EdDSA" });
  });

  it("makes a new key when the key type changes", async () => {
    render(<KeyGenerator />);
    await waitFor(() => expect(screen.getByText("Ed25519 · private key")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Key type"), { target: { value: "ec-p384" } });
    await waitFor(() => expect(screen.getByText("ECDSA P-384 · private key")).toBeInTheDocument());
    expect(screen.getByLabelText("alg")).toHaveValue("ES384");

    showFormat("OpenSSH");
    expect(block("OpenSSH public key")).toHaveTextContent("ecdsa-sha2-nistp384");
  });

  it("applies the kid, use, alg and SSH comment", async () => {
    render(<KeyGenerator />);
    await waitFor(() => expect(screen.getByText("Ed25519 · private key")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Key type"), { target: { value: "rsa-2048" } });
    await waitFor(() => expect(screen.getByText("RSA 2048-bit · private key")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("kid"), { target: { value: "key-1" } });
    fireEvent.change(screen.getByLabelText("use"), { target: { value: "enc" } });
    fireEvent.change(screen.getByLabelText("SSH comment"), { target: { value: "me@laptop" } });
    expect(screen.getByLabelText("alg")).toHaveValue("RSA-OAEP");

    showFormat("JWK");
    await waitFor(() => {
      const jwk = JSON.parse(within(block("Public JWK")).getByText(/"kty"/).textContent!);
      expect(jwk).toMatchObject({ kty: "RSA", kid: "key-1", use: "enc", alg: "RSA-OAEP" });
    });
    showFormat("OpenSSH");
    await waitFor(() => expect(block("OpenSSH public key")).toHaveTextContent(/ me@laptop$/));
  });

  it("converts a pasted ssh-keygen key and keeps its comment", async () => {
    render(<KeyGenerator />);
    await waitFor(() => expect(keyInput().value).not.toBe(""));
    fireEvent.change(keyInput(), { target: { value: RSA_PRIVATE } });
    await waitFor(() => expect(screen.getByTestId("ssh-fingerprint")).toHaveTextContent(FINGERPRINTS.rsa));
    expect(screen.getByText("RSA 2048-bit · private key")).toBeInTheDocument();
    showFormat("OpenSSH");
    expect(within(block("OpenSSH public key")).getByText(/ssh-rsa/).textContent).toBe(RSA_PUBLIC);
  });

  it("inspects a public key and explains that private formats need a private key", async () => {
    render(<KeyGenerator />);
    await waitFor(() => expect(keyInput().value).not.toBe(""));
    fireEvent.change(keyInput(), { target: { value: ED25519_PUBLIC } });
    await waitFor(() => expect(screen.getByTestId("ssh-fingerprint")).toHaveTextContent(FINGERPRINTS.ed25519));
    expect(screen.getByText("Ed25519 · public key")).toBeInTheDocument();
    expect(screen.getByText("This is a public key. Paste or generate a private key to see the private formats.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Private key (PKCS#8)" })).not.toBeInTheDocument();
  });

  it("shows an error for text that is not a key", async () => {
    render(<KeyGenerator />);
    await waitFor(() => expect(keyInput().value).not.toBe(""));
    fireEvent.change(keyInput(), { target: { value: "not a key" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("The text is not a key. Paste a PEM, JWK, or OpenSSH key.");
  });

  it("saves the OpenSSH private key with a final newline", async () => {
    render(<KeyGenerator />);
    await waitFor(() => expect(screen.getByText("Ed25519 · private key")).toBeInTheDocument());
    showFormat("OpenSSH");
    fireEvent.click(screen.getByRole("button", { name: "Save OpenSSH private key" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalled());
    const [blob, name] = saveFile.mock.calls[0];
    expect(name).toBe("id_ed25519");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    expect(text).toMatch(/-----END OPENSSH PRIVATE KEY-----\n$/);
  });

  it("explains when the system does not support Ed25519", async () => {
    const generateKey = crypto.subtle.generateKey.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "generateKey").mockImplementation(((algorithm: AlgorithmIdentifier, ...rest: [boolean, KeyUsage[]]) => {
      if ((algorithm as Algorithm).name === "Ed25519") return Promise.reject(new DOMException("Unsupported", "NotSupportedError"));
      return generateKey(algorithm, ...rest);
    }) as typeof crypto.subtle.generateKey);
    render(<KeyGenerator />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This system does not support Ed25519 keys. Choose an ECDSA or RSA key, or update the system.");

    fireEvent.change(screen.getByLabelText("Key type"), { target: { value: "ec-p256" } });
    await waitFor(() => expect(screen.getByText("ECDSA P-256 · private key")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
