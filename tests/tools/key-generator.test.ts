/**
 * Tests for the Key Pair Generator: generation, the OpenSSH wire encoding, fingerprints,
 * and reading pasted keys. The fixtures come from ssh-keygen, so these tests compare
 * our encoder byte for byte with OpenSSH.
 */

import { describe, expect, it } from "vitest";
import {
  KEY_TYPES,
  buildKeyOutputs,
  generateKeyPair,
  jwkAlgorithms,
  jwkThumbprint,
  jwkUses,
  openSshPrivateKey,
  parseOpenSshPrivateKey,
  parseSshPublicKey,
  readKey,
  sshFingerprint,
  sshPublicKeyLine,
} from "@/utils/key-generator";
import { signJwt, verifyJwtSignature } from "@/utils/jwt";
import {
  ED25519_PRIVATE,
  ED25519_PUBLIC,
  FINGERPRINTS,
  P256_PRIVATE,
  P256_PUBLIC,
  P521_PUBLIC,
  RSA_PRIVATE,
  RSA_PUBLIC,
} from "./key-generator.fixtures";

const pemBody = (pem: string) => Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");

/** The check value sits right after the public key blob in the openssh-key-v1 container. */
const checkIntOf = (pem: string) => {
  const data = pemBody(pem);
  let offset = 15; // "openssh-key-v1\0"
  for (let i = 0; i < 3; i++) offset += 4 + data.readUInt32BE(offset); // cipher, kdf, kdf options
  offset += 4; // key count
  offset += 4 + data.readUInt32BE(offset); // public key blob
  return data.readUInt32BE(offset + 4);
};

