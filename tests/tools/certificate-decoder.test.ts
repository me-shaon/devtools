import { beforeAll, describe, expect, it } from "vitest";
import {
  certificateFileToText,
  certificateSummaryJson,
  decodeCertificates,
  formatHexBytes,
  loadX509,
  validityStatus,
} from "@/utils/certificate";

type X509 = Awaited<ReturnType<typeof loadX509>>;

const RSA = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048 };
const EC = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
const DAY = 86_400_000;

let x509: X509;
let selfSignedPem: string;
let selfSignedDer: Uint8Array;
let rootPem: string;
let leafPem: string;
let impostorRootPem: string;
let csrPem: string;

const ecKeys = () => crypto.subtle.generateKey(EC, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;

beforeAll(async () => {
  x509 = await loadX509();

  const rsaKeys = (await crypto.subtle.generateKey(RSA, true, ["sign", "verify"])) as CryptoKeyPair;
  const selfSigned = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01ab",
    name: "CN=example.com, O=Acme, C=US",
    notBefore: new Date(Date.now() - DAY),
    notAfter: new Date(Date.now() + 42.5 * DAY),
    signingAlgorithm: RSA,
    keys: rsaKeys,
    extensions: [
      new x509.BasicConstraintsExtension(true, 1, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      new x509.SubjectAlternativeNameExtension([
        { type: "dns", value: "example.com" },
        { type: "ip", value: "10.0.0.1" },
        { type: "email", value: "admin@example.com" },
        { type: "url", value: "https://example.com/" },
      ]),
      await x509.SubjectKeyIdentifierExtension.create(rsaKeys.publicKey),
      new x509.CRLDistributionPointsExtension(["http://crl.example.com/root.crl"]),
      new x509.AuthorityInfoAccessExtension({ ocsp: "http://ocsp.example.com", caIssuers: "http://ca.example.com/root.crt" }),
    ],
  });
  selfSignedPem = selfSigned.toString("pem");
  selfSignedDer = new Uint8Array(selfSigned.rawData);

  const rootKeys = await ecKeys();
  const root = await x509.X509CertificateGenerator.createSelfSigned({
    name: "CN=Test Root CA",
    keys: rootKeys,
    signingAlgorithm: EC,
    notBefore: new Date(Date.now() - DAY),
    notAfter: new Date(Date.now() + 365 * DAY),
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)],
  });
  rootPem = root.toString("pem");

  const leafKeys = await ecKeys();
  const leaf = await x509.X509CertificateGenerator.create({
    subject: "CN=leaf.example.com",
    issuer: root.subject,
    publicKey: leafKeys.publicKey,
    signingKey: rootKeys.privateKey,
    signingAlgorithm: EC,
    notBefore: new Date(Date.now() - 10 * DAY),
    notAfter: new Date(Date.now() - 3.2 * DAY),
    extensions: [await x509.AuthorityKeyIdentifierExtension.create(rootKeys.publicKey)],
  });
  leafPem = leaf.toString("pem");

  // Same subject name as the root, different key: the issuer matches but the signature cannot verify
  const impostor = await x509.X509CertificateGenerator.createSelfSigned({
    name: "CN=Test Root CA",
    keys: await ecKeys(),
    signingAlgorithm: EC,
  });
  impostorRootPem = impostor.toString("pem");

  const csr = await x509.Pkcs10CertificateRequestGenerator.create({
    name: "CN=csr.example.com, O=Acme",
    keys: await ecKeys(),
    signingAlgorithm: EC,
    extensions: [new x509.SubjectAlternativeNameExtension([{ type: "dns", value: "csr.example.com" }])],
  });
  csrPem = csr.toString("pem");
});

