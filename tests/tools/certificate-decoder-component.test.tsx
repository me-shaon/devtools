import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CertificateDecoder } from "@/components/tools/CertificateDecoder";
import { loadX509 } from "@/utils/certificate";

const EC = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };

const makeCert = async () => {
  const x509 = await loadX509();
  const keys = (await crypto.subtle.generateKey(EC, true, ["sign", "verify"])) as CryptoKeyPair;
  return x509.X509CertificateGenerator.createSelfSigned({
    name: "CN=component.example.com",
    keys,
    signingAlgorithm: EC,
    notBefore: new Date(Date.now() - 86_400_000),
    notAfter: new Date(Date.now() + 90 * 86_400_000),
    extensions: [new x509.SubjectAlternativeNameExtension([{ type: "dns", value: "component.example.com" }])],
  });
};

describe("CertificateDecoder", () => {
  it("decodes pasted PEM into result rows", async () => {
    const cert = await makeCert();
    render(<CertificateDecoder />);

    fireEvent.change(screen.getByLabelText("PEM input"), { target: { value: cert.toString("pem") } });

    const section = await screen.findByRole("region", { name: /Certificate: CN=component.example.com/ });
    expect(within(section).getByText("Self-signed")).toBeInTheDocument();
    expect(within(section).getByText("EC P-256")).toBeInTheDocument();
    expect(within(section).getByText("DNS: component.example.com")).toBeInTheDocument();
    expect(within(section).getAllByText(/^Valid · expires in (89|90) days$/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Copy SHA-256" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Copy as JSON/ })).toBeEnabled();
    expect(screen.getByText(/trust stores are not checked/)).toBeInTheDocument();
  });

  it("opens a DER file and shows inline errors for bad input", async () => {
    const cert = await makeCert();
    const { container } = render(<CertificateDecoder />);
    const fileInput = container.querySelector<HTMLInputElement>("#certificate-file")!;
    const file = new File([new Uint8Array(cert.rawData)], "cert.der", { type: "application/x-x509-ca-cert" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByRole("region", { name: /CN=component.example.com/ })).toBeInTheDocument();
    expect((screen.getByLabelText("PEM input") as HTMLTextAreaElement).value).toMatch(/^-----BEGIN CERTIFICATE-----/);

    fireEvent.change(screen.getByLabelText("PEM input"), { target: { value: "not a certificate" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Paste a PEM certificate/);
  });
});