describe("generateKeyPair", () => {
  it.each(KEY_TYPES.map((type) => type.value))("makes a %s key in every format", async (type) => {
    const jwk = await generateKeyPair(type);
    const out = await buildKeyOutputs(jwk, { comment: "me@laptop" });
    expect(out.info.isPrivate).toBe(true);
    expect(out.privatePem).toMatch(/^-----BEGIN PRIVATE KEY-----\n[\s\S]+\n-----END PRIVATE KEY-----$/);
    expect(out.publicPem).toMatch(/^-----BEGIN PUBLIC KEY-----\n[\s\S]+\n-----END PUBLIC KEY-----$/);
    expect(out.sshPrivate).toMatch(/^-----BEGIN OPENSSH PRIVATE KEY-----\n[\s\S]+\n-----END OPENSSH PRIVATE KEY-----\n$/);
    expect(out.sshFingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    expect(out.thumbprint).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const sshType = type.startsWith("rsa") ? "ssh-rsa" : type === "ed25519" ? "ssh-ed25519" : `ecdsa-sha2-nistp${type.slice(4)}`;
    expect(out.sshPublic).toMatch(new RegExp(`^${sshType} [A-Za-z0-9+/=]+ me@laptop$`));

    const publicJwk = JSON.parse(out.publicJwk);
    expect(publicJwk.d).toBeUndefined();
    expect(publicJwk.kid).toBe(out.thumbprint);
    expect(JSON.parse(out.privateJwk!).d).toEqual(expect.any(String));
    expect(JSON.parse(out.jwks)).toEqual({ keys: [publicJwk] });

    if (type.startsWith("rsa")) expect(out.info).toEqual({ label: `RSA ${type.slice(4)}-bit`, bits: Number(type.slice(4)), isPrivate: true });
  });

  it("makes a new key each time", async () => {
    const a = await generateKeyPair("ec-p256");
    const b = await generateKeyPair("ec-p256");
    expect(a.d).not.toBe(b.d);
  });

  it("makes keys the JWT Decoder signs and verifies with", async () => {
    const out = await buildKeyOutputs(await generateKeyPair("ed25519"), { use: "sig", alg: "EdDSA" });
    const token = await signJwt({ alg: "EdDSA", typ: "JWT" }, { sub: "1" }, out.privatePem!);
    expect((await verifyJwtSignature(token, out.publicPem)).status).toBe("valid");
    expect((await verifyJwtSignature(token, out.publicJwk)).status).toBe("valid");
  });
});

describe("OpenSSH encoding matches ssh-keygen", () => {
  it.each([
    ["Ed25519", ED25519_PRIVATE, ED25519_PUBLIC, FINGERPRINTS.ed25519],
    ["ECDSA P-256", P256_PRIVATE, P256_PUBLIC, FINGERPRINTS.p256],
    ["RSA 2048-bit", RSA_PRIVATE, RSA_PUBLIC, FINGERPRINTS.rsa],
  ])("%s: reads the private key and writes the same files", async (label, privateKey, publicKey, fingerprint) => {
    const { jwk, comment } = parseOpenSshPrivateKey(privateKey);
    expect(comment).toBe(publicKey.split(" ")[2]);
    expect(sshPublicKeyLine(jwk, comment)).toBe(publicKey);
    expect(await sshFingerprint(jwk)).toBe(fingerprint);
    // With the same random check value, the private key file is identical.
    expect(await openSshPrivateKey(jwk, comment, checkIntOf(privateKey))).toBe(privateKey);

    const out = await buildKeyOutputs(jwk, { comment });
    expect(out.info.label).toBe(label);
    expect(out.sshFingerprint).toBe(fingerprint);
  });

  it.each([
    [ED25519_PUBLIC, FINGERPRINTS.ed25519, "Ed25519", 256],
    [P256_PUBLIC, FINGERPRINTS.p256, "ECDSA P-256", 256],
    [P521_PUBLIC, FINGERPRINTS.p521, "ECDSA P-521", 521],
    [RSA_PUBLIC, FINGERPRINTS.rsa, "RSA 2048-bit", 2048],
  ])("reads the public key line %#", async (line, fingerprint, label, bits) => {
    const parsed = parseSshPublicKey(line)!;
    expect(sshPublicKeyLine(parsed.jwk, parsed.comment)).toBe(line);
    const out = await buildKeyOutputs(parsed.jwk, { comment: parsed.comment });
    expect(out.sshFingerprint).toBe(fingerprint);
    expect(out.info).toEqual({ label, bits, isPrivate: false });
    expect(out.privatePem).toBeUndefined();
    expect(out.sshPrivate).toBeUndefined();
  });

  it("skips authorized_keys options before the key type", () => {
    const parsed = parseSshPublicKey(`from="10.0.0.1",no-pty ${ED25519_PUBLIC}`)!;
    expect(parsed.comment).toBe("test@ed25519");
    expect(sshPublicKeyLine(parsed.jwk)).toBe(ED25519_PUBLIC.replace(" test@ed25519", ""));
  });

  it("writes an mpint with a leading zero byte when the top bit is set", () => {
    // e = 0x80 needs a zero byte: 00 00 00 02 00 80. n = 0x7f does not: 00 00 00 01 7f.
    const line = sshPublicKeyLine({ kty: "RSA", e: "gA", n: "fw" });
    const blob = Buffer.from(line.split(" ")[1], "base64");
    expect(blob.subarray(11).toString("hex")).toBe("000000020080" + "000000017f");
  });

  it("removes line breaks from the comment", () => {
    expect(sshPublicKeyLine(parseSshPublicKey(ED25519_PUBLIC)!.jwk, "a\nb")).toMatch(/ a b$/);
  });
});

describe("JWK thumbprint", () => {
  it("matches the RFC 7638 example", async () => {
    const jwk = {
      kty: "RSA",
      n: "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
      e: "AQAB",
      alg: "RS256",
      kid: "2011-04-29",
    };
    expect(await jwkThumbprint(jwk)).toBe("NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs");
  });

  it("is the same for the private and the public key", async () => {
    const out = await buildKeyOutputs(await generateKeyPair("ec-p384"));
    expect(await jwkThumbprint(JSON.parse(out.privateJwk!))).toBe(out.thumbprint);
  });
});

describe("JWK hints", () => {
  it("uses the given kid, use and alg", async () => {
    const out = await buildKeyOutputs(await generateKeyPair("ec-p256"), { kid: "key-1", use: "sig", alg: "ES256" });
    expect(JSON.parse(out.publicJwk)).toMatchObject({ kid: "key-1", use: "sig", alg: "ES256" });
    expect(JSON.parse(out.privateJwk!)).toMatchObject({ kid: "key-1", use: "sig", alg: "ES256" });
  });

  it("leaves out use and alg when they are empty", async () => {
    const jwk = JSON.parse((await buildKeyOutputs(await generateKeyPair("ec-p256"), { use: "", alg: "" })).publicJwk);
    expect(Object.keys(jwk).sort()).toEqual(["crv", "kid", "kty", "x", "y"]);
  });

  it("lists the algorithms that fit each key and use", () => {
    expect(jwkAlgorithms({ kty: "RSA" }, "sig")).toEqual(["RS256", "RS384", "RS512", "PS256", "PS384", "PS512"]);
    expect(jwkAlgorithms({ kty: "RSA" }, "enc")).toEqual(["RSA-OAEP", "RSA-OAEP-256"]);
    expect(jwkAlgorithms({ kty: "EC", crv: "P-521" }, "sig")).toEqual(["ES512"]);
    expect(jwkAlgorithms({ kty: "OKP", crv: "Ed25519" }, "")).toEqual(["EdDSA", "Ed25519"]);
    expect(jwkUses({ kty: "OKP" })).toEqual(["sig", ""]);
  });
});

describe("readKey", () => {
  it("reads PKCS#8, SPKI, JWK and JWKS text of the same key", async () => {
    const original = await buildKeyOutputs(await generateKeyPair("ec-p256"), { comment: "c" });
    for (const text of [original.privatePem!, original.privateJwk!, original.sshPrivate!]) {
      const out = await buildKeyOutputs((await readKey(text)).jwk, { comment: "c" });
      expect(out.sshPrivate).toBe(original.sshPrivate);
      expect(out.privatePem).toBe(original.privatePem);
    }
    for (const text of [original.publicPem, original.publicJwk, original.jwks, original.sshPublic]) {
      const out = await buildKeyOutputs((await readKey(text)).jwk, { comment: "c" });
      expect(out.info.isPrivate).toBe(false);
      expect(out.publicPem).toBe(original.publicPem);
      expect(out.sshPublic).toBe(original.sshPublic);
    }
  });

  it("converts an ssh-keygen RSA key to PEM and back", async () => {
    const { jwk, comment } = await readKey(RSA_PRIVATE);
    const out = await buildKeyOutputs(jwk, { comment });
    const again = await buildKeyOutputs((await readKey(out.privatePem!)).jwk, { comment });
    expect(again.sshPublic).toBe(RSA_PUBLIC);
    expect(again.sshPrivate).toBe(out.sshPrivate);
  });

  it("reads PKCS#1 RSA keys", async () => {
    const out = await buildKeyOutputs(await generateKeyPair("rsa-2048"));
    const spki = pemBody(out.publicPem);
    // The SPKI BIT STRING holds the PKCS#1 RSAPublicKey after its unused-bits byte.
    const pkcs1 = spki.subarray(spki.indexOf(Buffer.from([0x03, 0x82]), 4) + 5);
    const pem = `-----BEGIN RSA PUBLIC KEY-----\n${pkcs1.toString("base64")}\n-----END RSA PUBLIC KEY-----`;
    expect((await buildKeyOutputs((await readKey(pem)).jwk)).sshFingerprint).toBe(out.sshFingerprint);
  });

  it("keeps the comment of an OpenSSH key and the hints of a JWK", async () => {
    expect((await readKey(ED25519_PUBLIC)).comment).toBe("test@ed25519");
    const jwk = JSON.stringify({ ...JSON.parse((await buildKeyOutputs(await generateKeyPair("ec-p256"))).publicJwk), kid: "k", use: "sig", alg: "ES256" });
    expect((await readKey(jwk)).hints).toEqual({ kid: "k", use: "sig", alg: "ES256" });
  });

  it.each([
    ["", "Paste a key."],
    ["hello", "The text is not a key. Paste a PEM, JWK, or OpenSSH key."],
    ['{"kty":"oct","k":"AAAA"}', 'The key type "oct" is not supported. Use RSA, EC or OKP (Ed25519).'],
    ['{"kty":"EC","crv":"secp256k1","x":"AA","y":"AA"}', 'The EC curve "secp256k1" is not supported. Use P-256, P-384 or P-521.'],
    ['{"keys":[]}', "The JWKS has 0 keys. Paste one key."],
    ["ssh-dss AAAAB3NzaC1kc3MAAACBAP", 'The SSH key type "ssh-dss" is not supported.'],
    ["ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB", "The SSH key data is truncated."],
    ["ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAAQA=", "The Ed25519 public key must be 32 bytes."],
    ["-----BEGIN ENCRYPTED PRIVATE KEY-----\nAAAA\n-----END ENCRYPTED PRIVATE KEY-----", "The private key is encrypted. Decrypt it first, for example with openssl pkcs8."],
  ])("explains bad input %#", async (text, message) => {
    await expect(readKey(text)).rejects.toThrow(message);
  });

  it("explains an OpenSSH key with a passphrase", async () => {
    const data = pemBody(ED25519_PRIVATE);
    // Replace the cipher name "none" with "aes256-ctr" (and its length) to mimic an encrypted key.
    const encrypted = Buffer.concat([data.subarray(0, 15), Buffer.from([0, 0, 0, 10]), Buffer.from("aes256-ctr"), data.subarray(23)]);
    const pem = `-----BEGIN OPENSSH PRIVATE KEY-----\n${encrypted.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
    await expect(readKey(pem)).rejects.toThrow("The OpenSSH private key has a passphrase. Remove it first with ssh-keygen -p, or paste the public key.");
  });
});