describe("decodeCertificates", () => {
  it("reads the fields of a self-signed certificate", async () => {
    const { certificates, chain } = await decodeCertificates(selfSignedPem);
    expect(chain).toBeNull();
    const [cert] = certificates;
    expect(cert.subject).toEqual(["CN=example.com", "O=Acme", "C=US"]);
    expect(cert.issuer).toEqual(cert.subject);
    expect(cert.serialNumber).toBe("01:AB");
    expect(cert.publicKey).toBe("RSA 2048");
    expect(cert.signatureAlgorithm).toBe("SHA-256 with RSA");
    expect(cert.subjectAltNames).toEqual([
      { type: "DNS", value: "example.com" },
      { type: "IP", value: "10.0.0.1" },
      { type: "Email", value: "admin@example.com" },
      { type: "URI", value: "https://example.com/" },
    ]);
    expect(cert.keyUsage).toEqual(["Digital signature", "Certificate signing"]);
    expect(cert.extendedKeyUsage).toEqual(["TLS server authentication (1.3.6.1.5.5.7.3.1)"]);
    expect(cert.basicConstraints).toEqual({ ca: true, pathLength: 1, critical: true });
    expect(cert.subjectKeyId).toMatch(/^([0-9A-F]{2}:){19}[0-9A-F]{2}$/);
    expect(cert.crlDistributionPoints).toEqual(["http://crl.example.com/root.crl"]);
    expect(cert.ocspUrls).toEqual(["http://ocsp.example.com"]);
    expect(cert.caIssuerUrls).toEqual(["http://ca.example.com/root.crt"]);
    expect(cert.selfSigned).toBe(true);
  });

  it("computes SHA-1 and SHA-256 fingerprints over the DER bytes", async () => {
    const [cert] = (await decodeCertificates(selfSignedPem)).certificates;
    const hex = async (alg: string) =>
      Array.from(new Uint8Array(await crypto.subtle.digest(alg, selfSignedDer)), (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(":");
    expect(cert.sha1).toBe(await hex("SHA-1"));
    expect(cert.sha256).toBe(await hex("SHA-256"));
    expect(cert.sha256.split(":")).toHaveLength(32);
  });

  it("orders a chain leaf first and verifies each link", async () => {
    const { certificates, chain } = await decodeCertificates(`${rootPem}\n${leafPem}`);
    expect(certificates.map((c) => c.subjectText)).toEqual(["CN=leaf.example.com", "CN=Test Root CA"]);
    expect(certificates[0].publicKey).toBe("EC P-256");
    expect(certificates[0].signatureAlgorithm).toBe("ECDSA with SHA-256");
    expect(certificates[0].authorityKeyId).not.toBe("");
    expect(certificates[0].selfSigned).toBe(false);
    expect(chain).toMatchObject({ ok: true, ordered: true, endsAtRoot: true, message: "Chain links verify" });
    expect(chain?.links).toEqual([{ from: 0, to: 1, issuerMatches: true, signatureValid: true }]);
  });

  it("reports the failing link when a signature does not verify", async () => {
    const { chain } = await decodeCertificates(`${leafPem}\n${impostorRootPem}`);
    expect(chain?.ok).toBe(false);
    expect(chain?.links[0]).toMatchObject({ issuerMatches: true, signatureValid: false });
    expect(chain?.message).toBe("Link 1 → 2 fails: the signature does not verify");
  });

  it("reports an issuer mismatch", async () => {
    const { chain } = await decodeCertificates(`${leafPem}\n${selfSignedPem}`);
    expect(chain?.ok).toBe(false);
    expect(chain?.message).toMatch(/issuer does not match/);
    expect(chain?.message).toMatch(/pasted order/);
  });

  it("accepts base64 DER without PEM lines", async () => {
    const base64 = btoa(String.fromCharCode(...selfSignedDer));
    const [cert] = (await decodeCertificates(base64)).certificates;
    expect(cert.subjectText).toBe("CN=example.com, O=Acme, C=US");
  });

  it("parses a certificate request", async () => {
    const { certificates, requests } = await decodeCertificates(csrPem);
    expect(certificates).toHaveLength(0);
    expect(requests[0]).toMatchObject({
      subject: ["CN=csr.example.com", "O=Acme"],
      subjectAltNames: [{ type: "DNS", value: "csr.example.com" }],
      publicKey: "EC P-256",
      signatureValid: true,
    });
  });

  it("skips other PEM blocks with a note and rejects junk", async () => {
    const { notes, certificates } = await decodeCertificates(`-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n${selfSignedPem}`);
    expect(certificates).toHaveLength(1);
    expect(notes[0]).toMatch(/Skipped a PRIVATE KEY block/);
    await expect(decodeCertificates("hello world")).rejects.toThrow(/Paste a PEM certificate/);
    await expect(decodeCertificates("-----BEGIN CERTIFICATE-----\nMIIB")).rejects.toThrow(/without a matching END/);
    await expect(decodeCertificates("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----")).rejects.toThrow(/not a valid X.509/);
  });
});

describe("certificateFileToText", () => {
  it("converts DER bytes to PEM and keeps PEM text", async () => {
    const pem = await certificateFileToText(selfSignedDer);
    expect(pem).toMatch(/^-----BEGIN CERTIFICATE-----/);
    expect((await decodeCertificates(pem)).certificates[0].serialNumber).toBe("01:AB");
    expect(await certificateFileToText(new TextEncoder().encode(rootPem))).toBe(rootPem);
    await expect(certificateFileToText(new Uint8Array([0xff, 0x00, 0x01]))).rejects.toThrow();
  });
});

describe("validityStatus and helpers", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  it("labels each state", () => {
    expect(validityStatus(new Date("2025-01-01"), new Date(now.getTime() + 42 * DAY + 1000), now)).toEqual({
      state: "valid",
      label: "Valid · expires in 42 days",
    });
    expect(validityStatus(new Date("2025-01-01"), new Date(now.getTime() + 5 * DAY), now).state).toBe("expiring");
    expect(validityStatus(new Date("2025-01-01"), new Date(now.getTime() - 3 * DAY), now).label).toBe("Expired 3 days ago");
    expect(validityStatus(new Date(now.getTime() + 2 * 3_600_000), new Date("2027-01-01"), now).label).toBe("Not yet valid · starts in 2 hours");
  });

  it("labels the expired leaf from a generated chain", async () => {
    const [leaf] = (await decodeCertificates(`${leafPem}\n${rootPem}`)).certificates;
    expect(validityStatus(leaf.notBefore, leaf.notAfter).label).toBe("Expired 3 days ago");
  });

  it("formats hex bytes", () => {
    expect(formatHexBytes("abc")).toBe("0A:BC");
  });

  it("writes a JSON summary without PEM bodies", async () => {
    const json = JSON.parse(certificateSummaryJson(await decodeCertificates(`${rootPem}\n${leafPem}`)));
    expect(json.certificates).toHaveLength(2);
    expect(json.certificates[0].pem).toBeUndefined();
    expect(json.chain.ok).toBe(true);
  });
});
